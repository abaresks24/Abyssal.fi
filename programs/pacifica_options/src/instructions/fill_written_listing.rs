use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};
use crate::state::vault::OptionVault;
use crate::state::listing::{OptionListing, ListingType, WrittenPosition};
use crate::error::OptionsError;

#[derive(Accounts)]
pub struct FillWrittenListing<'info> {
    #[account(
        seeds = [b"vault", vault.authority.as_ref()],
        bump = vault.bump,
    )]
    pub vault: Box<Account<'info, OptionVault>>,

    /// The written listing to fill
    #[account(
        mut,
        seeds = [b"listing", listing.seller.as_ref(), &listing.nonce.to_le_bytes()],
        bump = listing.bump,
        constraint = listing.active               @ OptionsError::ListingInactive,
        constraint = listing.vault == vault.key() @ OptionsError::InvalidSeries,
        constraint = listing.listing_type == ListingType::Written @ OptionsError::InvalidSeries,
    )]
    pub listing: Box<Account<'info, OptionListing>>,

    /// Buyer's claim on the written option — created by this instruction
    #[account(
        init,
        payer = buyer,
        space = WrittenPosition::LEN,
        seeds = [b"written_position", buyer.key().as_ref(), listing.key().as_ref()],
        bump,
    )]
    pub written_position: Box<Account<'info, WrittenPosition>>,

    /// Buyer's USDC — pays the writer's premium
    #[account(
        mut,
        token::mint = vault.usdc_mint,
        token::authority = buyer,
    )]
    pub buyer_usdc: Box<Account<'info, TokenAccount>>,

    /// Writer receives the premium here
    /// CHECK: owner verified against listing.seller
    #[account(
        mut,
        token::mint = vault.usdc_mint,
        constraint = writer_usdc.owner == listing.seller @ OptionsError::Unauthorized,
    )]
    pub writer_usdc: Box<Account<'info, TokenAccount>>,

    #[account(mut)]
    pub buyer: Signer<'info>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

pub fn handler(ctx: Context<FillWrittenListing>) -> Result<()> {
    require!(!ctx.accounts.vault.paused, OptionsError::ProtocolPaused);

    let now = Clock::get()?.unix_timestamp;
    require!(ctx.accounts.listing.expiry > now, OptionsError::OptionExpired);

    // A listing can only be filled once
    require!(
        ctx.accounts.buyer.key() != ctx.accounts.listing.seller,
        OptionsError::Unauthorized
    );

    let ask_price = ctx.accounts.listing.ask_price;
    require!(
        ctx.accounts.buyer_usdc.amount >= ask_price,
        OptionsError::InsufficientUsdc
    );

    // Transfer premium: buyer → writer
    token::transfer(
        CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from:      ctx.accounts.buyer_usdc.to_account_info(),
                to:        ctx.accounts.writer_usdc.to_account_info(),
                authority: ctx.accounts.buyer.to_account_info(),
            },
        ),
        ask_price,
    )?;

    // Initialise the buyer's WrittenPosition
    {
        let l  = &ctx.accounts.listing;
        let wp = &mut ctx.accounts.written_position;
        wp.bump               = ctx.bumps.written_position;
        wp.listing            = ctx.accounts.listing.key();
        wp.writer             = l.seller;
        wp.buyer              = ctx.accounts.buyer.key();
        wp.market             = l.market;
        wp.option_type        = l.option_type;
        wp.strike             = l.strike;
        wp.expiry             = l.expiry;
        wp.size               = l.size;
        wp.premium_paid       = ask_price;
        wp.collateral_locked  = l.collateral_locked;
        wp.settled            = false;
        wp.payoff_received    = 0;
        wp.created_at         = now;
        wp._padding           = [0u8; 32];
    }

    // Mark listing as filled (keep account alive for settle_written_option escrow derivation)
    ctx.accounts.listing.active = false;

    msg!(
        "Written listing filled: size={} premium={} collateral={}",
        ctx.accounts.listing.size,
        ask_price,
        ctx.accounts.listing.collateral_locked
    );

    Ok(())
}
