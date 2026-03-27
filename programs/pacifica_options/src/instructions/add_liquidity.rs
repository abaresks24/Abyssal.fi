use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};
use crate::state::vault::OptionVault;
use crate::state::amm_pool::AmmPool;
use crate::state::position::{LPPosition, OptionType};
use crate::state::vault::Market;
use crate::math::fixed_point::{fp_sqrt, SCALE};
use crate::error::OptionsError;
use crate::instructions::buy_option::{market_from_u8, option_type_from_u8};

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct AddLiquidityArgs {
    pub market_discriminant: u8,
    pub option_type: u8,
    pub strike: u64,
    pub expiry: i64,
    /// USDC amount to deposit, 6 dec
    pub usdc_amount: u64,
    /// Minimum LP tokens to receive (slippage protection)
    pub min_lp_tokens: u64,
}

#[derive(Accounts)]
#[instruction(args: AddLiquidityArgs)]
pub struct AddLiquidity<'info> {
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
        init_if_needed,
        payer = provider,
        space = LPPosition::LEN,
        seeds = [
            b"lp_position",
            provider.key().as_ref(),
            amm_pool.key().as_ref(),
        ],
        bump
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
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

pub fn handler(ctx: Context<AddLiquidity>, args: AddLiquidityArgs) -> Result<()> {
    require!(!ctx.accounts.vault.paused, OptionsError::ProtocolPaused);
    require!(args.usdc_amount > 0, OptionsError::InsufficientUsdc);

    let clock = Clock::get()?;
    let pool = &ctx.accounts.amm_pool;

    // Compute LP tokens to mint
    let lp_tokens = if pool.total_lp_tokens == 0 {
        // First deposit: LP tokens = sqrt(usdc_amount * options_amount)
        // Since options reserve starts at 0, we seed it proportionally
        // For initial deposit, LP tokens = usdc_amount (geometric mean init)
        args.usdc_amount
    } else {
        // Proportional to existing pool
        // lp_tokens = usdc_amount * total_lp_tokens / reserve_usdc
        if pool.reserve_usdc == 0 {
            args.usdc_amount
        } else {
            (args.usdc_amount as u128)
                .checked_mul(pool.total_lp_tokens as u128)
                .ok_or(OptionsError::MathOverflow)?
                .checked_div(pool.reserve_usdc as u128)
                .ok_or(OptionsError::DivisionByZero)? as u64
        }
    };

    require!(lp_tokens > 0, OptionsError::ZeroLpTokens);
    require!(lp_tokens >= args.min_lp_tokens, OptionsError::MinLpTokensNotMet);

    // Transfer USDC from provider to vault
    let cpi_ctx = CpiContext::new(
        ctx.accounts.token_program.to_account_info(),
        Transfer {
            from: ctx.accounts.provider_usdc.to_account_info(),
            to: ctx.accounts.usdc_vault.to_account_info(),
            authority: ctx.accounts.provider.to_account_info(),
        },
    );
    token::transfer(cpi_ctx, args.usdc_amount)?;

    // Update pool
    let pool = &mut ctx.accounts.amm_pool;
    pool.reserve_usdc = pool.reserve_usdc
        .checked_add(args.usdc_amount)
        .ok_or(OptionsError::MathOverflow)?;
    pool.total_lp_tokens = pool.total_lp_tokens
        .checked_add(lp_tokens)
        .ok_or(OptionsError::MathOverflow)?;

    // Update k invariant
    let new_k = (pool.reserve_options as u128).saturating_mul(pool.reserve_usdc as u128);
    pool.set_k_invariant(new_k);

    // Update LP position
    let lp_pos = &mut ctx.accounts.lp_position;
    if lp_pos.owner == Pubkey::default() {
        lp_pos.bump = ctx.bumps.lp_position;
        lp_pos.owner = ctx.accounts.provider.key();
        lp_pos.pool = ctx.accounts.amm_pool.key();
        lp_pos.created_at = clock.unix_timestamp;
        lp_pos._padding = [0u8; 32];
    }
    lp_pos.lp_tokens = lp_pos.lp_tokens
        .checked_add(lp_tokens)
        .ok_or(OptionsError::MathOverflow)?;
    lp_pos.usdc_deposited = lp_pos.usdc_deposited
        .checked_add(args.usdc_amount)
        .ok_or(OptionsError::MathOverflow)?;

    // Update vault total collateral
    let vault = &mut ctx.accounts.vault;
    vault.total_collateral = vault.total_collateral
        .checked_add(args.usdc_amount)
        .ok_or(OptionsError::MathOverflow)?;

    msg!(
        "Liquidity added: usdc={} lp_tokens_minted={} pool_total_lp={}",
        args.usdc_amount, lp_tokens, ctx.accounts.amm_pool.total_lp_tokens
    );
    Ok(())
}

// ── Initialize AMM Pool (admin only) ────────────────────────────────────────

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct InitAmmPoolArgs {
    pub market_discriminant: u8,
    pub option_type: u8,
    pub strike: u64,
    pub expiry: i64,
    pub initial_options: u64,
    pub initial_usdc: u64,
}

#[derive(Accounts)]
#[instruction(args: InitAmmPoolArgs)]
pub struct InitializeAmmPool<'info> {
    #[account(
        mut,
        seeds = [b"vault", vault.authority.as_ref()],
        bump = vault.bump,
    )]
    pub vault: Box<Account<'info, OptionVault>>,

    #[account(
        init,
        payer = authority,
        space = AmmPool::LEN,
        seeds = [
            b"amm_pool",
            vault.key().as_ref(),
            &[args.market_discriminant],
            &[args.option_type],
            &args.strike.to_le_bytes(),
            &args.expiry.to_le_bytes(),
        ],
        bump
    )]
    pub amm_pool: Box<Account<'info, AmmPool>>,

    #[account(
        mut,
        constraint = authority.key() == vault.authority @ OptionsError::Unauthorized
    )]
    pub authority: Signer<'info>,

    pub system_program: Program<'info, System>,
}

pub fn initialize_amm_pool(
    ctx: Context<InitializeAmmPool>,
    args: InitAmmPoolArgs,
) -> Result<()> {
    let market = market_from_u8(args.market_discriminant)?;
    let option_type = option_type_from_u8(args.option_type)?;

    let pool = &mut ctx.accounts.amm_pool;
    pool.bump = ctx.bumps.amm_pool;
    pool.vault = ctx.accounts.vault.key();
    pool.market = market;
    pool.option_type = option_type;
    pool.strike = args.strike;
    pool.expiry = args.expiry;
    pool.reserve_options = args.initial_options;
    pool.reserve_usdc = args.initial_usdc;

    let k = (args.initial_options as u128).saturating_mul(args.initial_usdc as u128);
    pool.set_k_invariant(k);

    // Initial LP tokens = sqrt(options * usdc)
    let k_sqrt = fp_sqrt(k.min(u64::MAX as u128) as u64).unwrap_or(args.initial_usdc);
    pool.total_lp_tokens = k_sqrt;
    pool.fees_earned = 0;
    pool.last_rebalance = Clock::get()?.unix_timestamp;
    pool._padding = [0u8; 32];

    msg!(
        "AMM pool initialized: market={:?} type={:?} strike={} expiry={} k={}",
        market, option_type, args.strike, args.expiry, k
    );
    Ok(())
}
