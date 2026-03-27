use anchor_lang::prelude::*;
use crate::state::vault::OptionVault;
use crate::error::OptionsError;
use crate::math::fixed_point::SCALE;

/// Maximum single rebalance size (notional USDC, 6 dec) = $500,000
const MAX_REBALANCE_SIZE: u64 = 500_000_000_000;

/// Delta threshold below which rebalance is not needed (0.5% of open interest)
/// 5_000 in 1e6 scale = 0.5%
const DELTA_THRESHOLD: i64 = 5_000;

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct RebalanceDeltaArgs {
    /// Target delta position to achieve (signed, scaled 1e6)
    pub target_delta: i64,
    /// Notional USDC size of the hedge trade (6 dec) — used for size guard only
    pub hedge_size: u64,
    /// Underlying spot price (6 dec) — used to convert USDC notional → delta units
    pub spot_price: u64,
    /// Direction: true = buy perp (positive delta hedge), false = sell perp
    pub is_buy: bool,
}

#[derive(Accounts)]
pub struct RebalanceDelta<'info> {
    #[account(
        mut,
        seeds = [b"vault", vault.authority.as_ref()],
        bump = vault.bump,
    )]
    pub vault: Account<'info, OptionVault>,

    #[account(
        constraint = keeper.key() == vault.keeper @ OptionsError::UnauthorizedKeeper
    )]
    pub keeper: Signer<'info>,
}

pub fn handler(ctx: Context<RebalanceDelta>, args: RebalanceDeltaArgs) -> Result<()> {
    require!(!ctx.accounts.vault.paused, OptionsError::ProtocolPaused);
    require!(args.hedge_size > 0, OptionsError::InvalidSize);
    require!(
        args.hedge_size <= MAX_REBALANCE_SIZE,
        OptionsError::RebalanceSizeTooLarge
    );

    let vault = &mut ctx.accounts.vault;
    let current_delta = vault.delta_net;

    // Check if rebalance is actually needed
    require!(
        current_delta.abs() > DELTA_THRESHOLD,
        OptionsError::DeltaBalanced
    );

    require!(args.spot_price > 0, OptionsError::InvalidSettlementPrice);

    // Convert USDC notional to delta units: delta = hedge_usdc / spot_price (both 6 dec)
    // delta_units (1e6 scale) = hedge_size (1e6 USDC) / spot_price (1e6 USD/unit) * SCALE
    let hedge_delta = (args.hedge_size as u128)
        .checked_mul(SCALE as u128)
        .ok_or(OptionsError::MathOverflow)?
        .checked_div(args.spot_price as u128)
        .ok_or(OptionsError::DivisionByZero)? as i64;

    // A positive hedge (buy perp) adds positive delta; negative hedge subtracts
    let delta_change: i64 = if args.is_buy { hedge_delta } else { -hedge_delta };

    vault.delta_net = vault.delta_net
        .checked_add(delta_change)
        .ok_or(OptionsError::MathOverflow)?;

    msg!(
        "Delta rebalance executed: previous_delta={}, hedge_size={}, is_buy={}, new_delta={}",
        current_delta,
        args.hedge_size,
        args.is_buy,
        vault.delta_net
    );

    // Emit an event for indexers
    emit!(DeltaRebalancedEvent {
        timestamp: Clock::get()?.unix_timestamp,
        previous_delta: current_delta,
        hedge_size: args.hedge_size,
        is_buy: args.is_buy,
        new_delta: vault.delta_net,
        target_delta: args.target_delta,
    });

    Ok(())
}

#[event]
pub struct DeltaRebalancedEvent {
    pub timestamp: i64,
    pub previous_delta: i64,
    pub hedge_size: u64,
    pub is_buy: bool,
    pub new_delta: i64,
    pub target_delta: i64,
}
