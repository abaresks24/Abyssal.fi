use anchor_lang::prelude::*;

/// Supported underlying markets
/// Discriminants must be stable — never reorder, only append.
/// Crypto: 0–2 | Equities: 3–8 | Commodities: 9–14
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Debug)]
pub enum Market {
    // ── Crypto ───────────────────────────────────────────────────────────────
    BTC,      // 0
    ETH,      // 1
    SOL,      // 2
    // ── Equities ─────────────────────────────────────────────────────────────
    NVDA,     // 3
    TSLA,     // 4
    PLTR,     // 5
    CRCL,     // 6
    HOOD,     // 7
    SP500,    // 8
    // ── Commodities ──────────────────────────────────────────────────────────
    XAU,      // 9  – Gold
    XAG,      // 10 – Silver
    PAXG,     // 11 – PAX Gold
    PLATINUM, // 12
    NATGAS,   // 13 – Natural Gas
    COPPER,   // 14
}

/// IV parameterisation stored on-chain (AFVR surface)
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug, Default)]
pub struct IVParams {
    /// ATM implied volatility in fixed-point (1_000_000 = 100%)
    pub iv_atm: u64,
    /// Skew parameter rho (signed, scaled by 1_000_000)
    pub iv_skew_rho: i64,
    /// Curvature parameter phi (scaled by 1_000_000)
    pub iv_curvature_phi: u64,
    /// Term-structure theta (scaled by 1_000_000)
    pub theta_param: u64,
}

/// Root vault account – one per protocol deployment
#[account]
#[derive(Debug)]
pub struct OptionVault {
    /// Bump seed for PDA derivation
    pub bump: u8,

    /// Protocol authority (admin / upgrader)
    pub authority: Pubkey,

    /// Designated keeper (IV updates, rebalancing, auto-settle)
    pub keeper: Pubkey,

    /// USDC mint this vault accepts
    pub usdc_mint: Pubkey,

    /// Vault USDC token account (holds all collateral)
    pub usdc_vault: Pubkey,

    /// Total USDC collateral locked for open options (6 dec)
    pub total_collateral: u64,

    /// Total open interest in notional USDC (6 dec)
    pub open_interest: u64,

    /// Net delta of all open positions (signed, scaled 1_000_000)
    /// Positive = net long delta, negative = net short delta
    pub delta_net: i64,

    /// Current IV surface parameters (updated by keeper)
    pub iv_params: IVParams,

    /// Unix timestamp of last IV parameter update
    pub last_iv_update: i64,

    /// Cumulative platform fees collected (6 dec USDC)
    pub fees_collected: u64,

    /// Whether the protocol is halted
    pub paused: bool,

    /// Total vLP tokens in circulation (global vault LP shares)
    /// Stored in the first 8 bytes of the former _padding field
    pub total_vlp_tokens: u64,

    /// Reserved space for future fields
    pub _padding: [u8; 56],
}

impl OptionVault {
    pub const LEN: usize = 8  // discriminator
        + 1   // bump
        + 32  // authority
        + 32  // keeper
        + 32  // usdc_mint
        + 32  // usdc_vault
        + 8   // total_collateral
        + 8   // open_interest
        + 8   // delta_net
        + (8 + 8 + 8 + 8) // iv_params
        + 8   // last_iv_update
        + 8   // fees_collected
        + 1   // paused
        + 8   // total_vlp_tokens
        + 56; // padding
}
