use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};
use crate::state::vault::OptionVault;
use crate::state::iv_oracle::IVOracle;
use crate::state::listing::{OptionListing, ListingType};
use crate::state::position::OptionType;
use crate::instructions::buy_option::{market_from_u8, option_type_from_u8};
use crate::math::fixed_point::SCALE;
use crate::error::OptionsError;

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct WriteOptionListingArgs {
    pub market_discriminant: u8,
    pub option_type: u8,
    pub strike: u64,
    pub expiry: i64,
    pub size: u64,
    /// Premium the writer wants to receive (total USDC for the entire size)
    pub ask_price: u64,
    /// Seller-chosen unique nonce
    pub nonce: u64,
}

#[derive(Accounts)]
#[instruction(args: WriteOptionListingArgs)]
pub struct WriteOptionListing<'info> {
    #[account(
        seeds = [b"vault", vault.authority.as_ref()],
        bump = vault.bump,
    )]
    pub vault: Box<Account<'info, OptionVault>>,

    /// Oracle supplies the current spot price (needed to size Call collateral)
    #[account(
        seeds = [b"iv_oracle", vault.key().as_ref(), &[args.market_discriminant]],
        bump = iv_oracle.bump,
        constraint = iv_oracle.vault == vault.key(),
    )]
    pub iv_oracle: Box<Account<'info, IVOracle>>,

    #[account(
        init,
        payer = writer,
        space = OptionListing::LEN,
        seeds = [b"listing", writer.key().as_ref(), &args.nonce.to_le_bytes()],
        bump,
    )]
    pub listing: Box<Account<'info, OptionListing>>,

    /// PDA that acts as authority over the escrow token account.
    /// No data — purely a signing key.
    /// CHECK: seeds-only PDA, verified by constraint
    #[account(
        seeds = [b"listing_escrow", listing.key().as_ref()],
        bump,
    )]
    pub escrow_pda: AccountInfo<'info>,

    /// USDC escrow: holds the writer's collateral until settlement or cancellation
    #[account(
        init,
        payer = writer,
        token::mint = vault.usdc_mint,
        token::authority = escrow_pda,
        seeds = [b"listing_escrow_usdc", listing.key().as_ref()],
        bump,
    )]
    pub escrow_usdc: Box<Account<'info, TokenAccount>>,

    #[account(
        mut,
        token::mint = vault.usdc_mint,
        token::authority = writer,
    )]
    pub writer_usdc: Box<Account<'info, TokenAccount>>,

    #[account(mut)]
    pub writer: Signer<'info>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

pub fn handler(ctx: Context<WriteOptionListing>, args: WriteOptionListingArgs) -> Result<()> {
    require!(!ctx.accounts.vault.paused, OptionsError::ProtocolPaused);
    require!(args.size > 0, OptionsError::InvalidSize);
    require!(args.strike > 0, OptionsError::InvalidStrike);
    require!(args.ask_price > 0, OptionsError::ZeroPremium);

    let now = Clock::get()?.unix_timestamp;
    require!(args.expiry > now + 3600,     OptionsError::ExpiryTooClose);
    require!(args.expiry <= now + 7_776_000, OptionsError::ExpiryTooFar);

    let oracle = &ctx.accounts.iv_oracle;
    require!(now - oracle.latest_price_ts <= 60, OptionsError::StalePriceFeed);
    let spot = oracle.latest_price;
    require!(spot > 0, OptionsError::InvalidSettlementPrice);

    let market      = market_from_u8(args.market_discriminant)?;
    let option_type = option_type_from_u8(args.option_type)?;

    // ── Collateral requirement ───────────────────────────────────────────────
    // Put:  max payoff = strike (if spot → 0), so lock strike × size / SCALE
    // Call: max payoff is unbounded; use 2× current spot as conservative cap
    let collateral: u64 = match option_type {
        OptionType::Put => {
            (args.strike as u128)
                .checked_mul(args.size as u128)
                .ok_or(OptionsError::MathOverflow)?
                .checked_div(SCALE as u128)
                .ok_or(OptionsError::MathOverflow)? as u64
        }
        OptionType::Call => {
            let cap = (spot as u128)
                .checked_mul(2)
                .ok_or(OptionsError::MathOverflow)?;
            cap.checked_mul(args.size as u128)
                .ok_or(OptionsError::MathOverflow)?
                .checked_div(SCALE as u128)
                .ok_or(OptionsError::MathOverflow)? as u64
        }
    };

    require!(
        ctx.accounts.writer_usdc.amount >= collateral,
        OptionsError::InsufficientUsdc
    );

    // Transfer collateral writer → escrow
    token::transfer(
        CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from:      ctx.accounts.writer_usdc.to_account_info(),
                to:        ctx.accounts.escrow_usdc.to_account_info(),
                authority: ctx.accounts.writer.to_account_info(),
            },
        ),
        collateral,
    )?;

    let listing = &mut ctx.accounts.listing;
    listing.bump              = ctx.bumps.listing;
    listing.listing_type      = ListingType::Written;
    listing.seller            = ctx.accounts.writer.key();
    listing.vault             = ctx.accounts.vault.key();
    listing.market            = market;
    listing.option_type       = option_type;
    listing.strike            = args.strike;
    listing.expiry            = args.expiry;
    listing.size              = args.size;
    listing.ask_price         = args.ask_price;
    listing.collateral_locked = collateral;
    listing.nonce             = args.nonce;
    listing.created_at        = now;
    listing.active            = true;
    listing._padding          = [0u8; 32];

    msg!(
        "Written listing created: {:?} {:?} K={} T={} size={} ask={} collateral={}",
        market, option_type, args.strike, args.expiry, args.size, args.ask_price, collateral
    );

    Ok(())
}
