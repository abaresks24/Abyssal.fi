use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer, CloseAccount};
use crate::state::vault::OptionVault;
use crate::state::iv_oracle::IVOracle;
use crate::state::listing::{OptionListing, WrittenPosition};
use crate::state::position::OptionType;
use crate::math::fixed_point::{apply_settlement_fee, SCALE};
use crate::error::OptionsError;

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct SettleWrittenOptionArgs {
    /// Settlement price provided by caller — validated against oracle (5% tolerance)
    pub settlement_price: u64,
}

#[derive(Accounts)]
pub struct SettleWrittenOption<'info> {
    #[account(
        seeds = [b"vault", vault.authority.as_ref()],
        bump = vault.bump,
    )]
    pub vault: Box<Account<'info, OptionVault>>,

    #[account(
        seeds = [
            b"iv_oracle",
            vault.key().as_ref(),
            &[written_position.market as u8],
        ],
        bump = iv_oracle.bump,
        constraint = iv_oracle.vault == vault.key(),
    )]
    pub iv_oracle: Box<Account<'info, IVOracle>>,

    /// The listing that originated this written option (needed for escrow PDA derivation)
    /// May already be inactive (active = false) — that is expected.
    #[account(
        mut,
        seeds = [b"listing", listing.seller.as_ref(), &listing.nonce.to_le_bytes()],
        bump = listing.bump,
        constraint = listing.key() == written_position.listing @ OptionsError::InvalidSeries,
        close = writer,
    )]
    pub listing: Box<Account<'info, OptionListing>>,

    /// Buyer's claim — must not be settled yet
    #[account(
        mut,
        seeds = [
            b"written_position",
            written_position.buyer.as_ref(),
            listing.key().as_ref(),
        ],
        bump = written_position.bump,
        constraint = !written_position.settled @ OptionsError::AlreadySettled,
    )]
    pub written_position: Box<Account<'info, WrittenPosition>>,

    /// Escrow PDA authority
    /// CHECK: seeds verified
    #[account(
        seeds = [b"listing_escrow", listing.key().as_ref()],
        bump,
    )]
    pub escrow_pda: AccountInfo<'info>,

    /// Escrow USDC — holds writer's collateral
    #[account(
        mut,
        seeds = [b"listing_escrow_usdc", listing.key().as_ref()],
        bump,
        token::mint = vault.usdc_mint,
        token::authority = escrow_pda,
    )]
    pub escrow_usdc: Box<Account<'info, TokenAccount>>,

    /// Buyer's USDC — receives payoff if ITM
    #[account(
        mut,
        token::mint = vault.usdc_mint,
        constraint = buyer_usdc.owner == written_position.buyer @ OptionsError::Unauthorized,
    )]
    pub buyer_usdc: Box<Account<'info, TokenAccount>>,

    /// Writer's USDC — receives remaining collateral
    /// CHECK: address verified against written_position.writer
    #[account(
        mut,
        token::mint = vault.usdc_mint,
        constraint = writer_usdc.owner == written_position.writer @ OptionsError::Unauthorized,
    )]
    pub writer_usdc: Box<Account<'info, TokenAccount>>,

    /// Writer's system account (receives rent from closed accounts)
    /// CHECK: address verified against written_position.writer
    #[account(
        mut,
        constraint = writer.key() == written_position.writer @ OptionsError::Unauthorized,
    )]
    pub writer: UncheckedAccount<'info>,

    /// Anyone can call this (permissionless settlement after expiry).
    /// The payer just covers transaction fees.
    #[account(mut)]
    pub payer: Signer<'info>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<SettleWrittenOption>, args: SettleWrittenOptionArgs) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    let wp  = &ctx.accounts.written_position;

    require!(wp.expiry <= now, OptionsError::OptionNotExpired);

    // Validate settlement price against oracle (allow ±5%)
    let oracle_price = ctx.accounts.iv_oracle.latest_price;
    if oracle_price > 0 {
        let deviation = if args.settlement_price >= oracle_price {
            ((args.settlement_price - oracle_price) as u128)
                .checked_mul(1_000_000).unwrap_or(u128::MAX)
                .checked_div(oracle_price as u128).unwrap_or(u128::MAX)
        } else {
            ((oracle_price - args.settlement_price) as u128)
                .checked_mul(1_000_000).unwrap_or(u128::MAX)
                .checked_div(oracle_price as u128).unwrap_or(u128::MAX)
        };
        require!(deviation <= 50_000, OptionsError::InvalidSettlementPrice);
    }

    // ITM check
    let is_itm = match wp.option_type {
        OptionType::Call => args.settlement_price > wp.strike,
        OptionType::Put  => args.settlement_price < wp.strike,
    };

    // Gross payoff = |settlement_price - strike| * size / SCALE
    let gross_payoff: u64 = if is_itm {
        let price_diff = match wp.option_type {
            OptionType::Call => args.settlement_price.saturating_sub(wp.strike),
            OptionType::Put  => wp.strike.saturating_sub(args.settlement_price),
        };
        (price_diff as u128)
            .saturating_mul(wp.size as u128)
            .checked_div(SCALE as u128)
            .unwrap_or(0) as u64
    } else {
        0
    };

    // Settlement fee (5 bps of payoff, capped at 50 USDC)
    let (net_payoff, _fee) = if gross_payoff > 0 {
        apply_settlement_fee(gross_payoff)
    } else {
        (0u64, 0u64)
    };

    // Cap payoff at locked collateral (safety)
    let net_payoff = net_payoff.min(wp.collateral_locked);
    let remaining  = wp.collateral_locked.saturating_sub(net_payoff);

    let listing_key  = ctx.accounts.listing.key();
    let escrow_bump  = ctx.bumps.escrow_pda;
    let seeds: &[&[u8]] = &[b"listing_escrow", listing_key.as_ref(), &[escrow_bump]];
    let signer_seeds = &[seeds];

    // Transfer payoff to buyer (if ITM)
    if net_payoff > 0 {
        token::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from:      ctx.accounts.escrow_usdc.to_account_info(),
                    to:        ctx.accounts.buyer_usdc.to_account_info(),
                    authority: ctx.accounts.escrow_pda.to_account_info(),
                },
                signer_seeds,
            ),
            net_payoff,
        )?;
    }

    // Return remaining collateral to writer
    if remaining > 0 {
        token::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from:      ctx.accounts.escrow_usdc.to_account_info(),
                    to:        ctx.accounts.writer_usdc.to_account_info(),
                    authority: ctx.accounts.escrow_pda.to_account_info(),
                },
                signer_seeds,
            ),
            remaining,
        )?;
    }

    // Close the escrow token account — rent back to writer
    token::close_account(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            CloseAccount {
                account:     ctx.accounts.escrow_usdc.to_account_info(),
                destination: ctx.accounts.writer.to_account_info(),
                authority:   ctx.accounts.escrow_pda.to_account_info(),
            },
            signer_seeds,
        ),
    )?;

    // Mark settled
    let wp = &mut ctx.accounts.written_position;
    wp.settled          = true;
    wp.payoff_received  = net_payoff;

    msg!(
        "Written option settled: itm={} settlement_price={} net_payoff={} remaining_to_writer={}",
        is_itm, args.settlement_price, net_payoff, remaining
    );

    Ok(())
}
