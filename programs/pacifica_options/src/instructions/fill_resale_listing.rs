use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer, Mint};
use anchor_spl::associated_token::AssociatedToken;
use crate::state::vault::OptionVault;
use crate::state::position::OptionPosition;
use crate::state::listing::{OptionListing, ListingType};
use crate::error::OptionsError;

/// No extra args — everything is read from the listing account.
#[derive(Accounts)]
pub struct FillResaleListing<'info> {
    #[account(
        seeds = [b"vault", vault.authority.as_ref()],
        bump = vault.bump,
    )]
    pub vault: Box<Account<'info, OptionVault>>,

    /// The listing to fill — PDA verified via stored seller + nonce
    #[account(
        mut,
        seeds = [b"listing", listing.seller.as_ref(), &listing.nonce.to_le_bytes()],
        bump = listing.bump,
        constraint = listing.active          @ OptionsError::ListingInactive,
        constraint = listing.vault == vault.key() @ OptionsError::InvalidSeries,
        constraint = listing.listing_type == ListingType::Resale @ OptionsError::InvalidSeries,
    )]
    pub listing: Box<Account<'info, OptionListing>>,

    /// Seller's position — size must cover what's listed
    #[account(
        mut,
        seeds = [
            b"position",
            listing.seller.as_ref(),
            vault.key().as_ref(),
            &[listing.market as u8],
            &[listing.option_type as u8],
            &listing.strike.to_le_bytes(),
            &listing.expiry.to_le_bytes(),
        ],
        bump = seller_position.bump,
        constraint = seller_position.owner == listing.seller @ OptionsError::Unauthorized,
        constraint = !seller_position.settled @ OptionsError::AlreadySettled,
        constraint = seller_position.size >= listing.size @ OptionsError::InvalidSize,
    )]
    pub seller_position: Box<Account<'info, OptionPosition>>,

    /// Buyer's position for this series — created if it doesn't exist yet
    #[account(
        init_if_needed,
        payer = buyer,
        space = OptionPosition::LEN,
        seeds = [
            b"position",
            buyer.key().as_ref(),
            vault.key().as_ref(),
            &[listing.market as u8],
            &[listing.option_type as u8],
            &listing.strike.to_le_bytes(),
            &listing.expiry.to_le_bytes(),
        ],
        bump,
    )]
    pub buyer_position: Box<Account<'info, OptionPosition>>,

    /// Buyer pays the ask price from here
    #[account(
        mut,
        token::mint = vault.usdc_mint,
        token::authority = buyer,
    )]
    pub buyer_usdc: Box<Account<'info, TokenAccount>>,

    /// Seller receives the ask price here
    /// CHECK: address verified against listing.seller
    #[account(
        mut,
        token::mint = vault.usdc_mint,
        constraint = seller_usdc.owner == listing.seller @ OptionsError::Unauthorized,
    )]
    pub seller_usdc: Box<Account<'info, TokenAccount>>,

    #[account(mut)]
    pub buyer: Signer<'info>,

    // ── NFT transfer (seller → buyer) ────────────────────────────────────────
    /// NFT mint for the seller's original position
    #[account(
        mut,
        seeds = [b"option_nft", seller_position.key().as_ref()],
        bump,
    )]
    pub nft_mint: Box<Account<'info, Mint>>,

    /// Seller's NFT ATA (source) — owned by listing.seller
    #[account(
        mut,
        token::mint = nft_mint,
        constraint = seller_nft_ata.owner == listing.seller @ OptionsError::Unauthorized,
    )]
    pub seller_nft_ata: Box<Account<'info, TokenAccount>>,

    /// Buyer's NFT ATA (destination) — init_if_needed
    #[account(
        init_if_needed,
        payer = buyer,
        associated_token::mint = nft_mint,
        associated_token::authority = buyer,
    )]
    pub buyer_nft_ata: Box<Account<'info, TokenAccount>>,

    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

pub fn handler(ctx: Context<FillResaleListing>) -> Result<()> {
    require!(!ctx.accounts.vault.paused, OptionsError::ProtocolPaused);

    let now = Clock::get()?.unix_timestamp;
    require!(ctx.accounts.listing.expiry > now, OptionsError::OptionExpired);
    require!(
        ctx.accounts.buyer_usdc.amount >= ctx.accounts.listing.ask_price,
        OptionsError::InsufficientUsdc
    );

    let ask_price = ctx.accounts.listing.ask_price;
    let size      = ctx.accounts.listing.size;
    // For clean NFT transfer semantics, require full-position resale.
    // Partial resales would leave the NFT with the seller but split size.
    require!(
        size == ctx.accounts.seller_position.size,
        OptionsError::InvalidSize
    );

    // ── Transfer ask_price: buyer → seller ───────────────────────────────────
    token::transfer(
        CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from:      ctx.accounts.buyer_usdc.to_account_info(),
                to:        ctx.accounts.seller_usdc.to_account_info(),
                authority: ctx.accounts.buyer.to_account_info(),
            },
        ),
        ask_price,
    )?;

    // ── Update seller's position ─────────────────────────────────────────────
    {
        let sp = &mut ctx.accounts.seller_position;
        sp.size = sp.size.saturating_sub(size);
    }

    // ── Update / initialise buyer's position ────────────────────────────────
    {
        let bp = &mut ctx.accounts.buyer_position;
        if bp.owner == Pubkey::default() {
            // First-time init
            let listing = &ctx.accounts.listing;
            bp.bump          = ctx.bumps.buyer_position;
            bp.owner         = ctx.accounts.buyer.key();
            bp.vault         = ctx.accounts.vault.key();
            bp.market        = listing.market;
            bp.option_type   = listing.option_type;
            bp.strike        = listing.strike;
            bp.expiry        = listing.expiry;
            bp.size          = 0;
            bp.premium_paid  = 0;
            bp.entry_iv      = 0;
            bp.entry_delta   = 0;
            bp.settled       = false;
            bp.payoff_received = 0;
            bp.created_at    = now;
            bp._padding      = [0u8; 32];
        }
        bp.size = bp.size
            .checked_add(size)
            .ok_or(OptionsError::MathOverflow)?;
        bp.premium_paid = bp.premium_paid.saturating_add(ask_price);
    }

    // ── Transfer NFT (seller → buyer) via pre-approved vault delegate ────────
    {
        let authority_key = ctx.accounts.vault.authority;
        let vault_bump = ctx.accounts.vault.bump;
        let vault_seeds: &[&[u8]] = &[b"vault", authority_key.as_ref(), &[vault_bump]];
        let signer_seeds = &[vault_seeds];
        token::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from:      ctx.accounts.seller_nft_ata.to_account_info(),
                    to:        ctx.accounts.buyer_nft_ata.to_account_info(),
                    authority: ctx.accounts.vault.to_account_info(),
                },
                signer_seeds,
            ),
            1,
        )?;
    }
    // Re-approve vault as delegate over the buyer's new ATA (buyer signs this fill tx)
    token::approve(
        CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            token::Approve {
                to:        ctx.accounts.buyer_nft_ata.to_account_info(),
                delegate:  ctx.accounts.vault.to_account_info(),
                authority: ctx.accounts.buyer.to_account_info(),
            },
        ),
        1,
    )?;

    // ── Close the listing (return rent to seller) ────────────────────────────
    ctx.accounts.listing.active = false;

    msg!("Resale filled: size={} ask={}", size, ask_price);

    Ok(())
}
