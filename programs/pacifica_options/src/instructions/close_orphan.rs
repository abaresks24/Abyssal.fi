use anchor_lang::prelude::*;
use crate::state::vault::OptionVault;
use crate::state::position::OptionPosition;
use crate::state::amm_pool::AmmPool;
use crate::error::OptionsError;

// ─── Close Orphan OptionPosition ──────────────────────────────────────────────
// Position was created by ensure_series but buy_option never succeeded → size=0.
// Anyone signing for the owner can reclaim the rent.
#[derive(Accounts)]
pub struct CloseOrphanPosition<'info> {
    #[account(
        mut,
        close = owner,
        constraint = position.size == 0             @ OptionsError::InvalidSize,
        constraint = position.owner == owner.key() @ OptionsError::Unauthorized,
    )]
    pub position: Box<Account<'info, OptionPosition>>,

    #[account(mut)]
    pub owner: Signer<'info>,
}

pub fn close_orphan_position(ctx: Context<CloseOrphanPosition>) -> Result<()> {
    msg!("Orphan position closed for owner {}", ctx.accounts.position.owner);
    Ok(())
}

// ─── Close Orphan AmmPool ─────────────────────────────────────────────────────
// AmmPool was created by ensure_series but no trades occurred → reserves are zero.
// Vault authority can reclaim the rent.
#[derive(Accounts)]
pub struct CloseOrphanAmmPool<'info> {
    #[account(
        seeds = [b"vault", vault.authority.as_ref()],
        bump = vault.bump,
        constraint = authority.key() == vault.authority @ OptionsError::Unauthorized,
    )]
    pub vault: Box<Account<'info, OptionVault>>,

    #[account(
        mut,
        close = authority,
        constraint = amm_pool.vault == vault.key()       @ OptionsError::InvalidSeries,
        constraint = amm_pool.reserve_options == 0      @ OptionsError::InsufficientLiquidity,
        constraint = amm_pool.reserve_usdc == 0         @ OptionsError::InsufficientLiquidity,
        constraint = amm_pool.total_lp_tokens == 0      @ OptionsError::InsufficientLiquidity,
    )]
    pub amm_pool: Box<Account<'info, AmmPool>>,

    #[account(mut)]
    pub authority: Signer<'info>,
}

pub fn close_orphan_amm_pool(ctx: Context<CloseOrphanAmmPool>) -> Result<()> {
    msg!("Orphan amm_pool closed: market={:?} type={:?} strike={} expiry={}",
        ctx.accounts.amm_pool.market,
        ctx.accounts.amm_pool.option_type,
        ctx.accounts.amm_pool.strike,
        ctx.accounts.amm_pool.expiry,
    );
    Ok(())
}
