use anchor_lang::prelude::*;
use crate::state::vault::Market;
use crate::state::position::OptionType;

/// Constant-product AMM pool for a specific (market, type, strike, expiry) series
#[account]
#[derive(Debug)]
pub struct AmmPool {
    pub bump: u8,

    /// Parent vault
    pub vault: Pubkey,

    /// Underlying market
    pub market: Market,

    /// Call or Put
    pub option_type: OptionType,

    /// Strike price (6 dec USDC)
    pub strike: u64,

    /// Expiry timestamp
    pub expiry: i64,

    /// Option units in the pool reserve (6 dec)
    pub reserve_options: u64,

    /// USDC in the pool reserve (6 dec)
    pub reserve_usdc: u64,

    /// k = reserve_options * reserve_usdc (constant product invariant)
    /// stored as u128 to avoid overflow
    pub k_invariant_lo: u64,
    pub k_invariant_hi: u64,

    /// Total LP tokens minted (6 dec)
    pub total_lp_tokens: u64,

    /// Cumulative fees earned by LPs (6 dec USDC)
    pub fees_earned: u64,

    /// Last rebalance timestamp
    pub last_rebalance: i64,

    pub _padding: [u8; 32],
}

impl AmmPool {
    pub const LEN: usize = 8   // discriminator
        + 1   // bump
        + 32  // vault
        + 1   // market
        + 1   // option_type
        + 8   // strike
        + 8   // expiry
        + 8   // reserve_options
        + 8   // reserve_usdc
        + 8   // k_invariant_lo
        + 8   // k_invariant_hi
        + 8   // total_lp_tokens
        + 8   // fees_earned
        + 8   // last_rebalance
        + 32; // padding

    /// Read k as u128
    pub fn k_invariant(&self) -> u128 {
        (self.k_invariant_hi as u128) << 64 | self.k_invariant_lo as u128
    }

    /// Write k from u128
    pub fn set_k_invariant(&mut self, k: u128) {
        self.k_invariant_lo = k as u64;
        self.k_invariant_hi = (k >> 64) as u64;
    }

    /// Spot price implied by pool reserves (USDC per option unit, 6 dec)
    pub fn spot_price(&self) -> Option<u64> {
        if self.reserve_options == 0 {
            return None;
        }
        // price = reserve_usdc / reserve_options (both 6 dec → result 6 dec)
        let price = (self.reserve_usdc as u128)
            .checked_mul(1_000_000)?
            .checked_div(self.reserve_options as u128)?;
        Some(price as u64)
    }

    /// Quote USDC cost to buy `option_amount` from the pool (AMM out-swap)
    /// Returns (usdc_cost, new_reserve_options, new_reserve_usdc)
    pub fn quote_buy(&self, option_amount: u64) -> Option<(u64, u64, u64)> {
        let k = self.k_invariant();
        let new_reserve_options = self.reserve_options.checked_sub(option_amount)?;
        if new_reserve_options == 0 {
            return None;
        }
        let new_reserve_usdc_u128 = k.checked_div(new_reserve_options as u128)?;
        if new_reserve_usdc_u128 > u64::MAX as u128 {
            return None;
        }
        let new_reserve_usdc = new_reserve_usdc_u128 as u64;
        let usdc_cost = new_reserve_usdc.checked_sub(self.reserve_usdc)?;
        Some((usdc_cost, new_reserve_options, new_reserve_usdc))
    }

    /// Quote USDC received to sell `option_amount` into the pool (AMM in-swap)
    /// Returns (usdc_out, new_reserve_options, new_reserve_usdc)
    pub fn quote_sell(&self, option_amount: u64) -> Option<(u64, u64, u64)> {
        let k = self.k_invariant();
        let new_reserve_options = self.reserve_options.checked_add(option_amount)?;
        let new_reserve_usdc_u128 = k.checked_div(new_reserve_options as u128)?;
        if new_reserve_usdc_u128 > u64::MAX as u128 {
            return None;
        }
        let new_reserve_usdc = new_reserve_usdc_u128 as u64;
        let usdc_out = self.reserve_usdc.checked_sub(new_reserve_usdc)?;
        Some((usdc_out, new_reserve_options, new_reserve_usdc))
    }
}
