use anchor_lang::prelude::*;
use anchor_spl::token::{Mint, Token, TokenAccount};
use crate::state::vault::{OptionVault, IVParams};
use crate::error::OptionsError;

#[derive(Accounts)]
pub struct InitializeVault<'info> {
    #[account(
        init,
        payer = authority,
        space = OptionVault::LEN,
        seeds = [b"vault", authority.key().as_ref()],
        bump
    )]
    pub vault: Account<'info, OptionVault>,

    /// The USDC token account that the vault will control
    #[account(
        init,
        payer = authority,
        token::mint = usdc_mint,
        token::authority = vault,
        seeds = [b"vault_usdc", vault.key().as_ref()],
        bump
    )]
    pub usdc_vault: Account<'info, TokenAccount>,

    /// USDC mint (6 decimals)
    pub usdc_mint: Account<'info, Mint>,

    /// Protocol admin / authority
    #[account(mut)]
    pub authority: Signer<'info>,

    /// Keeper address (can be same as authority initially)
    /// CHECK: just stored as pubkey
    pub keeper: UncheckedAccount<'info>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

pub fn handler(ctx: Context<InitializeVault>) -> Result<()> {
    let vault = &mut ctx.accounts.vault;
    let clock = Clock::get()?;

    vault.bump = ctx.bumps.vault;
    vault.authority = ctx.accounts.authority.key();
    vault.keeper = ctx.accounts.keeper.key();
    vault.usdc_mint = ctx.accounts.usdc_mint.key();
    vault.usdc_vault = ctx.accounts.usdc_vault.key();
    vault.total_collateral = 0;
    vault.open_interest = 0;
    vault.delta_net = 0;
    vault.iv_params = IVParams {
        iv_atm: 500_000,       // 50% initial ATM IV
        iv_skew_rho: -50_000,  // slight negative skew
        iv_curvature_phi: 100_000, // moderate curvature
        theta_param: 1_000_000, // θ=1 (no term structure adjustment initially)
    };
    vault.last_iv_update = clock.unix_timestamp;
    vault.fees_collected = 0;
    vault.paused = false;
    vault._padding = [0u8; 64];

    msg!(
        "PacificaOptions vault initialized. Authority: {}, Keeper: {}",
        vault.authority,
        vault.keeper
    );
    Ok(())
}

// ── Pause / Unpause (authority-only) ────────────────────────────────────────

#[derive(Accounts)]
pub struct PauseVault<'info> {
    #[account(
        mut,
        seeds = [b"vault", vault.authority.as_ref()],
        bump = vault.bump,
        constraint = authority.key() == vault.authority @ OptionsError::Unauthorized
    )]
    pub vault: Box<Account<'info, OptionVault>>,

    pub authority: Signer<'info>,
}

pub fn pause_vault(ctx: Context<PauseVault>) -> Result<()> {
    ctx.accounts.vault.paused = true;
    msg!("Vault paused");
    Ok(())
}

pub fn unpause_vault(ctx: Context<PauseVault>) -> Result<()> {
    ctx.accounts.vault.paused = false;
    msg!("Vault unpaused");
    Ok(())
}
