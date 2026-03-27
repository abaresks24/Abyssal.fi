use anchor_lang::prelude::*;

/// Ring-buffer of the last N price observations
pub const PRICE_BUFFER_SIZE: usize = 60;

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct PriceBuffer {
    /// Circular array of price observations (6 dec USDC)
    pub prices: [u64; PRICE_BUFFER_SIZE],
    /// Timestamps for each price observation
    pub timestamps: [i64; PRICE_BUFFER_SIZE],
    /// Write head index (next slot to overwrite)
    pub head: u8,
    /// Number of valid observations stored (0 to PRICE_BUFFER_SIZE)
    pub count: u8,
}

impl Default for PriceBuffer {
    fn default() -> Self {
        Self {
            prices: [0u64; PRICE_BUFFER_SIZE],
            timestamps: [0i64; PRICE_BUFFER_SIZE],
            head: 0,
            count: 0,
        }
    }
}

impl PriceBuffer {
    /// Push a new price observation
    pub fn push(&mut self, price: u64, timestamp: i64) {
        let idx = self.head as usize;
        self.prices[idx] = price;
        self.timestamps[idx] = timestamp;
        self.head = ((self.head as usize + 1) % PRICE_BUFFER_SIZE) as u8;
        if self.count < PRICE_BUFFER_SIZE as u8 {
            self.count += 1;
        }
    }

    /// Compute time-weighted average price over the stored window.
    /// Uses actual observation durations as weights.
    /// Returns None if no data is available.
    pub fn twap(&self) -> Option<u64> {
        let n = self.count as usize;
        if n == 0 {
            return None;
        }
        if n == 1 {
            return Some(self.prices[0]);
        }

        // The oldest entry is at `head` when the buffer is full, otherwise at 0.
        let start = if self.count < PRICE_BUFFER_SIZE as u8 {
            0usize
        } else {
            self.head as usize
        };

        let mut weighted_sum: u128 = 0;
        let mut total_time: u128 = 0;

        for i in 1..n {
            let prev_idx = (start + i - 1) % PRICE_BUFFER_SIZE;
            let curr_idx = (start + i) % PRICE_BUFFER_SIZE;
            let t_prev = self.timestamps[prev_idx];
            let t_curr = self.timestamps[curr_idx];
            if t_curr <= t_prev || t_prev == 0 || t_curr == 0 {
                continue;
            }
            let dt = (t_curr - t_prev) as u128;
            weighted_sum = weighted_sum.saturating_add(
                (self.prices[prev_idx] as u128).saturating_mul(dt),
            );
            total_time = total_time.saturating_add(dt);
        }

        if total_time == 0 {
            // Fallback: all timestamps identical — use simple mean
            let sum: u128 = (0..n)
                .map(|i| self.prices[(start + i) % PRICE_BUFFER_SIZE] as u128)
                .sum();
            return Some((sum / n as u128) as u64);
        }

        Some((weighted_sum / total_time) as u64)
    }

    /// Compute realized variance from stored prices (for RV component of AFVR)
    /// Returns variance scaled by 1_000_000
    pub fn realized_variance(&self) -> Option<u64> {
        let n = self.count as usize;
        if n < 2 {
            return None;
        }

        // Resolve the oldest entry index (same logic as twap)
        let start = if self.count < PRICE_BUFFER_SIZE as u8 {
            0usize
        } else {
            self.head as usize
        };

        // Collect valid log-return squared observations
        // diff is scaled 1e6, so diff*diff is 1e12 — divide by 1e6 at the end to return 1e6 scale
        let mut sum_sq: u128 = 0;
        let mut valid: u64 = 0;

        for i in 1..n {
            let p_prev = self.prices[(start + i - 1) % PRICE_BUFFER_SIZE];
            let p_curr = self.prices[(start + i) % PRICE_BUFFER_SIZE];
            if p_prev == 0 || p_curr == 0 {
                continue;
            }
            // log-return approximated as (p_curr - p_prev) / p_prev (scaled 1e6)
            let diff = if p_curr >= p_prev {
                ((p_curr - p_prev) as u128)
                    .saturating_mul(1_000_000)
                    .checked_div(p_prev as u128)
                    .unwrap_or(0) as i128
            } else {
                -(((p_prev - p_curr) as u128)
                    .saturating_mul(1_000_000)
                    .checked_div(p_prev as u128)
                    .unwrap_or(0) as i128)
            };
            // diff is 1e6 scale; diff*diff is 1e12 scale
            sum_sq = sum_sq.saturating_add((diff * diff) as u128);
            valid += 1;
        }

        if valid == 0 {
            return None;
        }
        // Divide by valid (average) then by 1_000_000 to rescale from 1e12 back to 1e6
        Some((sum_sq / valid as u128 / 1_000_000) as u64)
    }

    /// Return the most recent price
    pub fn latest(&self) -> Option<u64> {
        if self.count == 0 {
            return None;
        }
        // head points to next write slot, so last written is head - 1
        let last_idx = if self.head == 0 {
            PRICE_BUFFER_SIZE - 1
        } else {
            self.head as usize - 1
        };
        Some(self.prices[last_idx])
    }
}
