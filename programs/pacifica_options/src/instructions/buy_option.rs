use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};
use crate::state::vault::{OptionVault, Market};
use crate::state::position::{OptionPosition, OptionType};
use crate::state::amm_pool::AmmPool;
use crate::state::iv_oracle::IVOracle;
use crate::math::black_scholes::{black_scholes_call, black_scholes_put, time_to_expiry_years};
use crate::math::greeks::compute_delta;
use crate::math::fixed_point::{apply_platform_fee, SCALE, SCALE_I};
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

    /// AMM pool for this options series
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

    /// IV Oracle for this market
    #[account(
        seeds = [b"iv_oracle", vault.key().as_ref(), &[args.market_discriminant]],
        bump = iv_oracle.bump,
        constraint = iv_oracle.vault == vault.key()
    )]
    pub iv_oracle: Box<Account<'info, IVOracle>>,

    /// New position account for the buyer
    #[account(
        init,
        payer = buyer,
        space = OptionPosition::LEN,
        seeds = [
            b"position",
            buyer.key().as_ref(),
            vault.key().as_ref(),
            &[args.market_discriminant],
            &[args.option_type],
            &args.strike.to_le_bytes(),
            &args.expiry.to_le_bytes(),
        ],
        bump
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
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

pub fn handler(ctx: Context<BuyOption>, args: BuyOptionArgs) -> Result<()> {
    require!(!ctx.accounts.vault.paused, OptionsError::ProtocolPaused);
    require!(args.size > 0, OptionsError::InvalidSize);
    require!(args.strike > 0, OptionsError::InvalidStrike);

    let clock = Clock::get()?;
    let now = clock.unix_timestamp;

    // Validate expiry
    require!(args.expiry > now, OptionsError::OptionExpired);
    let min_expiry = now + 3600;     // at least 1 hour
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

    // Get IV from oracle (ATM IV used; a more complete impl would compute per-strike)
    let iv = oracle.iv_atm;
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
    // fee = raw_premium * 5 / 10_000
    let (_net_premium, fee) = apply_platform_fee(raw_premium);
    let total_premium = raw_premium.checked_add(fee).ok_or(OptionsError::MathOverflow)?;

    // Slippage check
    require!(total_premium <= args.max_premium, OptionsError::SlippageExceeded);

    // Check buyer has sufficient USDC
    require!(
        ctx.accounts.buyer_usdc.amount >= total_premium,
        OptionsError::InsufficientUsdc
    );

    // ── Collateral ratio check: vault must hold ≥ 120% of worst-case payoff ──
    // Call: max payoff ≈ spot (unlimited upside approximated conservatively)
    // Put: max payoff = strike (price goes to 0)
    let max_payoff_per_unit = match option_type {
        OptionType::Call => spot,
        OptionType::Put  => args.strike,
    };
    let max_payoff = (max_payoff_per_unit as u128)
        .checked_mul(args.size as u128)
        .ok_or(OptionsError::MathOverflow)?
        .checked_div(SCALE as u128)
        .ok_or(OptionsError::MathOverflow)? as u64;
    // Total liability = existing OI (USDC notional) + this trade's max payoff
    // Vault must hold ≥ 120% of total liability after receiving the premium
    let vault_after_premium = ctx.accounts.usdc_vault.amount
        .checked_add(total_premium)
        .ok_or(OptionsError::MathOverflow)?;
    let total_max_liability = ctx.accounts.vault.open_interest
        .checked_add(max_payoff)
        .ok_or(OptionsError::MathOverflow)?;
    let required_collateral = (total_max_liability as u128)
        .checked_mul(120)
        .ok_or(OptionsError::MathOverflow)?
        .checked_div(100)
        .ok_or(OptionsError::MathOverflow)? as u64;
    require!(
        vault_after_premium >= required_collateral,
        OptionsError::InsufficientCollateral
    );

    // ── Delta for vault book-keeping ─────────────────────────────────────────
    let delta = compute_delta(option_type, spot, args.strike, iv, time_years)
        .unwrap_or(0);

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
    let oi_notional = (args.strike as u128)
        .checked_mul(args.size as u128)
        .ok_or(OptionsError::MathOverflow)?
        .checked_div(SCALE as u128)
        .ok_or(OptionsError::MathOverflow)? as u64;
    vault.open_interest = vault.open_interest
        .checked_add(oi_notional)
        .ok_or(OptionsError::MathOverflow)?;
    // delta_net: for each option sold by vault, vault is short delta
    let delta_contribution = (delta as i128)
        .checked_mul(args.size as i128)
        .ok_or(OptionsError::MathOverflow)?
        .checked_div(SCALE as i128)
        .ok_or(OptionsError::MathOverflow)? as i64;
    vault.delta_net = vault.delta_net
        .checked_sub(delta_contribution)
        .ok_or(OptionsError::MathOverflow)?;
    vault.fees_collected = vault.fees_collected.saturating_add(fee);

    // ── Update AMM pool reserves ─────────────────────────────────────────────
    // AMM pool tracks secondary market; primary issuance goes directly to vault
    // For AMM: add options to reserve, add net premium to USDC reserve
    let pool = &mut ctx.accounts.amm_pool;
    pool.reserve_usdc = pool.reserve_usdc
        .checked_add(total_premium)
        .ok_or(OptionsError::MathOverflow)?;
    // Buyer takes options from the pool's reserve
    pool.reserve_options = pool.reserve_options.saturating_sub(args.size);
    // Update k invariant
    let new_k = (pool.reserve_options as u128)
        .saturating_mul(pool.reserve_usdc as u128);
    pool.set_k_invariant(new_k);

    // ── Create position ──────────────────────────────────────────────────────
    let position = &mut ctx.accounts.position;
    position.bump = ctx.bumps.position;
    position.owner = ctx.accounts.buyer.key();
    position.vault = ctx.accounts.vault.key();
    position.market = market;
    position.option_type = option_type;
    position.strike = args.strike;
    position.expiry = args.expiry;
    position.size = args.size;
    position.premium_paid = total_premium;
    position.entry_iv = iv;
    position.entry_delta = delta;
    position.settled = false;
    position.payoff_received = 0;
    position.created_at = now;
    position._padding = [0u8; 32];

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
