use anchor_lang::prelude::*;
use crate::state::price_buffer::{PriceBuffer, PRICE_BUFFER_SIZE};
use crate::state::vault::Market;

/// On-chain IV oracle for a single market
/// Stores the AFVR surface parameters and a rolling price buffer
#[account]
#[derive(Debug)]
pub struct IVOracle {
    pub bump: u8,

    /// Parent vault
    pub vault: Pubkey,

    /// Which underlying asset
    pub market: Market,

    /// ATM implied volatility (scaled 1_000_000, i.e. 1.0 = 100%)
    pub iv_atm: u64,

    /// Skew (rho): signed, scaled 1_000_000
    pub iv_skew_rho: i64,

    /// Curvature (phi): scaled 1_000_000
    pub iv_curvature_phi: u64,

    /// Term structure parameter (theta): scaled 1_000_000
    pub theta_param: u64,

    /// Last update timestamp
    pub last_update: i64,

    /// Rolling price buffer (60 observations, ~1 per minute)
    pub price_buffer: PriceBuffer,

    /// Latest oracle price (6 dec USDC)
    pub latest_price: u64,

    /// Latest price timestamp
    pub latest_price_ts: i64,

    pub _padding: [u8; 32],
}

impl IVOracle {
    pub const LEN: usize = 8   // discriminator
        + 1   // bump
        + 32  // vault
        + 1   // market
        + 8   // iv_atm
        + 8   // iv_skew_rho
        + 8   // iv_curvature_phi
        + 8   // theta_param
        + 8   // last_update
        // PriceBuffer: prices[60]*8 + timestamps[60]*8 + head + count = 961
        + (PRICE_BUFFER_SIZE * 8 + PRICE_BUFFER_SIZE * 8 + 1 + 1)
        + 8   // latest_price
        + 8   // latest_price_ts
        + 32; // padding

    /// Compute IV for a given moneyness m = ln(F/K) and time-to-expiry T (years, scaled 1e6)
    /// Uses the AFVR parametric surface:
    ///   σ(m, T) = iv_atm * sqrt(theta_param / T) * (1 + rho*m + phi/2 * m^2)
    ///
    /// All inputs/outputs are 6-decimal fixed-point.
    /// Returns IV scaled by 1_000_000 (i.e. 0.2 = 200_000 means 20% annualised)
    pub fn iv_for_moneyness_time(&self, moneyness_scaled: i64, time_years_scaled: u64) -> Option<u64> {
        if time_years_scaled == 0 {
            return None;
        }
        let scale: u128 = 1_000_000;

        // term_struct = sqrt(theta / T), theta and T both scaled 1e6
        // theta / T = (theta_param * scale) / time_years_scaled
        let theta_over_t = (self.theta_param as u128)
            .checked_mul(scale)?
            .checked_div(time_years_scaled as u128)?;
        let term_struct = isqrt_u128(theta_over_t); // scaled sqrt (scaled 1e3)

        // smile = 1 + rho*m + phi/2 * m^2, all scaled 1e6
        // m is moneyness_scaled (signed, scaled 1e6)
        let m = moneyness_scaled;
        let m_sq = (m as i128)
            .checked_mul(m as i128)?
            .checked_div(scale as i128)?; // m^2 scaled 1e6

        let rho_m = (self.iv_skew_rho as i128)
            .checked_mul(m as i128)?
            .checked_div(scale as i128)?; // rho*m scaled 1e6

        let phi_m2 = (self.iv_curvature_phi as i128)
            .checked_mul(m_sq)?
            .checked_div(2 * scale as i128)?; // phi/2 * m^2 scaled 1e6

        let smile = (scale as i128) + rho_m + phi_m2;
        if smile <= 0 {
            return None;
        }

        // iv = iv_atm * term_struct * smile / scale^2
        let iv = (self.iv_atm as u128)
            .checked_mul(term_struct)?
            .checked_mul(smile as u128)?
            .checked_div(scale * scale)?;

        // Clamp to [0.01, 5.0] (1% to 500%)
        let min_iv: u128 = 10_000;    // 1%
        let max_iv: u128 = 5_000_000; // 500%
        let iv_clamped = iv.max(min_iv).min(max_iv);
        Some(iv_clamped as u64)
    }
}

/// Integer square root of a u128, returning floor(sqrt(x))
fn isqrt_u128(x: u128) -> u128 {
    if x == 0 {
        return 0;
    }
    let mut z = x;
    let mut y = (x + 1) / 2;
    while y < z {
        z = y;
        y = (y + x / y) / 2;
    }
    z
}
