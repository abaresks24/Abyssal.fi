use anchor_lang::prelude::*;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token::{self, Burn, Mint, Token, TokenAccount, Transfer};
use crate::state::vault::OptionVault;
use crate::state::position::{OptionPosition, OptionType};
use crate::state::iv_oracle::IVOracle;
use crate::math::fixed_point::{apply_settlement_fee, SCALE};
use crate::error::OptionsError;

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct ExerciseOptionArgs {
    pub market_discriminant: u8,
    pub option_type: u8,
    pub strike: u64,
    pub expiry: i64,
}

#[derive(Accounts)]
#[instruction(args: ExerciseOptionArgs)]
pub struct ExerciseOption<'info> {
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
        seeds = [b"iv_oracle", vault.key().as_ref(), &[args.market_discriminant]],
        bump = iv_oracle.bump,
        constraint = iv_oracle.vault == vault.key()
    )]
    pub iv_oracle: Box<Account<'info, IVOracle>>,

    #[account(
        mut,
        seeds = [
            b"position",
            owner.key().as_ref(),
            vault.key().as_ref(),
            &[args.market_discriminant],
            &[args.option_type],
            &args.strike.to_le_bytes(),
            &args.expiry.to_le_bytes(),
        ],
        bump = position.bump,
        constraint = position.owner == owner.key() @ OptionsError::Unauthorized,
        constraint = !position.settled @ OptionsError::AlreadySettled,
    )]
    pub position: Box<Account<'info, OptionPosition>>,

    /// Owner's USDC account (receives payoff)
    #[account(
        mut,
        token::mint = vault.usdc_mint,
        token::authority = owner,
    )]
    pub owner_usdc: Box<Account<'info, TokenAccount>>,

    // ── NFT receipt (burned on exercise) ─────────────────────────────────────
    /// NFT mint for this position
    #[account(
        mut,
        seeds = [b"option_nft", position.key().as_ref()],
        bump,
    )]
    pub nft_mint: Box<Account<'info, Mint>>,

    /// Owner's NFT token account
    #[account(
        mut,
        associated_token::mint      = nft_mint,
        associated_token::authority = owner,
    )]
    pub owner_nft_ata: Box<Account<'info, TokenAccount>>,

    #[account(mut)]
    pub owner: Signer<'info>,

    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<ExerciseOption>, args: ExerciseOptionArgs) -> Result<()> {
    require!(!ctx.accounts.vault.paused, OptionsError::ProtocolPaused);

    let clock = Clock::get()?;
    let now = clock.unix_timestamp;
    let position = &ctx.accounts.position;

    // European-style: option can only be exercised at or after expiry.
    // A 1-hour grace window after expiry is allowed for user convenience.
    require!(position.expiry <= now, OptionsError::OptionNotExpired);

    // Oracle must be fresh
    let oracle = &ctx.accounts.iv_oracle;
    require!(
        now - oracle.latest_price_ts <= 120,
        OptionsError::StalePriceFeed
    );
    let settlement_price = oracle.latest_price;
    require!(settlement_price > 0, OptionsError::InvalidSettlementPrice);

    // Check if ITM
    let option_type = match args.option_type {
        0 => OptionType::Call,
        1 => OptionType::Put,
        _ => return err!(OptionsError::UnknownMarket),
    };

    let is_itm = match option_type {
        OptionType::Call => settlement_price > position.strike,
        OptionType::Put  => settlement_price < position.strike,
    };
    require!(is_itm, OptionsError::OutOfTheMoney);

    // Compute intrinsic payoff
    let gross_payoff = position.intrinsic_payoff(settlement_price);
    require!(gross_payoff > 0, OptionsError::OutOfTheMoney);

    // Settlement fee: 5 bps, capped at 50 USDC
    let (net_payoff, fee) = apply_settlement_fee(gross_payoff);

    // Vault must have sufficient collateral
    require!(
        ctx.accounts.usdc_vault.amount >= net_payoff,
        OptionsError::InsufficientCollateral
    );

    // ── Transfer payoff from vault to option holder ──────────────────────────
    let authority_key = ctx.accounts.vault.authority;
    let vault_bump = ctx.accounts.vault.bump;
    let vault_seeds: &[&[u8]] = &[
        b"vault",
        authority_key.as_ref(),
        &[vault_bump],
    ];
    let signer_seeds = &[vault_seeds];

    let cpi_ctx = CpiContext::new_with_signer(
        ctx.accounts.token_program.to_account_info(),
        Transfer {
            from: ctx.accounts.usdc_vault.to_account_info(),
            to: ctx.accounts.owner_usdc.to_account_info(),
            authority: ctx.accounts.vault.to_account_info(),
        },
        signer_seeds,
    );
    token::transfer(cpi_ctx, net_payoff)?;

    // ── Burn NFT receipt ─────────────────────────────────────────────────────
    if ctx.accounts.owner_nft_ata.amount >= 1 {
        let burn_cpi = CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            Burn {
                mint:      ctx.accounts.nft_mint.to_account_info(),
                from:      ctx.accounts.owner_nft_ata.to_account_info(),
                authority: ctx.accounts.owner.to_account_info(),
            },
        );
        token::burn(burn_cpi, 1)?;
    }

    // ── Snapshot values BEFORE zeroing position.size ────────────────────────
    let size_snap        = ctx.accounts.position.size;
    let entry_delta_snap = ctx.accounts.position.entry_delta;
    let spot_at_buy_snap = ctx.accounts.position.spot_at_buy;
    let strike_snap      = ctx.accounts.position.strike;
    let opt_type_snap    = ctx.accounts.position.option_type;

    // ── Update position ──────────────────────────────────────────────────────
    let position = &mut ctx.accounts.position;
    position.settled = true;
    position.size = 0;
    position.payoff_received = net_payoff;

    // ── Update vault state (risk-weighted, matches buy_option's OI add) ─────
    let vault = &mut ctx.accounts.vault;
    vault.total_collateral = vault.total_collateral.saturating_sub(net_payoff);

    let max_payoff_per_unit = match opt_type_snap {
        OptionType::Call => spot_at_buy_snap,   // 0 for legacy → safe no-op
        OptionType::Put  => strike_snap,
    };
    let max_payoff = (max_payoff_per_unit as u128)
        .saturating_mul(size_snap as u128)
        .checked_div(SCALE as u128)
        .unwrap_or(0);
    let weight = (entry_delta_snap.unsigned_abs().max(200_000)).min(1_000_000) as u128;
    let oi_notional = (max_payoff.saturating_mul(weight) / (SCALE as u128)) as u64;
    vault.open_interest = vault.open_interest.saturating_sub(oi_notional);
    vault.fees_collected = vault.fees_collected.saturating_add(fee);

    // Restore net delta: vault was short delta when it sold the option; on close, add it back
    let delta_contribution = (entry_delta_snap as i128)
        .saturating_mul(size_snap as i128)
        .checked_div(SCALE as i128)
        .unwrap_or(0) as i64;
    vault.delta_net = vault.delta_net.saturating_add(delta_contribution);

    msg!(
        "Option exercised: settlement_price={} gross_payoff={} fee={} net_payoff={}",
        settlement_price, gross_payoff, fee, net_payoff
    );
    Ok(())
}
