use anchor_lang::prelude::*;
use crate::state::vault::{OptionVault, IVParams};
use crate::state::iv_oracle::IVOracle;
use crate::state::vault::Market;
use crate::error::OptionsError;


#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct UpdateIVParamsArgsExt {
    pub market_discriminant: u8,
    pub iv_atm: u64,
    pub iv_skew_rho: i64,
    pub iv_curvature_phi: u64,
    pub theta_param: u64,
    pub latest_price: u64,
}

#[derive(Accounts)]
#[instruction(args: UpdateIVParamsArgsExt)]
pub struct UpdateIVParamsFull<'info> {
    #[account(
        mut,
        seeds = [b"vault", vault.authority.as_ref()],
        bump = vault.bump,
    )]
    pub vault: Box<Account<'info, OptionVault>>,

    #[account(
        mut,
        seeds = [b"iv_oracle", vault.key().as_ref(), &[args.market_discriminant]],
        bump = iv_oracle.bump,
        constraint = iv_oracle.vault == vault.key()
    )]
    pub iv_oracle: Box<Account<'info, IVOracle>>,

    #[account(
        constraint = keeper.key() == vault.keeper @ OptionsError::UnauthorizedKeeper
    )]
    pub keeper: Signer<'info>,
}

pub fn handler(ctx: Context<UpdateIVParamsFull>, args: UpdateIVParamsArgsExt) -> Result<()> {
    require!(!ctx.accounts.vault.paused, OptionsError::ProtocolPaused);

    // Validate IV ATM range: 1% to 500%
    require!(
        args.iv_atm >= 10_000 && args.iv_atm <= 5_000_000,
        OptionsError::IVOutOfRange
    );

    let clock = Clock::get()?;

    // Update vault-level IV params (latest snapshot)
    let vault = &mut ctx.accounts.vault;
    vault.iv_params = IVParams {
        iv_atm: args.iv_atm,
        iv_skew_rho: args.iv_skew_rho,
        iv_curvature_phi: args.iv_curvature_phi,
        theta_param: args.theta_param,
    };
    vault.last_iv_update = clock.unix_timestamp;

    // Circuit breaker: new IV_ATM cannot deviate more than 50% from the current value.
    // Skipped on the first update when oracle.iv_atm == 0.
    let oracle_prev_iv = ctx.accounts.iv_oracle.iv_atm;
    if oracle_prev_iv > 0 {
        let max_iv = oracle_prev_iv.saturating_mul(150) / 100;
        let min_iv = oracle_prev_iv.saturating_mul(50)  / 100;
        require!(
            args.iv_atm >= min_iv && args.iv_atm <= max_iv,
            OptionsError::IVJumpTooLarge
        );
    }

    // Update oracle account
    let oracle = &mut ctx.accounts.iv_oracle;
    oracle.iv_atm = args.iv_atm;
    oracle.iv_skew_rho = args.iv_skew_rho;
    oracle.iv_curvature_phi = args.iv_curvature_phi;
    oracle.theta_param = args.theta_param;
    oracle.last_update = clock.unix_timestamp;
    oracle.latest_price = args.latest_price;
    oracle.latest_price_ts = clock.unix_timestamp;

    // Push to price ring buffer
    oracle.price_buffer.push(args.latest_price, clock.unix_timestamp);

    msg!(
        "IV params updated: iv_atm={}, skew_rho={}, curvature_phi={}, theta={}, price={}",
        args.iv_atm,
        args.iv_skew_rho,
        args.iv_curvature_phi,
        args.theta_param,
        args.latest_price
    );
    Ok(())
}

// ── Initialize IV Oracle (one-time setup per market) ────────────────────────

#[derive(Accounts)]
#[instruction(market_discriminant: u8)]
pub struct InitializeIVOracle<'info> {
    #[account(
        mut,
        seeds = [b"vault", vault.authority.as_ref()],
        bump = vault.bump,
    )]
    pub vault: Box<Account<'info, OptionVault>>,

    #[account(
        init,
        payer = authority,
        space = IVOracle::LEN,
        seeds = [b"iv_oracle", vault.key().as_ref(), &[market_discriminant]],
        bump
    )]
    pub iv_oracle: Box<Account<'info, IVOracle>>,

    #[account(mut, constraint = authority.key() == vault.authority @ OptionsError::Unauthorized)]
    pub authority: Signer<'info>,

    pub system_program: Program<'info, System>,
}

pub fn initialize_iv_oracle(
    ctx: Context<InitializeIVOracle>,
    market_discriminant: u8,
) -> Result<()> {
    let market = match market_discriminant {
        0  => Market::BTC,
        1  => Market::ETH,
        2  => Market::SOL,
        3  => Market::NVDA,
        4  => Market::TSLA,
        5  => Market::PLTR,
        6  => Market::CRCL,
        7  => Market::HOOD,
        8  => Market::SP500,
        9  => Market::XAU,
        10 => Market::XAG,
        11 => Market::PAXG,
        12 => Market::PLATINUM,
        13 => Market::NATGAS,
        14 => Market::COPPER,
        _  => return err!(OptionsError::UnknownMarket),
    };

    let clock = Clock::get()?;
    let oracle = &mut ctx.accounts.iv_oracle;
    oracle.bump = ctx.bumps.iv_oracle;
    oracle.vault = ctx.accounts.vault.key();
    oracle.market = market;
    oracle.iv_atm = 500_000;     // 50% default
    oracle.iv_skew_rho = -50_000;
    oracle.iv_curvature_phi = 100_000;
    oracle.theta_param = 1_000_000;
    oracle.last_update = clock.unix_timestamp;
    oracle.price_buffer = Default::default();
    oracle.latest_price = 0;
    oracle.latest_price_ts = clock.unix_timestamp;
    oracle._padding = [0u8; 32];

    msg!("IV oracle initialized for market discriminant {}", market_discriminant);
    Ok(())
}
