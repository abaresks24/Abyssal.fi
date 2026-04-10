use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, Token, TokenAccount};
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
    vault.total_vlp_tokens = 0;
    vault.vlp_mint = Pubkey::default();
    vault._padding = [0u8; 24];

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

// ── Migrate USDC mint (authority-only, devnet) ──────────────────────────────
//
// Step 1: close old vault_usdc token account, update vault.usdc_mint.
// Step 2: (separate tx) re-init vault_usdc with the new mint via reinit_vault_usdc.

#[derive(Accounts)]
pub struct MigrateUsdcMintClose<'info> {
    #[account(
        mut,
        seeds = [b"vault", vault.authority.as_ref()],
        bump = vault.bump,
        constraint = authority.key() == vault.authority @ OptionsError::Unauthorized,
    )]
    pub vault: Box<Account<'info, OptionVault>>,

    /// Old vault_usdc token account to close
    #[account(
        mut,
        seeds = [b"vault_usdc", vault.key().as_ref()],
        bump,
        token::mint = vault.usdc_mint,
        token::authority = vault,
    )]
    pub old_usdc_vault: Account<'info, TokenAccount>,

    /// New USDC mint to migrate to
    pub new_usdc_mint: Account<'info, Mint>,

    #[account(mut, constraint = authority.key() == vault.authority @ OptionsError::Unauthorized)]
    pub authority: Signer<'info>,

    pub token_program: Program<'info, Token>,
}

pub fn migrate_usdc_mint_close(ctx: Context<MigrateUsdcMintClose>) -> Result<()> {
    // Close old vault_usdc (sends rent to authority; vault PDA signs)
    let authority_key = ctx.accounts.vault.authority;
    let vault_bump = ctx.accounts.vault.bump;
    let seeds: &[&[u8]] = &[b"vault", authority_key.as_ref(), &[vault_bump]];

    token::close_account(CpiContext::new_with_signer(
        ctx.accounts.token_program.to_account_info(),
        token::CloseAccount {
            account: ctx.accounts.old_usdc_vault.to_account_info(),
            destination: ctx.accounts.authority.to_account_info(),
            authority: ctx.accounts.vault.to_account_info(),
        },
        &[seeds],
    ))?;

    // Update vault to point to new mint
    let vault = &mut ctx.accounts.vault;
    vault.usdc_mint = ctx.accounts.new_usdc_mint.key();
    vault.usdc_vault = Pubkey::default(); // will be set in reinit step

    msg!(
        "Vault USDC mint migrated to {}. Run reinit_vault_usdc next.",
        vault.usdc_mint
    );
    Ok(())
}

#[derive(Accounts)]
pub struct ReinitVaultUsdc<'info> {
    #[account(
        mut,
        seeds = [b"vault", vault.authority.as_ref()],
        bump = vault.bump,
        constraint = authority.key() == vault.authority @ OptionsError::Unauthorized,
    )]
    pub vault: Box<Account<'info, OptionVault>>,

    /// New vault_usdc token account (re-created at same PDA)
    #[account(
        init,
        payer = authority,
        token::mint = new_usdc_mint,
        token::authority = vault,
        seeds = [b"vault_usdc", vault.key().as_ref()],
        bump,
    )]
    pub usdc_vault: Account<'info, TokenAccount>,

    pub new_usdc_mint: Account<'info, Mint>,

    #[account(mut, constraint = authority.key() == vault.authority @ OptionsError::Unauthorized)]
    pub authority: Signer<'info>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

pub fn reinit_vault_usdc(ctx: Context<ReinitVaultUsdc>) -> Result<()> {
    let vault = &mut ctx.accounts.vault;
    vault.usdc_vault = ctx.accounts.usdc_vault.key();
    msg!("Vault USDC account re-initialized: {}", vault.usdc_vault);
    Ok(())
}
