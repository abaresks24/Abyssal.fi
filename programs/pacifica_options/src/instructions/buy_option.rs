use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};
use crate::state::vault::{OptionVault, Market};
use crate::state::position::{OptionPosition, OptionType};
use crate::state::amm_pool::AmmPool;
use crate::state::iv_oracle::IVOracle;
use crate::math::black_scholes::{black_scholes_call, black_scholes_put, time_to_expiry_years};
use crate::math::greeks::compute_delta;
use crate::math::fixed_point::{apply_platform_fee, SCALE};
use crate::error::OptionsError;

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct BuyOptionArgs {
    pub market_discriminant: u8,  // 0=BTC, 1=ETH, 2=SOL
    pub option_type: u8,          // 0=Call, 1=Put
    pub strike: u64,              // USDC strike, 6 dec
    pub expiry: i64,              // Unix timestamp
    pub size: u64,                // Option size in underlying, 6 dec
    pub max_premium: u64,         // Slippage guard — max USDC user will pay (6 dec)
}

#[derive(Accounts)]
#[instruction(args: BuyOptionArgs)]
pub struct BuyOption<'info> {
    #[account(
        mut,
        seeds = [b"vault", vault.authority.as_ref()],
        bump = vault.bump,
    )]
    pub vault: Box<Account<'info, OptionVault>>,

    /// Vault USDC token account (receives premium)
    #[account(
        mut,
        seeds = [b"vault_usdc", vault.key().as_ref()],
        bump,
        token::mint = vault.usdc_mint,
        token::authority = vault,
    )]
    pub usdc_vault: Box<Account<'info, TokenAccount>>,

    /// AMM pool for this options series — must be pre-created via ensure_series
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
        bump,
        constraint = amm_pool.vault == vault.key() @ crate::error::OptionsError::InvalidSeries,
    )]
    pub amm_pool: Box<Account<'info, AmmPool>>,

    /// IV Oracle for this market
    #[account(
        seeds = [b"iv_oracle", vault.key().as_ref(), &[args.market_discriminant]],
        bump = iv_oracle.bump,
        constraint = iv_oracle.vault == vault.key()
    )]
    pub iv_oracle: Box<Account<'info, IVOracle>>,

    /// Position account — must be pre-created via ensure_series
    #[account(
        mut,
        seeds = [
            b"position",
            buyer.key().as_ref(),
            vault.key().as_ref(),
            &[args.market_discriminant],
            &[args.option_type],
            &args.strike.to_le_bytes(),
            &args.expiry.to_le_bytes(),
        ],
        bump,
        constraint = position.owner == buyer.key() @ crate::error::OptionsError::InvalidSeries,
    )]
    pub position: Box<Account<'info, OptionPosition>>,

    /// Buyer's USDC token account (pays premium)
    #[account(
        mut,
        token::mint = vault.usdc_mint,
        token::authority = buyer,
    )]
    pub buyer_usdc: Box<Account<'info, TokenAccount>>,

    #[account(mut)]
    pub buyer: Signer<'info>,

    pub token_program: Program<'info, Token>,
}

pub fn handler(ctx: Context<BuyOption>, args: BuyOptionArgs) -> Result<()> {
    require!(!ctx.accounts.vault.paused, OptionsError::ProtocolPaused);
    require!(args.size > 0, OptionsError::InvalidSize);
    require!(args.strike > 0, OptionsError::InvalidStrike);

    let clock = Clock::get()?;
    let now = clock.unix_timestamp;

    // Validate expiry
    require!(args.expiry > now, OptionsError::OptionExpired);
    let min_expiry = now + 60;       // at least 1 minute
    let max_expiry = now + 7_776_000; // at most 90 days
    require!(args.expiry >= min_expiry, OptionsError::ExpiryTooClose);
    require!(args.expiry <= max_expiry, OptionsError::ExpiryTooFar);

    // Parse enums
    let market = market_from_u8(args.market_discriminant)?;
    let option_type = option_type_from_u8(args.option_type)?;

    // Get current price from oracle
    let oracle = &ctx.accounts.iv_oracle;
    require!(
        now - oracle.latest_price_ts <= 60,
        OptionsError::StalePriceFeed
    );
    let spot = oracle.latest_price;
    require!(spot > 0, OptionsError::InvalidSettlementPrice);

    // Compute time to expiry
    let time_years = time_to_expiry_years(now, args.expiry)
        .ok_or(OptionsError::OptionExpired)?;

    // ── Utilization-based IV skew ────────────────────────────────────────────
    // Base IV from oracle (AFVR surface ATM)
    let base_iv = oracle.iv_atm;

    // The vault tracks delta_net (signed). When user buys a call, vault becomes
    // MORE delta-short (negative). When user buys a put, vault becomes MORE
    // delta-long (positive). We want to discourage trades that push the vault
    // further into imbalance — so we increase the IV (premium) for those trades.
    //
    // exposure_ratio = |delta_net × spot| / total_collateral, clamped to [0, 1]
    // skew_bps      = exposure_ratio × 5000  // up to +50% IV at full exposure
    //
    // Apply skew if the new trade pushes delta further from zero (same direction).
    let vault_state = &ctx.accounts.vault;
    let pushes_further = match option_type {
        // Buying call decreases delta_net — bad if already negative
        OptionType::Call => vault_state.delta_net < 0,
        // Buying put increases delta_net — bad if already positive
        OptionType::Put  => vault_state.delta_net > 0,
    };

    let skew_iv = if pushes_further && vault_state.total_collateral > 0 {
        let delta_notional = (vault_state.delta_net.unsigned_abs() as u128)
            .saturating_mul(spot as u128)
            / SCALE as u128;
        let exposure_pct = (delta_notional.saturating_mul(10_000) / vault_state.total_collateral as u128).min(10_000);
        // skew = base_iv × (1 + exposure_pct × 0.5 / 100)
        // At 100% exposure: +50% IV
        let bonus_bps = exposure_pct.saturating_mul(50) / 100; // up to 5000 bps
        (base_iv as u128).saturating_mul(10_000 + bonus_bps) / 10_000
    } else {
        base_iv as u128
    };

    let iv = (skew_iv.min(5_000_000) as u64).max(10_000);
    require!(
        iv >= 10_000 && iv <= 5_000_000,
        OptionsError::IVOutOfRange
    );

    // ── Black-Scholes premium (per option unit) ──────────────────────────────
    let unit_premium = match option_type {
        OptionType::Call => black_scholes_call(spot, args.strike, iv, time_years)
            .ok_or(OptionsError::ZeroPremium)?,
        OptionType::Put => black_scholes_put(spot, args.strike, iv, time_years)
            .ok_or(OptionsError::ZeroPremium)?,
    };
    require!(unit_premium > 0, OptionsError::ZeroPremium);

    // Total premium = unit_premium * size / SCALE
    let raw_premium = (unit_premium as u128)
        .checked_mul(args.size as u128)
        .ok_or(OptionsError::MathOverflow)?
        .checked_div(SCALE as u128)
        .ok_or(OptionsError::MathOverflow)? as u64;
    require!(raw_premium > 0, OptionsError::ZeroPremium);

    // ── Platform fee: 5 bps (0.05%) ──────────────────────────────────────────
    let (_net_premium, fee) = apply_platform_fee(raw_premium);
    let total_premium = raw_premium.checked_add(fee).ok_or(OptionsError::MathOverflow)?;

    // Slippage check
    require!(total_premium <= args.max_premium, OptionsError::SlippageExceeded);

    // Check buyer has sufficient USDC
    require!(
        ctx.accounts.buyer_usdc.amount >= total_premium,
        OptionsError::InsufficientUsdc
    );

    // ── Delta for risk calc + book-keeping ───────────────────────────────────
    let delta = compute_delta(option_type, spot, args.strike, iv, time_years)
        .unwrap_or(0);

    // ── Risk-weighted collateral check ───────────────────────────────────────
    //
    // Traders don't all exercise simultaneously — options have different expiries,
    // most expire OTM, and calls/puts partially offset. Instead of requiring 120%
    // of worst-case max payoff (overly conservative), we use a risk-weighted
    // model based on delta (probability of ITM).
    //
    //   risk_weighted_exposure = max_payoff × |delta|
    //
    // A call with delta=0.3 has ~30% chance of being ITM at expiry. We collateralize
    // the expected loss, not the theoretical max. The 20% safety buffer absorbs
    // unlikely outcomes (tail risk, simultaneous exercises, price gaps).
    let max_payoff_per_unit = match option_type {
        OptionType::Call => spot,
        OptionType::Put  => args.strike,
    };
    let max_payoff = (max_payoff_per_unit as u128)
        .checked_mul(args.size as u128)
        .ok_or(OptionsError::MathOverflow)?
        .checked_div(SCALE as u128)
        .ok_or(OptionsError::MathOverflow)? as u64;

    // risk-weighted by |delta| (delta is signed, scaled 1e6)
    let delta_abs = delta.unsigned_abs();
    // Ensure a minimum 20% weight to cover tail events even on deep OTM options
    let effective_weight = (delta_abs.max(200_000)).min(1_000_000);
    let risk_weighted_payoff = (max_payoff as u128)
        .saturating_mul(effective_weight as u128) / (SCALE as u128);

    let vault_after_premium = ctx.accounts.usdc_vault.amount
        .checked_add(total_premium)
        .ok_or(OptionsError::MathOverflow)?;
    let total_risk_liability = (ctx.accounts.vault.open_interest as u128)
        .saturating_add(risk_weighted_payoff);
    // 120% safety buffer on the risk-weighted exposure
    let required_collateral = total_risk_liability.saturating_mul(120) / 100;
    require!(
        (vault_after_premium as u128) >= required_collateral,
        OptionsError::InsufficientCollateral
    );

    // ── Transfer USDC from buyer to vault ────────────────────────────────────
    let cpi_ctx = CpiContext::new(
        ctx.accounts.token_program.to_account_info(),
        Transfer {
            from: ctx.accounts.buyer_usdc.to_account_info(),
            to: ctx.accounts.usdc_vault.to_account_info(),
            authority: ctx.accounts.buyer.to_account_info(),
        },
    );
    token::transfer(cpi_ctx, total_premium)?;

    // ── Update vault state ───────────────────────────────────────────────────
    let vault = &mut ctx.accounts.vault;
    vault.total_collateral = vault.total_collateral
        .checked_add(total_premium)
        .ok_or(OptionsError::MathOverflow)?;
    // Store the RISK-WEIGHTED exposure (not raw notional). This reflects the
    // expected liability, not worst-case. Keeps utilization realistic so LPs
    // can withdraw and traders can trade 24/7 without overly-tight constraints.
    let oi_notional = risk_weighted_payoff as u64;
    vault.open_interest = vault.open_interest
        .checked_add(oi_notional)
        .ok_or(OptionsError::MathOverflow)?;
    let delta_contribution = (delta as i128)
        .checked_mul(args.size as i128)
        .ok_or(OptionsError::MathOverflow)?
        .checked_div(SCALE as i128)
        .ok_or(OptionsError::MathOverflow)? as i64;
    vault.delta_net = vault.delta_net
        .checked_sub(delta_contribution)
        .ok_or(OptionsError::MathOverflow)?;
    vault.fees_collected = vault.fees_collected.saturating_add(fee);

    // ── Accumulate AMM pool reserves (tracking protocol volume) ─────────────
    {
        let pool = &mut ctx.accounts.amm_pool;
        pool.reserve_usdc = pool.reserve_usdc
            .checked_add(total_premium)
            .ok_or(OptionsError::MathOverflow)?;
        pool.reserve_options = pool.reserve_options.saturating_add(args.size);
        let new_k = (pool.reserve_options as u128).saturating_mul(pool.reserve_usdc as u128);
        pool.set_k_invariant(new_k);
    }

    // ── Accumulate position ───────────────────────────────────────────────────
    {
        let position = &mut ctx.accounts.position;
        if position.size == 0 {
            position.entry_iv    = iv;
            position.entry_delta = delta;
            position.created_at  = now;
            position.spot_at_buy = spot;
        }
        position.size = position.size
            .checked_add(args.size)
            .ok_or(OptionsError::MathOverflow)?;
        position.premium_paid = position.premium_paid
            .checked_add(total_premium)
            .ok_or(OptionsError::MathOverflow)?;
    }

    msg!(
        "Option purchased: {:?} {:?} strike={} expiry={} size={} premium={} fee={}",
        market, option_type, args.strike, args.expiry, args.size, raw_premium, fee
    );

    Ok(())
}

pub fn market_from_u8(d: u8) -> Result<Market> {
    match d {
        0  => Ok(Market::BTC),
        1  => Ok(Market::ETH),
        2  => Ok(Market::SOL),
        3  => Ok(Market::NVDA),
        4  => Ok(Market::TSLA),
        5  => Ok(Market::PLTR),
        6  => Ok(Market::CRCL),
        7  => Ok(Market::HOOD),
        8  => Ok(Market::SP500),
        9  => Ok(Market::XAU),
        10 => Ok(Market::XAG),
        11 => Ok(Market::PAXG),
        12 => Ok(Market::PLATINUM),
        13 => Ok(Market::NATGAS),
        14 => Ok(Market::COPPER),
        _  => err!(OptionsError::UnknownMarket),
    }
}

pub fn option_type_from_u8(d: u8) -> Result<OptionType> {
    match d {
        0 => Ok(OptionType::Call),
        1 => Ok(OptionType::Put),
        _ => err!(OptionsError::UnknownMarket),
    }
}
