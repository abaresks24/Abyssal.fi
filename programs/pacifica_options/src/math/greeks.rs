/// Option Greeks (Delta, Gamma, Theta, Vega)
/// All inputs/outputs are fixed-point with SCALE = 1_000_000

use crate::math::fixed_point::*;
use crate::math::black_scholes::*;
use crate::state::position::OptionType;

/// Compute standard normal PDF at x (scaled 1e6)
/// φ(x) = (1/√(2π)) * exp(-x²/2)
/// Returns scaled 1e6
fn normal_pdf(x: i64) -> u64 {
    let x_sq_half: i64 = ((x as i128 * x as i128) / (2 * SCALE_I as i128))
        .min(i64::MAX as i128) as i64;
    let exp_val = fp_exp(-x_sq_half).unwrap_or(0);
    // multiply by 1/sqrt(2π) ≈ 0.398942 = 398_942 / 1_000_000
    fp_mul(exp_val, 398_942).unwrap_or(0)
}

/// Bundle of all computed Greeks
#[derive(Debug, Clone, Copy, Default)]
pub struct Greeks {
    /// Delta: ∂C/∂S or ∂P/∂S, signed, scaled 1e6
    /// Call delta ∈ (0, 1], Put delta ∈ [-1, 0)
    pub delta: i64,

    /// Gamma: ∂²C/∂S², unsigned, scaled 1e6
    pub gamma: u64,

    /// Theta: time decay per day, signed (always negative), scaled 1e6
    pub theta: i64,

    /// Vega: ∂C/∂σ per 1% vol move, unsigned, scaled 1e6
    pub vega: u64,
}

/// Compute d1 given BS parameters (all scaled 1e6)
/// Returns d1 scaled 1e6
pub fn compute_d1(spot: u64, strike: u64, sigma: u64, time_years: u64) -> Option<i64> {
    if spot == 0 || strike == 0 || sigma == 0 || time_years == 0 {
        return None;
    }

    let scale = SCALE_U128;

    let f_over_k = (spot as u128)
        .checked_mul(scale)?
        .checked_div(strike as u128)?;
    let ln_fk = fp_ln(f_over_k as u64)?;

    let sigma_sq = fp_mul(sigma, sigma)?;
    let half_sigma_sq_t = ((sigma_sq as u128)
        .checked_mul(time_years as u128)?
        .checked_div(2 * scale)?) as i64;

    let sigma_sqrt_t = fp_mul(sigma, fp_sqrt(time_years)?)?;
    if sigma_sqrt_t == 0 {
        return None;
    }

    let d1_num = ln_fk.checked_add(half_sigma_sq_t)?;
    fp_div_i(d1_num, sigma_sqrt_t as i64)
}

/// Compute all Greeks at once
pub fn compute_greeks(
    option_type: OptionType,
    spot: u64,
    strike: u64,
    sigma: u64,
    time_years: u64,
) -> Option<Greeks> {
    if time_years == 0 {
        // At expiry: delta is 0 or ±1, others are 0/infinite
        let itm = match option_type {
            OptionType::Call => spot > strike,
            OptionType::Put => spot < strike,
        };
        let delta = if itm {
            match option_type {
                OptionType::Call => SCALE_I,
                OptionType::Put => -SCALE_I,
            }
        } else {
            0
        };
        return Some(Greeks { delta, gamma: 0, theta: 0, vega: 0 });
    }

    let d1 = compute_d1(spot, strike, sigma, time_years)?;
    let sigma_sqrt_t = fp_mul(sigma, fp_sqrt(time_years)?)?;
    let d2 = d1.checked_sub(sigma_sqrt_t as i64)?;

    // ── Delta ────────────────────────────────────────────────────────────────
    // Call: N(d1)  Put: N(d1) - 1 = -N(-d1)
    let nd1 = normal_cdf(d1);
    let delta = match option_type {
        OptionType::Call => nd1 as i64,
        OptionType::Put  => (nd1 as i64) - SCALE_I,
    };

    // ── Gamma ────────────────────────────────────────────────────────────────
    // Γ = φ(d1) / (S * σ * √T)
    // All scaled: phi * SCALE / (S * sigma_sqrt_t)
    let phi_d1 = normal_pdf(d1);
    let s_sigma_sqrt_t = fp_mul(spot, sigma_sqrt_t)?;
    let gamma = if s_sigma_sqrt_t > 0 {
        fp_div(phi_d1, s_sigma_sqrt_t).unwrap_or(0)
    } else {
        0
    };

    // ── Theta ────────────────────────────────────────────────────────────────
    // Θ = -S * φ(d1) * σ / (2 * √T)  [per year, r=0]
    // Per day: divide by 365
    // = -(S * phi * sigma) / (2 * sqrt_T * SCALE)
    let sqrt_t = fp_sqrt(time_years)?;
    let theta_num = fp_mul(spot, fp_mul(phi_d1, sigma)?)?;
    let theta_denom = fp_mul(2 * (SCALE as u64 / 1), sqrt_t)?; // 2 * sqrt_T
    let theta_year = if theta_denom > 0 {
        fp_div(theta_num, theta_denom).unwrap_or(0)
    } else {
        0
    };
    // Convert to per-day
    let theta_day = theta_year / 365;
    // Theta is negative (time decay costs the option holder)
    let theta = -(theta_day as i64);

    // ── Vega ─────────────────────────────────────────────────────────────────
    // ν = S * φ(d1) * √T  [per unit of vol, r=0]
    // Per 1% vol (i.e. per 0.01 = 10_000 in our scale):
    let vega_per_vol = fp_mul(spot, fp_mul(phi_d1, sqrt_t)?)?;
    // Vega per 1% = vega_per_vol / 100
    let vega = vega_per_vol / 100;

    Some(Greeks { delta, gamma, theta, vega })
}

/// Compute just delta (fast path)
pub fn compute_delta(
    option_type: OptionType,
    spot: u64,
    strike: u64,
    sigma: u64,
    time_years: u64,
) -> Option<i64> {
    if time_years == 0 {
        let itm = match option_type {
            OptionType::Call => spot > strike,
            OptionType::Put => spot < strike,
        };
        return Some(if itm {
            match option_type {
                OptionType::Call => SCALE_I,
                OptionType::Put => -SCALE_I,
            }
        } else { 0 });
    }
    let d1 = compute_d1(spot, strike, sigma, time_years)?;
    let nd1 = normal_cdf(d1);
    let delta = match option_type {
        OptionType::Call => nd1 as i64,
        OptionType::Put  => (nd1 as i64) - SCALE_I,
    };
    Some(delta)
}
