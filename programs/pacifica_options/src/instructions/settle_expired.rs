use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};
use crate::state::vault::OptionVault;
use crate::state::position::{OptionPosition, OptionType};
use crate::state::iv_oracle::IVOracle;
use crate::math::fixed_point::{apply_settlement_fee, SCALE};
use crate::error::OptionsError;

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct SettleExpiredArgs {
    pub market_discriminant: u8,
    pub option_type: u8,
    pub strike: u64,
    pub expiry: i64,
    /// Settlement price provided by keeper (verified against oracle)
    pub settlement_price: u64,
}

#[derive(Accounts)]
#[instruction(args: SettleExpiredArgs)]
pub struct SettleExpired<'info> {
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

    /// Option holder's wallet pubkey — used to verify the position PDA
    /// CHECK: Only used as a seed for deriving the position PDA
    pub holder: UncheckedAccount<'info>,

    /// Position to settle — PDA verified via holder + vault seeds
    #[account(
        mut,
        seeds = [
            b"position",
            holder.key().as_ref(),
            vault.key().as_ref(),
            &[args.market_discriminant],
            &[args.option_type],
            &args.strike.to_le_bytes(),
            &args.expiry.to_le_bytes(),
        ],
        bump = position.bump,
        constraint = !position.settled @ OptionsError::AlreadySettled,
    )]
    pub position: Box<Account<'info, OptionPosition>>,

    /// Option holder's USDC (receives any payoff if ITM)
    #[account(
        mut,
        token::mint = vault.usdc_mint,
        token::authority = holder,
    )]
    pub holder_usdc: Box<Account<'info, TokenAccount>>,

    /// Keeper must sign
    #[account(
        constraint = keeper.key() == vault.keeper @ OptionsError::UnauthorizedKeeper
    )]
    pub keeper: Signer<'info>,

    pub token_program: Program<'info, Token>,
}

pub fn handler(ctx: Context<SettleExpired>, args: SettleExpiredArgs) -> Result<()> {
    let clock = Clock::get()?;
    let now = clock.unix_timestamp;
    let position = &ctx.accounts.position;

    // Position must be expired
    require!(position.expiry <= now, OptionsError::OptionNotExpired);

    // Validate settlement price against oracle (allow up to 5% deviation)
    let oracle_price = ctx.accounts.iv_oracle.latest_price;
    if oracle_price > 0 {
        let deviation = if args.settlement_price >= oracle_price {
            ((args.settlement_price - oracle_price) as u128)
                .checked_mul(1_000_000)
                .unwrap_or(0)
                .checked_div(oracle_price as u128)
                .unwrap_or(0)
        } else {
            ((oracle_price - args.settlement_price) as u128)
                .checked_mul(1_000_000)
                .unwrap_or(0)
                .checked_div(oracle_price as u128)
                .unwrap_or(0)
        };
        // Allow 5% deviation (50_000 in 1e6 scale)
        require!(deviation <= 50_000, OptionsError::InvalidSettlementPrice);
    }

    let option_type = match args.option_type {
        0 => OptionType::Call,
        1 => OptionType::Put,
        _ => return err!(OptionsError::UnknownMarket),
    };

    // Check if ITM at settlement
    let is_itm = match option_type {
        OptionType::Call => args.settlement_price > position.strike,
        OptionType::Put  => args.settlement_price < position.strike,
    };

    let (net_payoff, fee) = if is_itm {
        let gross = position.intrinsic_payoff(args.settlement_price);
        apply_settlement_fee(gross)
    } else {
        (0u64, 0u64)
    };

    // If ITM, transfer payoff
    if net_payoff > 0 {
        require!(
            ctx.accounts.usdc_vault.amount >= net_payoff,
            OptionsError::InsufficientCollateral
        );

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
                to: ctx.accounts.holder_usdc.to_account_info(),
                authority: ctx.accounts.vault.to_account_info(),
            },
            signer_seeds,
        );
        token::transfer(cpi_ctx, net_payoff)?;
    }

    // ── Update position ──────────────────────────────────────────────────────
    let position = &mut ctx.accounts.position;
    // Capture values before zeroing size
    let size = position.size;
    let strike = position.strike;
    let entry_delta = position.entry_delta;
    position.settled = true;
    position.size = 0;
    position.payoff_received = net_payoff;

    // ── Update vault state ───────────────────────────────────────────────────
    // Decrement OI by the SAME risk-weighted amount that was added in buy_option.
    // buy_option uses: risk_weighted = max_payoff × max(|delta|, 0.2)
    // where max_payoff = spot×size (call) or strike×size (put)
    let vault = &mut ctx.accounts.vault;
    let max_payoff_per_unit = match ctx.accounts.position.option_type {
        OptionType::Call => ctx.accounts.iv_oracle.latest_price,
        OptionType::Put  => strike,
    };
    let max_payoff = (max_payoff_per_unit as u128)
        .saturating_mul(size as u128)
        .checked_div(SCALE as u128)
        .unwrap_or(0);
    let weight = (entry_delta.unsigned_abs().max(200_000)).min(1_000_000) as u128;
    let risk_weighted_notional = (max_payoff.saturating_mul(weight) / (SCALE as u128)) as u64;
    vault.open_interest = vault.open_interest.saturating_sub(risk_weighted_notional);
    vault.total_collateral = vault.total_collateral.saturating_sub(net_payoff);
    vault.fees_collected = vault.fees_collected.saturating_add(fee);
    // Restore net delta: vault was short delta when it sold the option; on close, add it back
    let delta_contribution = (entry_delta as i128)
        .saturating_mul(size as i128)
        .checked_div(SCALE as i128)
        .unwrap_or(0) as i64;
    vault.delta_net = vault.delta_net.saturating_add(delta_contribution);

    msg!(
        "Position settled: itm={}, settlement_price={}, net_payoff={}, fee={}",
        is_itm, args.settlement_price, net_payoff, fee
    );
    Ok(())
}
