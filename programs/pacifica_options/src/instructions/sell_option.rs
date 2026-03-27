use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};
use crate::state::vault::OptionVault;
use crate::state::position::{OptionPosition, OptionType};
use crate::state::amm_pool::AmmPool;
use crate::state::iv_oracle::IVOracle;
use crate::math::black_scholes::{black_scholes_call, black_scholes_put, time_to_expiry_years};
use crate::math::greeks::compute_delta;
use crate::math::fixed_point::{apply_platform_fee, SCALE};
use crate::error::OptionsError;

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct SellOptionArgs {
    pub market_discriminant: u8,
    pub option_type: u8,
    pub strike: u64,
    pub expiry: i64,
    /// Size to sell back (may be partial), 6 dec underlying units
    pub size: u64,
    /// Minimum USDC to receive (slippage guard), 6 dec
    pub min_proceeds: u64,
}

#[derive(Accounts)]
#[instruction(args: SellOptionArgs)]
pub struct SellOption<'info> {
    #[account(
        mut,
        seeds = [b"vault", vault.authority.as_ref()],
        bump = vault.bump,
    )]
    pub vault: Box<Account<'info, OptionVault>>,

    /// Vault USDC (sends back proceeds minus fee)
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
        seeds = [b"iv_oracle", vault.key().as_ref(), &[args.market_discriminant]],
        bump = iv_oracle.bump,
        constraint = iv_oracle.vault == vault.key()
    )]
    pub iv_oracle: Box<Account<'info, IVOracle>>,

    /// Seller's position account (must be owned by seller)
    #[account(
        mut,
        seeds = [
            b"position",
            seller.key().as_ref(),
            vault.key().as_ref(),
            &[args.market_discriminant],
            &[args.option_type],
            &args.strike.to_le_bytes(),
            &args.expiry.to_le_bytes(),
        ],
        bump = position.bump,
        constraint = position.owner == seller.key() @ OptionsError::Unauthorized,
        constraint = !position.settled @ OptionsError::AlreadySettled,
    )]
    pub position: Box<Account<'info, OptionPosition>>,

    /// Seller's USDC account (receives proceeds)
    #[account(
        mut,
        token::mint = vault.usdc_mint,
        token::authority = seller,
    )]
    pub seller_usdc: Box<Account<'info, TokenAccount>>,

    #[account(mut)]
    pub seller: Signer<'info>,

    pub token_program: Program<'info, Token>,
}

pub fn handler(ctx: Context<SellOption>, args: SellOptionArgs) -> Result<()> {
    require!(!ctx.accounts.vault.paused, OptionsError::ProtocolPaused);
    require!(args.size > 0, OptionsError::InvalidSize);

    let clock = Clock::get()?;
    let now = clock.unix_timestamp;

    // Option must not have expired
    require!(ctx.accounts.position.expiry > now, OptionsError::OptionExpired);

    // Must own enough of the position to sell
    require!(
        ctx.accounts.position.size >= args.size,
        OptionsError::InvalidSize
    );

    // Validate oracle freshness
    let oracle = &ctx.accounts.iv_oracle;
    require!(
        now - oracle.latest_price_ts <= 60,
        OptionsError::StalePriceFeed
    );
    let spot = oracle.latest_price;
    require!(spot > 0, OptionsError::InvalidSettlementPrice);

    // Parse option type
    let option_type = match args.option_type {
        0 => OptionType::Call,
        1 => OptionType::Put,
        _ => return err!(OptionsError::UnknownMarket),
    };

    // Time to expiry
    let time_years = time_to_expiry_years(now, ctx.accounts.position.expiry)
        .ok_or(OptionsError::OptionExpired)?;

    // Fair value per unit
    let iv = oracle.iv_atm;
    let unit_value = match option_type {
        OptionType::Call => black_scholes_call(spot, args.strike, iv, time_years)
            .ok_or(OptionsError::ZeroPremium)?,
        OptionType::Put => black_scholes_put(spot, args.strike, iv, time_years)
            .ok_or(OptionsError::ZeroPremium)?,
    };

    // Total proceeds before fee
    let raw_proceeds = (unit_value as u128)
        .checked_mul(args.size as u128)
        .ok_or(OptionsError::MathOverflow)?
        .checked_div(SCALE as u128)
        .ok_or(OptionsError::MathOverflow)? as u64;

    // Platform fee: 5 bps deducted from proceeds
    let (net_proceeds, fee) = apply_platform_fee(raw_proceeds);

    // Slippage check
    require!(net_proceeds >= args.min_proceeds, OptionsError::SlippageExceeded);

    // Check vault has enough liquidity
    require!(
        ctx.accounts.usdc_vault.amount >= net_proceeds,
        OptionsError::InsufficientCollateral
    );

    // Current delta to remove from vault book
    let delta = compute_delta(option_type, spot, args.strike, iv, time_years)
        .unwrap_or(0);
    let delta_contribution = (delta as i128)
        .checked_mul(args.size as i128)
        .ok_or(OptionsError::MathOverflow)?
        .checked_div(SCALE as i128)
        .ok_or(OptionsError::MathOverflow)? as i64;

    // ── Transfer net proceeds from vault to seller ───────────────────────────
    let authority_key = ctx.accounts.vault.authority;
    let vault_seeds: &[&[u8]] = &[
        b"vault",
        authority_key.as_ref(),
        &[ctx.accounts.vault.bump],
    ];
    let signer_seeds = &[vault_seeds];

    // We need to sign with vault's PDA for the vault USDC
    // The vault is the authority of the usdc_vault token account
    let vault_authority = ctx.accounts.vault.to_account_info();
    let cpi_ctx = CpiContext::new_with_signer(
        ctx.accounts.token_program.to_account_info(),
        Transfer {
            from: ctx.accounts.usdc_vault.to_account_info(),
            to: ctx.accounts.seller_usdc.to_account_info(),
            authority: vault_authority,
        },
        signer_seeds,
    );
    token::transfer(cpi_ctx, net_proceeds)?;

    // ── Update position ──────────────────────────────────────────────────────
    let position = &mut ctx.accounts.position;
    position.size = position.size.saturating_sub(args.size);
    if position.size == 0 {
        position.settled = true;
    }

    // ── Update vault state ───────────────────────────────────────────────────
    let vault = &mut ctx.accounts.vault;
    vault.total_collateral = vault.total_collateral.saturating_sub(raw_proceeds);
    let oi_notional = (position.strike as u128)
        .saturating_mul(args.size as u128)
        .checked_div(SCALE as u128)
        .unwrap_or(0) as u64;
    vault.open_interest = vault.open_interest.saturating_sub(oi_notional);
    // Remove delta contribution: vault was short delta for these options
    vault.delta_net = vault.delta_net.saturating_add(delta_contribution);
    vault.fees_collected = vault.fees_collected.saturating_add(fee);

    // ── Update AMM pool ──────────────────────────────────────────────────────
    let pool = &mut ctx.accounts.amm_pool;
    pool.reserve_usdc = pool.reserve_usdc.saturating_sub(net_proceeds);
    pool.reserve_options = pool.reserve_options
        .checked_add(args.size)
        .ok_or(OptionsError::MathOverflow)?;
    let new_k = (pool.reserve_options as u128).saturating_mul(pool.reserve_usdc as u128);
    pool.set_k_invariant(new_k);

    msg!(
        "Option sold: size={} proceeds={} fee={}",
        args.size, net_proceeds, fee
    );
    Ok(())
}
