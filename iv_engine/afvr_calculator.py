"""
PacificaOptions IV Engine — AFVR (Adjusted Forward Variance Risk) Calculator
Implements the parametric IV surface fitting from realized and implied data.

The AFVR model parameterises the volatility surface as:
    σ(m, T) = σ_atm * sqrt(θ/T) * (1 + ρ*m + φ/2 * m²)

Where:
    m = ln(F/K) — log-moneyness
    T           — time to expiry in years
    σ_atm       — ATM volatility level
    ρ (rho)     — skew parameter
    φ (phi)     — curvature parameter
    θ (theta)   — term structure parameter
"""
import logging
import math
from dataclasses import dataclass
from typing import Dict, List, Optional, Tuple

import numpy as np
from scipy.optimize import minimize

from config import config, SCALE

logger = logging.getLogger(__name__)

SECONDS_PER_YEAR = 365.25 * 24 * 3600


@dataclass
class AFVRParams:
    """AFVR surface parameters for one market."""

    market: str
    iv_atm: float        # ATM vol, e.g. 0.5 = 50%
    iv_skew_rho: float   # Skew rho ∈ [-2, 2]
    iv_curvature_phi: float  # Curvature phi ≥ 0
    theta_param: float   # Term structure θ > 0
    realized_vol: float  # Latest realized vol estimate
    fit_error: float     # RMSE of last fit
    timestamp: float     # Unix timestamp of last update

    def to_onchain(self) -> Dict[str, int]:
        """Convert to on-chain fixed-point integers (1e6 scale)."""
        return {
            "iv_atm": int(self.iv_atm * SCALE),
            "iv_skew_rho": int(self.iv_skew_rho * SCALE),
            "iv_curvature_phi": int(self.iv_curvature_phi * SCALE),
            "theta_param": int(self.theta_param * SCALE),
        }


class PriceHistory:
    """Rolling price buffer for a single market."""

    def __init__(self, max_size: int = 60):
        self.max_size = max_size
        self.prices: List[float] = []
        self.timestamps: List[float] = []

    def push(self, price: float, timestamp: float):
        self.prices.append(price)
        self.timestamps.append(timestamp)
        if len(self.prices) > self.max_size:
            self.prices.pop(0)
            self.timestamps.pop(0)

    def realized_variance(self, annualise: bool = True) -> float:
        """
        Compute close-to-close realized variance from price history.
        Returns annualised variance if annualise=True.
        """
        if len(self.prices) < 2:
            return 0.0

        log_returns = []
        for i in range(1, len(self.prices)):
            if self.prices[i - 1] > 0 and self.prices[i] > 0:
                lr = math.log(self.prices[i] / self.prices[i - 1])
                log_returns.append(lr)

        if not log_returns:
            return 0.0

        arr = np.array(log_returns)
        variance = float(np.var(arr))

        if annualise:
            # Compute average time step in years
            if len(self.timestamps) >= 2:
                dt_secs = (self.timestamps[-1] - self.timestamps[0]) / (
                    len(self.timestamps) - 1
                )
                periods_per_year = SECONDS_PER_YEAR / max(dt_secs, 1.0)
            else:
                periods_per_year = SECONDS_PER_YEAR / 60  # assume 1-min bars
            variance *= periods_per_year

        return variance

    def realized_vol(self) -> float:
        """Realized volatility (annualised)."""
        return math.sqrt(max(self.realized_variance(), 0))

    @property
    def latest(self) -> Optional[float]:
        return self.prices[-1] if self.prices else None

    @property
    def count(self) -> int:
        return len(self.prices)


class AFVRCalculator:
    """
    Fits the AFVR surface parameters from:
      1. Realized volatility (from price history)
      2. Any available market-implied vol quotes
      3. Priors / regularisation

    Also maintains per-market price histories.
    """

    def __init__(self):
        self.price_histories: Dict[str, PriceHistory] = {
            m: PriceHistory(max_size=config.price_buffer_size)
            for m in config.markets
        }
        self.current_params: Dict[str, AFVRParams] = {}
        self._init_default_params()

    def _init_default_params(self):
        import time
        now = time.time()
        for market in config.markets:
            self.current_params[market] = AFVRParams(
                market=market,
                iv_atm=0.5,
                iv_skew_rho=-0.05,
                iv_curvature_phi=0.1,
                theta_param=1.0,
                realized_vol=0.5,
                fit_error=0.0,
                timestamp=now,
            )

    def update_price(self, market: str, price: float, timestamp: float):
        """Push a new price observation for a market."""
        if market not in self.price_histories:
            self.price_histories[market] = PriceHistory(
                max_size=config.price_buffer_size
            )
        self.price_histories[market].push(price, timestamp)

    def compute_params(self, market: str) -> AFVRParams:
        """
        Recompute AFVR parameters for `market` using the latest price history.
        Falls back to prior if insufficient data.
        """
        import time

        history = self.price_histories.get(market)
        prior = self.current_params.get(market)

        if history is None or history.count < 5:
            logger.debug(f"Insufficient price history for {market}, using prior")
            return prior or self._default_params(market)

        rv = history.realized_vol()
        if rv == 0.0:
            rv = prior.iv_atm if prior else 0.5

        # Blend: σ_atm = (1 - w) * prior_atm + w * RV
        blend_w = config.rv_blend_weight
        if prior:
            iv_atm = (1 - blend_w) * prior.iv_atm + blend_w * rv
        else:
            iv_atm = rv

        # Clamp
        iv_atm = max(config.iv_atm_min, min(config.iv_atm_max, iv_atm))

        # Keep skew and curvature from prior (updated by implied vol fitting)
        iv_skew_rho = prior.iv_skew_rho if prior else -0.05
        iv_curvature_phi = prior.iv_curvature_phi if prior else 0.1
        theta_param = prior.theta_param if prior else 1.0

        params = AFVRParams(
            market=market,
            iv_atm=iv_atm,
            iv_skew_rho=iv_skew_rho,
            iv_curvature_phi=iv_curvature_phi,
            theta_param=theta_param,
            realized_vol=rv,
            fit_error=0.0,
            timestamp=time.time(),
        )
        self.current_params[market] = params
        return params

    def fit_to_implied_vols(
        self,
        market: str,
        implied_vol_quotes: List[Tuple[float, float, float]],
    ) -> AFVRParams:
        """
        Fit AFVR parameters to a set of (moneyness, time_years, implied_vol) quotes.
        Uses scipy minimize with L-BFGS-B.

        implied_vol_quotes: list of (log_moneyness m, T_years, sigma_iv)
        """
        import time

        if len(implied_vol_quotes) < 4:
            logger.debug(f"Too few IV quotes for {market} ({len(implied_vol_quotes)}), skipping fit")
            return self.current_params.get(market) or self._default_params(market)

        quotes = np.array(implied_vol_quotes)
        m = quotes[:, 0]
        T = quotes[:, 1]
        sigma_mkt = quotes[:, 2]

        prior = self.current_params.get(market)
        x0 = np.array([
            prior.iv_atm if prior else 0.5,
            prior.iv_skew_rho if prior else -0.05,
            prior.iv_curvature_phi if prior else 0.1,
            prior.theta_param if prior else 1.0,
        ])

        def objective(x):
            iv_atm, rho, phi, theta = x
            if iv_atm <= 0 or theta <= 0 or phi < 0:
                return 1e9
            # AFVR model: σ(m, T) = iv_atm * sqrt(theta/T) * (1 + rho*m + phi/2*m^2)
            term_struct = np.sqrt(theta / np.maximum(T, 1e-6))
            smile = 1.0 + rho * m + (phi / 2.0) * m ** 2
            sigma_model = iv_atm * term_struct * smile
            sigma_model = np.maximum(sigma_model, 0.001)
            residuals = (sigma_model - sigma_mkt) ** 2
            # L2 regularisation toward prior
            reg = 0.01 * (
                (iv_atm - x0[0]) ** 2
                + (rho - x0[1]) ** 2
                + (phi - x0[2]) ** 2
                + (theta - x0[3]) ** 2
            )
            return float(np.mean(residuals) + reg)

        bounds = [
            (config.iv_atm_min, config.iv_atm_max),
            (config.skew_rho_min, config.skew_rho_max),
            (config.curvature_phi_min, config.curvature_phi_max),
            (0.01, 10.0),
        ]

        try:
            result = minimize(
                objective,
                x0,
                method="L-BFGS-B",
                bounds=bounds,
                options={"maxiter": 200, "ftol": 1e-10},
            )
            iv_atm, rho, phi, theta = result.x
            fit_error = float(np.sqrt(result.fun))
        except Exception as e:
            logger.warning(f"IV fit failed for {market}: {e}")
            return self.current_params.get(market) or self._default_params(market)

        rv = self.price_histories[market].realized_vol() if market in self.price_histories else iv_atm

        params = AFVRParams(
            market=market,
            iv_atm=float(iv_atm),
            iv_skew_rho=float(rho),
            iv_curvature_phi=float(phi),
            theta_param=float(theta),
            realized_vol=rv,
            fit_error=fit_error,
            timestamp=time.time(),
        )
        self.current_params[market] = params
        logger.info(
            f"AFVR fit [{market}]: iv_atm={iv_atm:.3f} rho={rho:.4f} "
            f"phi={phi:.4f} theta={theta:.4f} rmse={fit_error:.6f}"
        )
        return params

    def iv_for(self, market: str, log_moneyness: float, time_years: float) -> float:
        """
        Evaluate the AFVR surface for a specific (moneyness, maturity) point.
        Returns the implied volatility as a decimal (e.g. 0.5 = 50%).
        """
        params = self.current_params.get(market)
        if params is None:
            return 0.5

        if time_years <= 0:
            return params.iv_atm

        term_struct = math.sqrt(params.theta_param / max(time_years, 1e-6))
        smile = 1.0 + params.iv_skew_rho * log_moneyness + (
            params.iv_curvature_phi / 2.0
        ) * log_moneyness ** 2
        iv = params.iv_atm * term_struct * smile
        return max(config.iv_atm_min, min(config.iv_atm_max, iv))

    @staticmethod
    def _default_params(market: str) -> AFVRParams:
        import time
        return AFVRParams(
            market=market,
            iv_atm=0.5,
            iv_skew_rho=-0.05,
            iv_curvature_phi=0.1,
            theta_param=1.0,
            realized_vol=0.5,
            fit_error=0.0,
            timestamp=time.time(),
        )
