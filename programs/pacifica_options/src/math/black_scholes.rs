/// Black-Scholes pricing for European options
/// All values are fixed-point with SCALE = 1_000_000
///
/// Formula (call):
///   C = F * N(d1) - K * e^(-rT) * N(d2)   [for European on future, r=0 → C = F*N(d1) - K*N(d2)]
///
/// d1 = [ln(F/K) + 0.5 * σ² * T] / (σ * √T)
/// d2 = d1 - σ * √T
///
/// We assume r = 0 (since options are on perpetuals, which embed funding; no separate risk-free rate).

use crate::math::fixed_point::*;

/// Hart (1968) approximation of the standard normal CDF N(x)
/// Input x is i64 scaled by SCALE (e.g. x = 500_000 means 0.5)
/// Returns u64 scaled by SCALE, in [0, 1_000_000]
pub fn normal_cdf(x: i64) -> u64 {
    // If x < -6 or x > 6, clamp to [0, 1]
    const SIX: i64 = 6 * SCALE_I;
    if x <= -SIX {
        return 0;
    }
    if x >= SIX {
        return SCALE;
    }

    // Work in high-precision i128, scaled by 1e12
    const HP: i128 = 1_000_000_000_000i128; // 1e12
    let scale: i128 = SCALE_I as i128;

    // Compute t = 1 / (1 + 0.2316419 * |x|)
    // Using rational approximation (Abramowitz & Stegun 26.2.17)
    // with p=0.2316419, b1..b5 coefficients
    let x_abs: i128 = (x.abs() as i128) * (HP / scale); // x_abs scaled to 1e12

    // p = 0.2316419 * |x| + 1 (denominator term), scaled 1e12
    // 0.2316419 ≈ 231_642 / 1_000_000
    let p_num: i128 = HP + 231_642i128 * x_abs / 1_000_000i128; // 1 + 0.231642*|x|, scaled 1e12
    if p_num == 0 {
        return if x >= 0 { SCALE } else { 0 };
    }
    let t: i128 = HP * HP / p_num; // t = 1 / p_num, scaled 1e12

    // Polynomial: poly = t*(b1 + t*(b2 + t*(b3 + t*(b4 + t*b5))))
    // b1 =  0.319381530 →  319_381_530 / 1e9
    // b2 = -0.356563782 → -356_563_782 / 1e9
    // b3 =  1.781477937 →  1_781_477_937 / 1e9
    // b4 = -1.821255978 → -1_821_255_978 / 1e9
    // b5 =  1.330274429 →  1_330_274_429 / 1e9
    // Scale coefficients to 1e12
    const B1: i128 =  319_382i128; // * 1e6
    const B2: i128 = -356_564i128;
    const B3: i128 =  1_781_478i128;
    const B4: i128 = -1_821_256i128;
    const B5: i128 =  1_330_274i128;

    let t_sc = t / 1_000_000i128; // t scaled to 1e6 for polynomial
    let poly5 = B5;
    let poly4 = B4 + (poly5 * t_sc) / 1_000_000;
    let poly3 = B3 + (poly4 * t_sc) / 1_000_000;
    let poly2 = B2 + (poly3 * t_sc) / 1_000_000;
    let poly1 = B1 + (poly2 * t_sc) / 1_000_000;
    let poly  = (poly1 * t_sc) / 1_000_000; // final polynomial, scaled 1e6

    // phi(x) = (1/sqrt(2π)) * exp(-x²/2)
    // x² / 2 = x_abs² / (2 * 1e12), but x_abs is scaled 1e12
    // We compute exp(-x²/2) using fp_exp
    let x_fp = x.abs(); // back to 1e6 scale
    // x²/2 in 1e6: (x * x) / (2 * 1e6)
    let x2_half: i64 = ((x_fp as i128 * x_fp as i128) / (2 * scale))
        .min(i64::MAX as i128) as i64;
    let exp_val = fp_exp(-x2_half).unwrap_or(0) as i128; // scaled 1e6

    // phi = exp_val / sqrt(2π) ≈ exp_val * 398_942 / 1_000_000
    // 1/sqrt(2π) ≈ 0.398942
    let phi = (exp_val * 398_942i128) / 1_000_000i128; // scaled 1e6

    // cdf_complement = phi * poly  (both 1e6 scale → divide by 1e6)
    let cdf_comp = (phi * poly) / 1_000_000i128; // scaled 1e6

    // For positive x: N(x) = 1 - cdf_comp
    // For negative x: N(x) = cdf_comp
    let result = if x >= 0 {
        (scale - cdf_comp).max(0) as u64
    } else {
        cdf_comp.max(0) as u64
    };

    result.min(SCALE)
}

/// Black-Scholes call price (European, r=0)
///
/// Inputs (all scaled by SCALE = 1_000_000):
///   spot:   current price F (or S) of underlying
///   strike: K
///   sigma:  annualised volatility (e.g. 0.5 = 500_000)
///   time_to_expiry: T in years (e.g. 0.25 = 250_000)
///
/// Output: call premium scaled by SCALE (in same units as spot/strike)
pub fn black_scholes_call(spot: u64, strike: u64, sigma: u64, time_to_expiry: u64) -> Option<u64> {
    if spot == 0 || strike == 0 || sigma == 0 || time_to_expiry == 0 {
        return None;
    }

    let scale = SCALE_U128;

    // ln(F/K) — both scaled 1e6, result scaled 1e6
    let f_over_k = (spot as u128)
        .checked_mul(scale)?
        .checked_div(strike as u128)?;
    let ln_fk = fp_ln(f_over_k as u64)?; // i64, scaled 1e6

    // σ²/2 * T (scaled 1e6)
    let sigma_sq = fp_mul(sigma, sigma)?; // σ² scaled 1e6
    let half_sigma_sq_t = (sigma_sq as u128)
        .checked_mul(time_to_expiry as u128)?
        .checked_div(2 * scale)?;
    let half_sigma_sq_t = half_sigma_sq_t as i64;

    // σ * √T (scaled 1e6)
    let sigma_sqrt_t = {
        let st = fp_mul(sigma, fp_sqrt(time_to_expiry)?)?;
        st
    };

    if sigma_sqrt_t == 0 {
        return None;
    }

    // d1 = (ln(F/K) + σ²/2 * T) / (σ*√T)
    let d1_num: i64 = ln_fk.checked_add(half_sigma_sq_t)?;
    let d1 = fp_div_i(d1_num, sigma_sqrt_t as i64)?;

    // d2 = d1 - σ*√T
    let d2 = d1.checked_sub(sigma_sqrt_t as i64)?;

    let nd1 = normal_cdf(d1);
    let nd2 = normal_cdf(d2);

    // C = F * N(d1) - K * N(d2), all scaled 1e6
    let f_nd1 = fp_mul(spot, nd1)?;
    let k_nd2 = fp_mul(strike, nd2)?;
    let call = f_nd1.checked_sub(k_nd2)?;
    Some(call)
}

/// Black-Scholes put price via put-call parity: P = C - F + K  (r=0)
pub fn black_scholes_put(spot: u64, strike: u64, sigma: u64, time_to_expiry: u64) -> Option<u64> {
    let call = black_scholes_call(spot, strike, sigma, time_to_expiry)?;
    // P = C + K - F  (with r=0, forward price F = S)
    let put = call
        .checked_add(strike)?
        .checked_sub(spot)
        .or_else(|| Some(0))?;
    Some(put)
}

/// Compute time to expiry in years as a fixed-point u64
/// now_ts: current Unix timestamp (seconds)
/// expiry_ts: expiry Unix timestamp (seconds)
/// Returns None if already expired
/// Returns time in years scaled by SCALE
pub fn time_to_expiry_years(now_ts: i64, expiry_ts: i64) -> Option<u64> {
    if expiry_ts <= now_ts {
        return None;
    }
    let secs = (expiry_ts - now_ts) as u64;
    const SECONDS_PER_YEAR: u64 = 31_536_000;
    // T = secs / SECONDS_PER_YEAR, scaled by SCALE
    (secs as u128)
        .checked_mul(SCALE_U128)?
        .checked_div(SECONDS_PER_YEAR as u128)
        .map(|v| v as u64)
}
