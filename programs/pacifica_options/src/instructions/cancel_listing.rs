use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer, CloseAccount};
use crate::state::vault::OptionVault;
use crate::state::listing::{OptionListing, ListingType};
use crate::error::OptionsError;

// ─── Cancel Resale Listing ────────────────────────────────────────────────────

#[derive(Accounts)]
pub struct CancelResaleListing<'info> {
    #[account(
        seeds = [b"vault", vault.authority.as_ref()],
        bump = vault.bump,
    )]
    pub vault: Box<Account<'info, OptionVault>>,

    #[account(
        mut,
        seeds = [b"listing", seller.key().as_ref(), &listing.nonce.to_le_bytes()],
        bump = listing.bump,
        constraint = listing.active               @ OptionsError::ListingInactive,
        constraint = listing.seller == seller.key() @ OptionsError::Unauthorized,
        constraint = listing.listing_type == ListingType::Resale @ OptionsError::InvalidSeries,
        close = seller,
    )]
    pub listing: Box<Account<'info, OptionListing>>,

    #[account(mut)]
    pub seller: Signer<'info>,

    pub system_program: Program<'info, System>,
}

pub fn cancel_resale_handler(ctx: Context<CancelResaleListing>) -> Result<()> {
    msg!("Resale listing cancelled: nonce={}", ctx.accounts.listing.nonce);
    Ok(())
    // `close = seller` on listing account returns lamports to seller automatically
}

// ─── Cancel Written Listing ───────────────────────────────────────────────────

#[derive(Accounts)]
pub struct CancelWrittenListing<'info> {
    #[account(
        seeds = [b"vault", vault.authority.as_ref()],
        bump = vault.bump,
    )]
    pub vault: Box<Account<'info, OptionVault>>,

    #[account(
        mut,
        seeds = [b"listing", writer.key().as_ref(), &listing.nonce.to_le_bytes()],
        bump = listing.bump,
        constraint = listing.active                @ OptionsError::ListingInactive,
        constraint = listing.seller == writer.key() @ OptionsError::Unauthorized,
        constraint = listing.listing_type == ListingType::Written @ OptionsError::InvalidSeries,
        close = writer,
    )]
    pub listing: Box<Account<'info, OptionListing>>,

    /// PDA authority over the escrow token account
    /// CHECK: seeds verified
    #[account(
        seeds = [b"listing_escrow", listing.key().as_ref()],
        bump,
    )]
    pub escrow_pda: AccountInfo<'info>,

    /// Escrow token account holding the collateral — will be drained and closed
    #[account(
        mut,
        seeds = [b"listing_escrow_usdc", listing.key().as_ref()],
        bump,
        token::mint = vault.usdc_mint,
        token::authority = escrow_pda,
    )]
    pub escrow_usdc: Box<Account<'info, TokenAccount>>,

    /// Writer's USDC — receives the collateral back
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
}

pub fn cancel_written_handler(ctx: Context<CancelWrittenListing>) -> Result<()> {
    let collateral = ctx.accounts.listing.collateral_locked;
    let listing_key = ctx.accounts.listing.key();
    let escrow_bump = ctx.bumps.escrow_pda;

    let seeds: &[&[u8]] = &[
        b"listing_escrow",
        listing_key.as_ref(),
        &[escrow_bump],
    ];
    let signer_seeds = &[seeds];

    // Return collateral: escrow → writer
    if collateral > 0 {
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
            collateral,
        )?;
    }

    // Close the escrow token account — return rent lamports to writer
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

    msg!("Written listing cancelled: collateral {} returned to writer", collateral);
    Ok(())
}
