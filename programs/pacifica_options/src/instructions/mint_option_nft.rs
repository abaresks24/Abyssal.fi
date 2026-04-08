/// Mints an NFT receipt for an option position.
///
/// Called immediately after `buy_option` in the same transaction.
/// The NFT is a Metaplex token with name "ABYSSAL {MARKET} {CALL|PUT} ${STRIKE}".
/// It lives in the buyer's wallet as on-chain proof of option ownership.
///
/// Design: separate instruction (not inline with buy_option) to keep
/// BuyOption's try_accounts frame within the 4096-byte BPF stack limit.
///
/// Burns:
///   • `sell_option`    — on full position close (seller signs)
///   • `exercise_option`— on ITM exercise (holder signs)
use anchor_lang::prelude::*;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::metadata::{
    create_metadata_accounts_v3,
    mpl_token_metadata::types::DataV2,
    CreateMetadataAccountsV3, Metadata,
};
use anchor_spl::token::{self, Mint, MintTo, Token, TokenAccount};
use crate::state::vault::OptionVault;
use crate::state::position::{OptionPosition, OptionType};
use crate::error::OptionsError;

#[derive(Accounts)]
pub struct MintOptionNft<'info> {
    /// Global vault — used as PDA signer for mint authority
    #[account(
        seeds = [b"vault", vault.authority.as_ref()],
        bump  = vault.bump,
    )]
    pub vault: Box<Account<'info, OptionVault>>,

    /// The buyer's option position — must have size > 0 (already bought)
    #[account(
        constraint = position.owner == buyer.key() @ OptionsError::Unauthorized,
        constraint = position.size  > 0            @ OptionsError::InvalidSize,
    )]
    pub position: Box<Account<'info, OptionPosition>>,

    /// NFT mint — one per position, 0 decimals, vault PDA is the authority.
    /// seed = ["option_nft", position_pubkey]
    #[account(
        init_if_needed,
        payer  = buyer,
        seeds  = [b"option_nft", position.key().as_ref()],
        bump,
        mint::decimals         = 0,
        mint::authority        = vault,
        mint::freeze_authority = vault,
    )]
    pub nft_mint: Box<Account<'info, Mint>>,

    /// Buyer's associated token account for the NFT
    #[account(
        init_if_needed,
        payer                       = buyer,
        associated_token::mint      = nft_mint,
        associated_token::authority = buyer,
    )]
    pub buyer_nft_ata: Box<Account<'info, TokenAccount>>,

    /// Metaplex metadata account — created by the Token Metadata program
    /// CHECK: The Token Metadata program verifies and writes this account.
    #[account(mut)]
    pub nft_metadata: UncheckedAccount<'info>,

    #[account(mut)]
    pub buyer: Signer<'info>,

    pub token_metadata_program:  Program<'info, Metadata>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub token_program:            Program<'info, Token>,
    pub system_program:           Program<'info, System>,
    pub rent:                     Sysvar<'info, Rent>,
}

pub fn handler(ctx: Context<MintOptionNft>) -> Result<()> {
    // Only mint once — if the ATA already holds the NFT, this is a no-op.
    if ctx.accounts.buyer_nft_ata.amount >= 1 {
        return Ok(());
    }

    let authority_key = ctx.accounts.vault.authority;
    let vault_bump    = ctx.accounts.vault.bump;
    let vault_seeds: &[&[u8]] = &[b"vault", authority_key.as_ref(), &[vault_bump]];
    let signer_seeds  = &[vault_seeds];

    // ── Mint 1 NFT token to buyer's ATA ────────────────────────────────────
    let mint_cpi = CpiContext::new_with_signer(
        ctx.accounts.token_program.to_account_info(),
        MintTo {
            mint:      ctx.accounts.nft_mint.to_account_info(),
            to:        ctx.accounts.buyer_nft_ata.to_account_info(),
            authority: ctx.accounts.vault.to_account_info(),
        },
        signer_seeds,
    );
    token::mint_to(mint_cpi, 1)?;

    // ── Build NFT name: "ABYSSAL BTC CALL $95000" ──────────────────────────
    let pos        = &ctx.accounts.position;
    let market_str = market_label(pos.market);
    let type_str   = if matches!(pos.option_type, OptionType::Call) { "CALL" } else { "PUT" };
    let strike_k   = pos.strike / 1_000_000;      // 6-dec → whole USD

    let mut name_buf = [0u8; 32];
    let name_str = build_nft_name(&mut name_buf, market_str, type_str, strike_k);

    // ── Create Metaplex on-chain metadata ──────────────────────────────────
    let meta_cpi = CpiContext::new_with_signer(
        ctx.accounts.token_metadata_program.to_account_info(),
        CreateMetadataAccountsV3 {
            metadata:         ctx.accounts.nft_metadata.to_account_info(),
            mint:             ctx.accounts.nft_mint.to_account_info(),
            mint_authority:   ctx.accounts.vault.to_account_info(),
            payer:            ctx.accounts.buyer.to_account_info(),
            update_authority: ctx.accounts.vault.to_account_info(),
            system_program:   ctx.accounts.system_program.to_account_info(),
            rent:             ctx.accounts.rent.to_account_info(),
        },
        signer_seeds,
    );
    create_metadata_accounts_v3(
        meta_cpi,
        DataV2 {
            name:                    name_str.to_string(),
            symbol:                  "ABYS".to_string(),
            uri:                     "".to_string(),
            seller_fee_basis_points: 0,
            creators:                None,
            collection:              None,
            uses:                    None,
        },
        false, // is_mutable
        true,  // update_authority_is_signer
        None,  // collection_details
    )?;

    msg!(
        "Option NFT minted: {} → mint={}",
        name_str,
        ctx.accounts.nft_mint.key()
    );
    Ok(())
}

// ── Helpers ───────────────────────────────────────────────────────────────────

use crate::state::vault::Market;

fn market_label(m: Market) -> &'static str {
    match m {
        Market::BTC      => "BTC",
        Market::ETH      => "ETH",
        Market::SOL      => "SOL",
        Market::NVDA     => "NVDA",
        Market::TSLA     => "TSLA",
        Market::PLTR     => "PLTR",
        Market::CRCL     => "CRCL",
        Market::HOOD     => "HOOD",
        Market::SP500    => "SP500",
        Market::XAU      => "XAU",
        Market::XAG      => "XAG",
        Market::PAXG     => "PAXG",
        Market::PLATINUM => "PLAT",
        Market::NATGAS   => "GAS",
        Market::COPPER   => "CU",
    }
}

/// Build "ABYSSAL BTC CALL $95000" into a stack-allocated buffer.
/// Avoids heap allocation / format! which would increase BPF stack usage.
fn build_nft_name<'a>(buf: &'a mut [u8; 32], market: &str, opt_type: &str, strike_k: u64) -> &'a str {
    let mut pos = 0usize;

    macro_rules! append {
        ($bytes:expr) => {
            for &b in $bytes {
                if pos < 32 { buf[pos] = b; pos += 1; }
            }
        };
    }

    append!(b"ABYSSAL ");
    append!(market.as_bytes());
    append!(b" ");
    append!(opt_type.as_bytes());
    append!(b" $");

    // Decimal digits for strike (no alloc)
    let mut digits = [0u8; 10];
    let mut n = strike_k;
    let mut dlen = 0usize;
    if n == 0 {
        digits[0] = b'0'; dlen = 1;
    } else {
        while n > 0 && dlen < 10 {
            digits[dlen] = b'0' + (n % 10) as u8;
            n /= 10;
            dlen += 1;
        }
        digits[..dlen].reverse();
    }
    append!(&digits[..dlen]);

    core::str::from_utf8(&buf[..pos]).unwrap_or("ABYSSAL OPTION")
}
