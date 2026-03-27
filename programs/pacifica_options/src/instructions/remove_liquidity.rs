use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};
use crate::state::vault::OptionVault;
use crate::state::amm_pool::AmmPool;
use crate::state::position::LPPosition;
use crate::error::OptionsError;

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct RemoveLiquidityArgs {
    pub market_discriminant: u8,
    pub option_type: u8,
    pub strike: u64,
    pub expiry: i64,
    /// LP tokens to burn
    pub lp_tokens: u64,
    /// Minimum USDC to receive (slippage protection), 6 dec
    pub min_usdc_out: u64,
}

#[derive(Accounts)]
#[instruction(args: RemoveLiquidityArgs)]
pub struct RemoveLiquidity<'info> {
    #[account(
        mut,
        seeds = [b"vault", vault.authority.as_ref()],
        bump = vault.bump,
    )]
    pub vault: Box<Account<'info, OptionVault>>,

    #[account(
        mut,
        seeds = [b"vault_usdc", vault.key().as_ref()],
        bump,
        token::mint = vault.usdc_mint,
        token::authority = vault,
    )]
    pub usdc_vault: Box<Account<'info, TokenAccount>>,

    #[account(
        mut,
        seeds = [
            b"amm_pool",
            vault.key().as_ref(),
            &[args.market_discriminant],
            &[args.option_type],
            &args.strike.to_le_bytes(),
            &args.expiry.to_le_bytes(),
        ],
        bump = amm_pool.bump,
        constraint = amm_pool.vault == vault.key()
    )]
    pub amm_pool: Box<Account<'info, AmmPool>>,

    #[account(
        mut,
        seeds = [
            b"lp_position",
            provider.key().as_ref(),
            amm_pool.key().as_ref(),
        ],
        bump = lp_position.bump,
        constraint = lp_position.owner == provider.key() @ OptionsError::Unauthorized,
        constraint = lp_position.lp_tokens >= args.lp_tokens @ OptionsError::InsufficientLpTokens,
    )]
    pub lp_position: Box<Account<'info, LPPosition>>,

    #[account(
        mut,
        token::mint = vault.usdc_mint,
        token::authority = provider,
    )]
    pub provider_usdc: Box<Account<'info, TokenAccount>>,

    #[account(mut)]
    pub provider: Signer<'info>,

    pub token_program: Program<'info, Token>,
}

pub fn handler(ctx: Context<RemoveLiquidity>, args: RemoveLiquidityArgs) -> Result<()> {
    require!(!ctx.accounts.vault.paused, OptionsError::ProtocolPaused);
    require!(args.lp_tokens > 0, OptionsError::ZeroLpTokens);

    let pool = &ctx.accounts.amm_pool;
    require!(pool.total_lp_tokens > 0, OptionsError::InsufficientLiquidity);

    // Compute USDC to return: proportional to LP share
    // usdc_out = (lp_tokens / total_lp_tokens) * reserve_usdc
    let usdc_out = (args.lp_tokens as u128)
        .checked_mul(pool.reserve_usdc as u128)
        .ok_or(OptionsError::MathOverflow)?
        .checked_div(pool.total_lp_tokens as u128)
        .ok_or(OptionsError::DivisionByZero)? as u64;

    require!(usdc_out > 0, OptionsError::InsufficientLiquidity);
    require!(usdc_out >= args.min_usdc_out, OptionsError::SlippageExceeded);
    require!(
        ctx.accounts.usdc_vault.amount >= usdc_out,
        OptionsError::InsufficientCollateral
    );
    // Solvency guard: remaining vault USDC must still cover 120% of open interest
    let remaining_vault = ctx.accounts.usdc_vault.amount
        .checked_sub(usdc_out)
        .ok_or(OptionsError::InsufficientCollateral)?;
    let min_required = (ctx.accounts.vault.open_interest as u128)
        .checked_mul(120)
        .ok_or(OptionsError::MathOverflow)?
        .checked_div(100)
        .ok_or(OptionsError::MathOverflow)? as u64;
    require!(
        remaining_vault >= min_required,
        OptionsError::InsufficientCollateral
    );

    // Also compute proportional option share
    let options_out = (args.lp_tokens as u128)
        .checked_mul(pool.reserve_options as u128)
        .ok_or(OptionsError::MathOverflow)?
        .checked_div(pool.total_lp_tokens as u128)
        .ok_or(OptionsError::DivisionByZero)? as u64;

    // Transfer USDC from vault to provider
    let authority_key = ctx.accounts.vault.authority;
    let vault_bump = ctx.accounts.vault.bump;
    let vault_seeds: &[&[u8]] = &[
        b"vault",
        authority_key.as_ref(),
        &[vault_bump],
    ];
    let signer_seeds = &[vault_seeds];

    let cpi_ctx = CpiContext::new_with_signer(
        ctx.accounts.token_program.to_account_info(),
        Transfer {
            from: ctx.accounts.usdc_vault.to_account_info(),
            to: ctx.accounts.provider_usdc.to_account_info(),
            authority: ctx.accounts.vault.to_account_info(),
        },
        signer_seeds,
    );
    token::transfer(cpi_ctx, usdc_out)?;

    // Update pool
    let pool = &mut ctx.accounts.amm_pool;
    pool.reserve_usdc = pool.reserve_usdc.saturating_sub(usdc_out);
    pool.reserve_options = pool.reserve_options.saturating_sub(options_out);
    pool.total_lp_tokens = pool.total_lp_tokens.saturating_sub(args.lp_tokens);

    // Recalculate k
    let new_k = (pool.reserve_options as u128).saturating_mul(pool.reserve_usdc as u128);
    pool.set_k_invariant(new_k);

    // Update LP position
    let lp_pos = &mut ctx.accounts.lp_position;
    lp_pos.lp_tokens = lp_pos.lp_tokens.saturating_sub(args.lp_tokens);
    // Proportionally reduce usdc_deposited
    let usdc_deposited_reduction = (args.lp_tokens as u128)
        .checked_mul(lp_pos.usdc_deposited as u128)
        .unwrap_or(0)
        .checked_div(
            (lp_pos.lp_tokens + args.lp_tokens) as u128
        )
        .unwrap_or(0) as u64;
    lp_pos.usdc_deposited = lp_pos.usdc_deposited.saturating_sub(usdc_deposited_reduction);

    // Update vault
    let vault = &mut ctx.accounts.vault;
    vault.total_collateral = vault.total_collateral.saturating_sub(usdc_out);

    msg!(
        "Liquidity removed: lp_burned={} usdc_out={} options_out={}",
        args.lp_tokens, usdc_out, options_out
    );
    Ok(())
}
