use anchor_lang::prelude::*;
use crate::state::vault::Market;

/// Call or Put
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Debug)]
pub enum OptionType {
    Call,
    Put,
}

/// A single buyer's option position
#[account]
#[derive(Debug)]
pub struct OptionPosition {
    /// Bump for PDA
    pub bump: u8,

    /// Owner wallet
    pub owner: Pubkey,

    /// Reference to the parent vault
    pub vault: Pubkey,

    /// Underlying market
    pub market: Market,

    /// Call or Put
    pub option_type: OptionType,

    /// Strike price in USDC, 6 decimal fixed-point
    /// e.g. 70_000_000_000 = $70,000.000000
    pub strike: u64,

    /// Unix timestamp at which the option expires
    pub expiry: i64,

    /// Size in underlying units, 6 decimal fixed-point
    /// e.g. 1_000_000 = 1.000000 BTC
    pub size: u64,

    /// Total USDC premium paid (including fees), 6 dec
    pub premium_paid: u64,

    /// Entry IV captured at time of purchase (scaled 1_000_000)
    pub entry_iv: u64,

    /// Delta at entry (signed, scaled 1_000_000)
    pub entry_delta: i64,

    /// Whether this position has been settled / exercised
    pub settled: bool,

    /// Payoff received on settlement (0 if OTM), 6 dec USDC
    pub payoff_received: u64,

    /// Creation timestamp
    pub created_at: i64,

    /// Reserved
    pub _padding: [u8; 32],
}

impl OptionPosition {
    pub const LEN: usize = 8  // discriminator
        + 1   // bump
        + 32  // owner
        + 32  // vault
        + 1   // market (enum)
        + 1   // option_type (enum)
        + 8   // strike
        + 8   // expiry
        + 8   // size
        + 8   // premium_paid
        + 8   // entry_iv
        + 8   // entry_delta
        + 1   // settled
        + 8   // payoff_received
        + 8   // created_at
        + 32; // padding

    /// True if the option is in-the-money given `oracle_price`
    pub fn is_itm(&self, oracle_price: u64) -> bool {
        match self.option_type {
            OptionType::Call => oracle_price > self.strike,
            OptionType::Put  => oracle_price < self.strike,
        }
    }

    /// Raw intrinsic payoff (USDC, 6 dec) — caller must check ITM first
    pub fn intrinsic_payoff(&self, oracle_price: u64) -> u64 {
        let price_diff = match self.option_type {
            OptionType::Call => oracle_price.saturating_sub(self.strike),
            OptionType::Put  => self.strike.saturating_sub(oracle_price),
        };
        // payoff = price_diff * size / PRECISION
        // size is in underlying units (6 dec), price_diff is USDC (6 dec)
        // result should be in USDC (6 dec)
        (price_diff as u128)
            .saturating_mul(self.size as u128)
            .checked_div(1_000_000)
            .unwrap_or(0) as u64
    }
}

/// LP position tracking liquidity provided to an AMM pool
#[account]
#[derive(Debug)]
pub struct LPPosition {
    pub bump: u8,
    pub owner: Pubkey,
    pub pool: Pubkey,
    pub lp_tokens: u64,
    pub usdc_deposited: u64,
    pub created_at: i64,
    pub _padding: [u8; 32],
}

impl LPPosition {
    pub const LEN: usize = 8 + 1 + 32 + 32 + 8 + 8 + 8 + 32;
}

/// Global vault LP position — tracks deposit, yield share based on real vault fees.
#[account]
#[derive(Debug)]
pub struct VaultLPPosition {
    pub bump: u8,
    pub owner: Pubkey,
    pub vault: Pubkey,
    /// vLP tokens held by this user
    pub vlp_tokens: u64,
    /// Cumulative USDC deposited (cost basis)
    pub usdc_deposited: u64,
    /// First deposit timestamp
    pub created_at: i64,
    /// Last deposit timestamp
    pub last_deposit_at: i64,
    /// Cumulative USDC already withdrawn
    pub usdc_withdrawn: u64,
    /// Vault's cumulative fees at time of last deposit (checkpoint)
    /// Used to compute the LP's fair share of fees earned since deposit.
    pub fees_checkpoint: u64,
    pub _padding: [u8; 8],
}

impl VaultLPPosition {
    pub const LEN: usize = 8  // discriminator
        + 1   // bump
        + 32  // owner
        + 32  // vault
        + 8   // vlp_tokens
        + 8   // usdc_deposited
        + 8   // created_at
        + 8   // last_deposit_at
        + 8   // usdc_withdrawn
        + 8   // fees_checkpoint
        + 8;  // padding

    /// Max withdrawable = deposited + linearly-vested fee share - already withdrawn.
    ///
    /// Fee share components:
    ///   - Time-weighted: pondere par les secondes ecoulees depuis le depot
    ///   - Vested: tu ne touches pas tout d'un coup, mais lineairement sur
    ///     un cycle de 30 jours. Apres 7j → 7/30 = 23%, apres 30j → 100%.
    ///   - After 30j, full entitlement is unlocked (recharges with new deposits).
    ///
    /// Formule complete:
    ///   raw_share = (fees_now - checkpoint) × vlp / total_vlp
    ///   vested_pct = min(1.0, seconds_elapsed / VESTING_PERIOD)
    ///   max_withdraw = deposited + raw_share × vested_pct - already_withdrawn
    pub fn max_withdrawable(
        &self,
        vault_fees_collected: u64,
        vault_total_vlp: u64,
        now: i64,
    ) -> u64 {
        const VESTING_SECS: u128 = 30 * 24 * 3600; // 30-day vesting

        let raw_share = if vault_total_vlp > 0 && vault_fees_collected >= self.fees_checkpoint {
            let fees_since_deposit = (vault_fees_collected - self.fees_checkpoint) as u128;
            fees_since_deposit
                .saturating_mul(self.vlp_tokens as u128)
                / (vault_total_vlp as u128)
        } else {
            0u128
        };

        // Linear vesting based on time since last deposit
        let elapsed = (now - self.last_deposit_at).max(0) as u128;
        let vested = if elapsed >= VESTING_SECS {
            raw_share
        } else {
            raw_share.saturating_mul(elapsed) / VESTING_SECS
        };

        let total_entitlement = (self.usdc_deposited as u128).saturating_add(vested);
        total_entitlement.saturating_sub(self.usdc_withdrawn as u128) as u64
    }
}
