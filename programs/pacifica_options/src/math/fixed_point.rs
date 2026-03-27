/// Fixed-point arithmetic utilities
/// All values use 6-decimal precision: SCALE = 1_000_000
///
/// Notation:
///   fp(x)   = x * SCALE
///   fp_mul  = (a * b) / SCALE  (both inputs already scaled)
///   fp_div  = (a * SCALE) / b

pub const SCALE: u64 = 1_000_000;
pub const SCALE_I: i64 = 1_000_000;
pub const SCALE_U128: u128 = 1_000_000;

// ── Basic operations ─────────────────────────────────────────────────────────

/// Multiply two scaled u64 values, returning a scaled u64
/// Returns None on overflow
#[inline]
pub fn fp_mul(a: u64, b: u64) -> Option<u64> {
    (a as u128)
        .checked_mul(b as u128)?
        .checked_div(SCALE_U128)
        .map(|v| v as u64)
}

/// Multiply two signed scaled i64 values
#[inline]
pub fn fp_mul_i(a: i64, b: i64) -> Option<i64> {
    (a as i128)
        .checked_mul(b as i128)?
        .checked_div(SCALE_I as i128)
        .map(|v| v as i64)
}

/// Divide two scaled u64 values, returning a scaled u64
#[inline]
pub fn fp_div(a: u64, b: u64) -> Option<u64> {
    if b == 0 {
        return None;
    }
    (a as u128)
        .checked_mul(SCALE_U128)?
        .checked_div(b as u128)
        .map(|v| v as u64)
}

/// Divide two signed scaled i64 values
#[inline]
pub fn fp_div_i(a: i64, b: i64) -> Option<i64> {
    if b == 0 {
        return None;
    }
    (a as i128)
        .checked_mul(SCALE_I as i128)?
        .checked_div(b as i128)
        .map(|v| v as i64)
}

// ── Square root ──────────────────────────────────────────────────────────────

/// Integer square root of a u128
#[inline]
pub fn isqrt_u128(x: u128) -> u128 {
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

/// sqrt of a fixed-point u64 (input and output both scaled by SCALE)
/// sqrt(a_fp) = isqrt(a_fp * SCALE)
#[inline]
pub fn fp_sqrt(a: u64) -> Option<u64> {
    let val = (a as u128).checked_mul(SCALE_U128)?;
    Some(isqrt_u128(val) as u64)
}

// ── Natural logarithm (fixed-point) ─────────────────────────────────────────
/// Compute ln(x) where x is a fixed-point u64 (x / SCALE is the real value).
/// Returns a signed i64 also scaled by SCALE.
/// Uses a Padé-like series valid for x in [0.5, 2.0], reducing via ln(x) = n*ln(2) + ln(x/2^n).
pub fn fp_ln(x: u64) -> Option<i64> {
    if x == 0 {
        return None; // ln(0) undefined
    }

    // Work in i128 with extra precision
    let scale: i128 = SCALE as i128;
    let mut val: i128 = x as i128; // represents real value val / scale

    // Reduce: find n such that val ≈ scale (i.e. 1.0)
    // Use: ln(x) = k * ln(2) + ln(x / 2^k)
    // ln(2) ≈ 693_147 (scaled 1e6)
    const LN2: i128 = 693_147;

    let mut k: i32 = 0;
    // Scale val to [SCALE/2, SCALE) i.e. [0.5, 1.0)
    while val >= scale * 2 {
        val /= 2;
        k += 1;
    }
    while val < scale {
        val *= 2;
        k -= 1;
    }
    // Now val is in [SCALE, 2*SCALE), i.e. real value in [1, 2)
    // Use ln(1+u) series for u = (val - scale) / scale ∈ [0, 1)
    // ln(1+u) = u - u^2/2 + u^3/3 - u^4/4 + ...
    // Better: use identity ln(x) = 2 * arctanh((x-1)/(x+1))
    // t = (val - scale) / (val + scale)  ← |t| < 0.5
    // ln(val/scale) = 2*t*(1 + t^2/3 + t^5/5 + ...)

    let num: i128 = val - scale;
    let den: i128 = val + scale;
    // t = num/den, scaled by scale
    let t = num.checked_mul(scale)?.checked_div(den)?;
    let t2 = t.checked_mul(t)?.checked_div(scale)?; // t^2

    // Series: sum = t * (1 + t2/3 + t2^2/5 + t2^3/7 + ...)
    // We'll compute up to t^9 terms
    let mut term = t;
    let mut sum = t;
    for i in 1..6u32 {
        term = term.checked_mul(t2)?.checked_div(scale)?;
        let denom = (2 * i + 1) as i128;
        sum = sum.checked_add(term.checked_div(denom)?)?;
    }
    let ln_reduced = sum.checked_mul(2)?;

    // Add k * ln(2)
    let result = ln_reduced + (k as i128) * LN2;
    // Result is scaled by SCALE
    Some(result as i64)
}

// ── Exponential (fixed-point) ────────────────────────────────────────────────
/// Compute exp(x) where x is i64 scaled by SCALE.
/// Returns u64 scaled by SCALE.
/// Valid range: x in [-20 * SCALE, 20 * SCALE]
pub fn fp_exp(x: i64) -> Option<u64> {
    // Use Taylor series: exp(x) = 1 + x + x^2/2! + x^3/3! + ...
    // For large |x|, use repeated squaring after range reduction

    let scale: i128 = SCALE as i128;
    let xv: i128 = x as i128;

    // Range reduction: exp(x) = exp(k*ln2 + r) = 2^k * exp(r)
    // k = floor(x / ln2_fp)
    const LN2: i128 = 693_147;
    let k = xv.checked_div(LN2)?;
    let r = xv - k * LN2; // r ∈ [0, ln2)

    // Taylor series for exp(r)
    let mut result: i128 = scale;
    let mut term: i128 = scale;
    for i in 1..=15i128 {
        term = term.checked_mul(r)?.checked_div(scale)?.checked_div(i)?;
        result = result.checked_add(term)?;
        if term.abs() < 1 {
            break;
        }
    }

    // Scale by 2^k
    if k >= 0 {
        let shift = k as u32;
        if shift >= 64 {
            return None;
        }
        let scaled = (result as u128).checked_mul(1u128 << shift)?;
        if scaled > u64::MAX as u128 {
            return None;
        }
        Some(scaled as u64)
    } else {
        let shift = (-k) as u32;
        if shift >= 64 {
            return Some(0); // underflow → 0
        }
        let scaled = result.checked_div(1i128 << shift)?;
        if scaled < 0 {
            return Some(0);
        }
        Some(scaled as u64)
    }
}

// ── Fee calculations ─────────────────────────────────────────────────────────

/// Platform trading fee: 5 basis points = 0.05%
/// fee = amount * 5 / 10_000
pub const PLATFORM_FEE_BPS: u64 = 5;
pub const BPS_DENOMINATOR: u64 = 10_000;

#[inline]
pub fn apply_platform_fee(amount: u64) -> (u64, u64) {
    let fee = (amount as u128)
        .saturating_mul(PLATFORM_FEE_BPS as u128)
        .checked_div(BPS_DENOMINATOR as u128)
        .unwrap_or(0) as u64;
    let net = amount.saturating_sub(fee);
    (net, fee)
}

/// Settlement fee: 5 bps of payoff, capped at 50 USDC (50_000_000 with 6 dec)
pub const SETTLEMENT_FEE_BPS: u64 = 5;
pub const SETTLEMENT_FEE_CAP: u64 = 50_000_000; // 50 USDC in 6 dec

#[inline]
pub fn apply_settlement_fee(payoff: u64) -> (u64, u64) {
    let fee_raw = (payoff as u128)
        .saturating_mul(SETTLEMENT_FEE_BPS as u128)
        .checked_div(BPS_DENOMINATOR as u128)
        .unwrap_or(0) as u64;
    let fee = fee_raw.min(SETTLEMENT_FEE_CAP);
    let net = payoff.saturating_sub(fee);
    (net, fee)
}
