use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};
use crate::state::vault::OptionVault;
use crate::state::position::VaultLPPosition;
use crate::error::OptionsError;

// ── Deposit Vault ─────────────────────────────────────────────────────────────

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct DepositVaultArgs {
    /// USDC amount to deposit, 6 dec
    pub usdc_amount: u64,
    /// Minimum vLP tokens expected (slippage protection, use 0 to skip)
    pub min_vlp_tokens: u64,
}

#[derive(Accounts)]
pub struct DepositVault<'info> {
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
        init_if_needed,
        payer = depositor,
        space = VaultLPPosition::LEN,
        seeds = [
            b"vault_lp_position",
            depositor.key().as_ref(),
            vault.key().as_ref(),
        ],
        bump
    )]
    pub vlp_position: Box<Account<'info, VaultLPPosition>>,

    #[account(
        mut,
        token::mint = vault.usdc_mint,
        token::authority = depositor,
    )]
    pub depositor_usdc: Box<Account<'info, TokenAccount>>,

    #[account(mut)]
    pub depositor: Signer<'info>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

pub fn deposit_vault(ctx: Context<DepositVault>, args: DepositVaultArgs) -> Result<()> {
    require!(!ctx.accounts.vault.paused, OptionsError::ProtocolPaused);
    require!(args.usdc_amount > 0, OptionsError::InsufficientUsdc);

    let clock = Clock::get()?;
    let vault = &ctx.accounts.vault;

    // vLP price = total_collateral / total_vlp_tokens
    // vlp_to_mint = usdc_amount * total_vlp_tokens / total_collateral
    // First deposit: seed at 1 vLP = 1 USDC
    let vlp_tokens = if vault.total_vlp_tokens == 0 || vault.total_collateral == 0 {
        args.usdc_amount
    } else {
        (args.usdc_amount as u128)
            .checked_mul(vault.total_vlp_tokens as u128)
            .ok_or(OptionsError::MathOverflow)?
            .checked_div(vault.total_collateral as u128)
            .ok_or(OptionsError::DivisionByZero)? as u64
    };

    require!(vlp_tokens > 0, OptionsError::ZeroLpTokens);
    require!(vlp_tokens >= args.min_vlp_tokens, OptionsError::MinLpTokensNotMet);

    // Transfer USDC from depositor to vault
    let cpi_ctx = CpiContext::new(
        ctx.accounts.token_program.to_account_info(),
        Transfer {
            from: ctx.accounts.depositor_usdc.to_account_info(),
            to: ctx.accounts.usdc_vault.to_account_info(),
            authority: ctx.accounts.depositor.to_account_info(),
        },
    );
    token::transfer(cpi_ctx, args.usdc_amount)?;

    // Update vault totals
    let vault = &mut ctx.accounts.vault;
    vault.total_collateral = vault.total_collateral
        .checked_add(args.usdc_amount)
        .ok_or(OptionsError::MathOverflow)?;
    vault.total_vlp_tokens = vault.total_vlp_tokens
        .checked_add(vlp_tokens)
        .ok_or(OptionsError::MathOverflow)?;

    // Update vLP position (init if first deposit)
    let pos = &mut ctx.accounts.vlp_position;
    if pos.owner == Pubkey::default() {
        pos.bump = ctx.bumps.vlp_position;
        pos.owner = ctx.accounts.depositor.key();
        pos.vault = ctx.accounts.vault.key();
        pos.created_at = clock.unix_timestamp;
        pos._padding = [0u8; 32];
    }
    pos.vlp_tokens = pos.vlp_tokens
        .checked_add(vlp_tokens)
        .ok_or(OptionsError::MathOverflow)?;
    pos.usdc_deposited = pos.usdc_deposited
        .checked_add(args.usdc_amount)
        .ok_or(OptionsError::MathOverflow)?;

    msg!(
        "Vault deposit: usdc={} vlp_minted={} total_vlp={} total_collateral={}",
        args.usdc_amount, vlp_tokens,
        ctx.accounts.vault.total_vlp_tokens, ctx.accounts.vault.total_collateral
    );
    Ok(())
}

// ── Withdraw Vault ────────────────────────────────────────────────────────────

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct WithdrawVaultArgs {
    /// vLP tokens to burn
    pub vlp_tokens: u64,
    /// Minimum USDC to receive (slippage protection, use 0 to skip)
    pub min_usdc_out: u64,
}

#[derive(Accounts)]
#[instruction(args: WithdrawVaultArgs)]
pub struct WithdrawVault<'info> {
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
            b"vault_lp_position",
            withdrawer.key().as_ref(),
            vault.key().as_ref(),
        ],
        bump = vlp_position.bump,
        constraint = vlp_position.owner == withdrawer.key() @ OptionsError::Unauthorized,
        constraint = vlp_position.vlp_tokens >= args.vlp_tokens @ OptionsError::InsufficientLpTokens,
    )]
    pub vlp_position: Box<Account<'info, VaultLPPosition>>,

    #[account(
        mut,
        token::mint = vault.usdc_mint,
        token::authority = withdrawer,
    )]
    pub withdrawer_usdc: Box<Account<'info, TokenAccount>>,

    #[account(mut)]
    pub withdrawer: Signer<'info>,

    pub token_program: Program<'info, Token>,
}

pub fn withdraw_vault(ctx: Context<WithdrawVault>, args: WithdrawVaultArgs) -> Result<()> {
    require!(!ctx.accounts.vault.paused, OptionsError::ProtocolPaused);
    require!(args.vlp_tokens > 0, OptionsError::ZeroLpTokens);

    let vault = &ctx.accounts.vault;
    require!(vault.total_vlp_tokens > 0, OptionsError::InsufficientLiquidity);

    // usdc_out = vlp_tokens * total_collateral / total_vlp_tokens
    let usdc_out = (args.vlp_tokens as u128)
        .checked_mul(vault.total_collateral as u128)
        .ok_or(OptionsError::MathOverflow)?
        .checked_div(vault.total_vlp_tokens as u128)
        .ok_or(OptionsError::DivisionByZero)? as u64;

    require!(usdc_out > 0, OptionsError::InsufficientLiquidity);
    require!(usdc_out >= args.min_usdc_out, OptionsError::SlippageExceeded);
    require!(
        ctx.accounts.usdc_vault.amount >= usdc_out,
        OptionsError::InsufficientCollateral
    );

    // Solvency guard: remaining vault USDC must still cover 120% of open interest
    let remaining = ctx.accounts.usdc_vault.amount
        .checked_sub(usdc_out)
        .ok_or(OptionsError::InsufficientCollateral)?;
    let min_required = (vault.open_interest as u128)
        .checked_mul(120)
        .ok_or(OptionsError::MathOverflow)?
        .checked_div(100)
        .ok_or(OptionsError::MathOverflow)? as u64;
    require!(remaining >= min_required, OptionsError::InsufficientCollateral);

    // Transfer USDC from vault to withdrawer (vault is PDA signer)
    let authority_key = ctx.accounts.vault.authority;
    let vault_bump = ctx.accounts.vault.bump;
    let vault_seeds: &[&[u8]] = &[b"vault", authority_key.as_ref(), &[vault_bump]];
    let signer_seeds = &[vault_seeds];

    let cpi_ctx = CpiContext::new_with_signer(
        ctx.accounts.token_program.to_account_info(),
        Transfer {
            from: ctx.accounts.usdc_vault.to_account_info(),
            to: ctx.accounts.withdrawer_usdc.to_account_info(),
            authority: ctx.accounts.vault.to_account_info(),
        },
        signer_seeds,
    );
    token::transfer(cpi_ctx, usdc_out)?;

    // Update vault totals
    let vault = &mut ctx.accounts.vault;
    vault.total_collateral = vault.total_collateral.saturating_sub(usdc_out);
    vault.total_vlp_tokens = vault.total_vlp_tokens.saturating_sub(args.vlp_tokens);

    // Update vLP position
    let pos = &mut ctx.accounts.vlp_position;
    // Reduce usdc_deposited proportionally to vLP burned
    let total_before = pos.vlp_tokens; // still includes args.vlp_tokens
    let deposited_reduction = if total_before > 0 {
        (args.vlp_tokens as u128)
            .checked_mul(pos.usdc_deposited as u128)
            .unwrap_or(0)
            .checked_div(total_before as u128)
            .unwrap_or(0) as u64
    } else {
        0
    };
    pos.vlp_tokens = pos.vlp_tokens.saturating_sub(args.vlp_tokens);
    pos.usdc_deposited = pos.usdc_deposited.saturating_sub(deposited_reduction);

    msg!(
        "Vault withdrawal: vlp_burned={} usdc_out={} remaining_collateral={}",
        args.vlp_tokens, usdc_out, ctx.accounts.vault.total_collateral
    );
    Ok(())
}
