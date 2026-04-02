use anchor_lang::prelude::*;
use crate::state::vault::Market;
use crate::state::position::OptionType;

/// Whether the listing is a resale of an existing position or a freshly written option
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Debug)]
pub enum ListingType {
    /// Seller re-sells an existing protocol-issued OptionPosition.
    /// At fill time, seller's position.size decreases; buyer's increases.
    /// The protocol vault remains the counterparty for eventual payoff.
    Resale,

    /// Seller writes a new option from scratch and locks collateral.
    /// At fill time, a WrittenPosition is created.
    /// At expiry, payoff is paid from the writer's escrowed collateral — NOT from the vault.
    Written,
}

/// A P2P marketplace listing — either a resale or a freshly written option.
///
/// PDA seeds: ["listing", seller, nonce_le8]
/// The seller picks any unique u64 nonce (e.g. current timestamp in ms).
#[account]
#[derive(Debug)]
pub struct OptionListing {
    pub bump: u8,

    pub listing_type: ListingType,

    /// Wallet that created the listing
    pub seller: Pubkey,

    /// Protocol vault this listing references
    pub vault: Pubkey,

    // ── Option parameters ─────────────────────────────────────────────────────
    pub market: Market,
    pub option_type: OptionType,
    pub strike: u64,              // USDC, 6-decimal fixed-point
    pub expiry: i64,              // Unix timestamp

    /// Number of option contracts being sold (6-decimal, underlying units)
    pub size: u64,

    /// Total USDC the buyer must pay the seller (6 dec).
    /// For Resale: resale premium. For Written: writer's premium.
    pub ask_price: u64,

    /// USDC locked in escrow (Written only; 0 for Resale).
    pub collateral_locked: u64,

    /// Seller-chosen nonce for unique PDA derivation
    pub nonce: u64,

    pub created_at: i64,

    /// false once filled or cancelled
    pub active: bool,

    pub _padding: [u8; 32],
}

impl OptionListing {
    pub const LEN: usize = 8   // discriminator
        + 1   // bump
        + 1   // listing_type
        + 32  // seller
        + 32  // vault
        + 1   // market
        + 1   // option_type
        + 8   // strike
        + 8   // expiry
        + 8   // size
        + 8   // ask_price
        + 8   // collateral_locked
        + 8   // nonce
        + 8   // created_at
        + 1   // active
        + 32; // padding
}

/// Buyer's claim against a Written option.
///
/// Created when a Written OptionListing is filled.
/// The writer's USDC collateral sits in an escrow token account whose
/// authority PDA is ["listing_escrow", listing_pubkey].
///
/// PDA seeds: ["written_position", buyer, listing_pubkey]
#[account]
#[derive(Debug)]
pub struct WrittenPosition {
    pub bump: u8,

    /// Back-reference to the OptionListing (used to derive escrow PDAs)
    pub listing: Pubkey,

    pub writer: Pubkey,
    pub buyer: Pubkey,

    pub market: Market,
    pub option_type: OptionType,
    pub strike: u64,
    pub expiry: i64,
    pub size: u64,

    /// USDC premium paid by buyer to writer at fill time
    pub premium_paid: u64,

    /// Mirrors listing.collateral_locked at fill time
    pub collateral_locked: u64,

    pub settled: bool,

    /// Net payoff received by buyer at settlement (0 if OTM)
    pub payoff_received: u64,

    pub created_at: i64,

    pub _padding: [u8; 32],
}

impl WrittenPosition {
    pub const LEN: usize = 8   // discriminator
        + 1   // bump
        + 32  // listing
        + 32  // writer
        + 32  // buyer
        + 1   // market
        + 1   // option_type
        + 8   // strike
        + 8   // expiry
        + 8   // size
        + 8   // premium_paid
        + 8   // collateral_locked
        + 1   // settled
        + 8   // payoff_received
        + 8   // created_at
        + 32; // padding
}
