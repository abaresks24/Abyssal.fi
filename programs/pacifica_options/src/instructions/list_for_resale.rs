use anchor_lang::prelude::*;
use crate::state::vault::OptionVault;
use crate::state::position::OptionPosition;
use crate::state::listing::{OptionListing, ListingType};
use crate::instructions::buy_option::{market_from_u8, option_type_from_u8};
use crate::error::OptionsError;

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct ListForResaleArgs {
    pub market_discriminant: u8,
    pub option_type: u8,
    pub strike: u64,
    pub expiry: i64,
    /// Number of contracts to list (must be ≤ seller's position.size)
    pub size: u64,
    /// Total USDC the seller wants for the entire `size`
    pub ask_price: u64,
    /// Seller-chosen unique nonce (e.g. unix ms timestamp)
    pub nonce: u64,
}

#[derive(Accounts)]
#[instruction(args: ListForResaleArgs)]
pub struct ListForResale<'info> {
    #[account(
        seeds = [b"vault", vault.authority.as_ref()],
        bump = vault.bump,
    )]
    pub vault: Box<Account<'info, OptionVault>>,

    /// Seller's existing position — verified to have enough size and not settled
    #[account(
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
        constraint = position.size >= args.size @ OptionsError::InvalidSize,
    )]
    pub position: Box<Account<'info, OptionPosition>>,

    #[account(
        init,
        payer = seller,
        space = OptionListing::LEN,
        seeds = [b"listing", seller.key().as_ref(), &args.nonce.to_le_bytes()],
        bump,
    )]
    pub listing: Box<Account<'info, OptionListing>>,

    #[account(mut)]
    pub seller: Signer<'info>,

    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<ListForResale>, args: ListForResaleArgs) -> Result<()> {
    require!(!ctx.accounts.vault.paused, OptionsError::ProtocolPaused);
    require!(args.size > 0, OptionsError::InvalidSize);
    require!(args.ask_price > 0, OptionsError::ZeroPremium);

    let now = Clock::get()?.unix_timestamp;
    require!(args.expiry > now, OptionsError::OptionExpired);

    let market     = market_from_u8(args.market_discriminant)?;
    let option_type = option_type_from_u8(args.option_type)?;

    let listing = &mut ctx.accounts.listing;
    listing.bump              = ctx.bumps.listing;
    listing.listing_type      = ListingType::Resale;
    listing.seller            = ctx.accounts.seller.key();
    listing.vault             = ctx.accounts.vault.key();
    listing.market            = market;
    listing.option_type       = option_type;
    listing.strike            = args.strike;
    listing.expiry            = args.expiry;
    listing.size              = args.size;
    listing.ask_price         = args.ask_price;
    listing.collateral_locked = 0;
    listing.nonce             = args.nonce;
    listing.created_at        = now;
    listing.active            = true;
    listing._padding          = [0u8; 32];

    msg!(
        "Resale listing created: {:?} {:?} K={} T={} size={} ask={}",
        market, option_type, args.strike, args.expiry, args.size, args.ask_price
    );

    Ok(())
}
