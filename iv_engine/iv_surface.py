"""
PacificaOptions IV Engine — IV Surface Builder
Constructs a full term-structure and strike grid from AFVR parameters,
and provides utilities for pricing and visualization data export.
"""
import math
import logging
from dataclasses import dataclass, field
from typing import Dict, List, Optional, Tuple

import numpy as np

from afvr_calculator import AFVRCalculator, AFVRParams
from config import config

logger = logging.getLogger(__name__)

SECONDS_PER_YEAR = 365.25 * 24 * 3600

# Standard option maturities in calendar days
STANDARD_MATURITIES_DAYS = [1, 7, 14, 30, 60, 90]

# Standard strikes as % of spot (moneyness grid)
STANDARD_MONEYNESS_PERCENT = [70, 75, 80, 85, 90, 95, 100, 105, 110, 115, 120, 125, 130]


@dataclass
class IVPoint:
    """A single point on the IV surface."""
    market: str
    maturity_days: float
    strike_pct: float      # strike / spot * 100
    log_moneyness: float   # ln(K/F)
    iv: float              # implied vol decimal
    call_price: float      # Black-Scholes call price in USDC
    put_price: float       # Black-Scholes put price in USDC
    delta_call: float
    delta_put: float
    vega: float
    gamma: float
    theta: float


@dataclass
class IVSurface:
    """Full IV surface for a single market at a point in time."""
    market: str
    spot: float
    timestamp: float
    params: AFVRParams
    points: List[IVPoint] = field(default_factory=list)

    def to_json(self) -> Dict:
        return {
            "market": self.market,
            "spot": self.spot,
            "timestamp": self.timestamp,
            "params": {
                "iv_atm": self.params.iv_atm,
                "iv_skew_rho": self.params.iv_skew_rho,
                "iv_curvature_phi": self.params.iv_curvature_phi,
                "theta_param": self.params.theta_param,
                "realized_vol": self.params.realized_vol,
            },
            "surface": [
                {
                    "maturity_days": p.maturity_days,
                    "strike_pct": p.strike_pct,
                    "log_moneyness": p.log_moneyness,
                    "iv": p.iv,
                    "call": p.call_price,
                    "put": p.put_price,
                    "delta_call": p.delta_call,
                    "delta_put": p.delta_put,
                    "vega": p.vega,
                    "gamma": p.gamma,
                    "theta_day": p.theta,
                }
                for p in self.points
            ],
        }


def _normal_cdf(x: float) -> float:
    """Standard normal CDF using math.erfc."""
    return 0.5 * math.erfc(-x / math.sqrt(2))


def _normal_pdf(x: float) -> float:
    return math.exp(-0.5 * x * x) / math.sqrt(2 * math.pi)


def black_scholes(
    spot: float,
    strike: float,
    sigma: float,
    T: float,
    is_call: bool = True,
    r: float = 0.0,
) -> Tuple[float, float, float, float, float, float]:
    """
    Black-Scholes price and Greeks.

    Returns: (price, delta, gamma, theta_per_day, vega_per_1pct, d1)
    """
    if T <= 0 or sigma <= 0 or spot <= 0 or strike <= 0:
        intrinsic = max(spot - strike, 0) if is_call else max(strike - spot, 0)
        delta = 1.0 if (is_call and spot > strike) else (-1.0 if (not is_call and spot < strike) else 0.0)
        return intrinsic, delta, 0.0, 0.0, 0.0, 0.0

    sqrt_T = math.sqrt(T)
    d1 = (math.log(spot / strike) + (r + 0.5 * sigma ** 2) * T) / (sigma * sqrt_T)
    d2 = d1 - sigma * sqrt_T

    Nd1 = _normal_cdf(d1)
    Nd2 = _normal_cdf(d2)
    phi_d1 = _normal_pdf(d1)

    if is_call:
        price = spot * Nd1 - strike * math.exp(-r * T) * Nd2
        delta = Nd1
    else:
        price = strike * math.exp(-r * T) * _normal_cdf(-d2) - spot * _normal_cdf(-d1)
        delta = Nd1 - 1.0

    gamma = phi_d1 / (spot * sigma * sqrt_T)
    # Theta per calendar day
    theta_year = -(spot * phi_d1 * sigma) / (2 * sqrt_T) - r * strike * math.exp(-r * T) * (Nd2 if is_call else _normal_cdf(-d2))
    theta_day = theta_year / 365.0
    # Vega per 1% vol move
    vega_per_vol = spot * phi_d1 * sqrt_T
    vega_per_1pct = vega_per_vol / 100.0

    return price, delta, gamma, theta_day, vega_per_1pct, d1


class IVSurfaceBuilder:
    """Builds IV surfaces from AFVR calculator output."""

    def __init__(self, afvr: AFVRCalculator):
        self.afvr = afvr

    def build(
        self,
        market: str,
        spot: float,
        timestamp: float,
        maturities_days: Optional[List[float]] = None,
        moneyness_pcts: Optional[List[float]] = None,
    ) -> IVSurface:
        """
        Build a full IV surface for `market` at `spot`.
        """
        if maturities_days is None:
            maturities_days = STANDARD_MATURITIES_DAYS
        if moneyness_pcts is None:
            moneyness_pcts = STANDARD_MONEYNESS_PERCENT

        params = self.afvr.current_params.get(market)
        if params is None:
            params = AFVRCalculator._default_params(market)

        points = []
        for maturity_days in maturities_days:
            T = maturity_days / 365.25
            for pct in moneyness_pcts:
                strike = spot * pct / 100.0
                log_m = math.log(strike / spot) if spot > 0 and strike > 0 else 0.0
                iv = self.afvr.iv_for(market, log_m, T)

                call_price, delta_call, gamma, theta_day, vega, _ = black_scholes(
                    spot, strike, iv, T, is_call=True
                )
                put_price, delta_put, _, _, _, _ = black_scholes(
                    spot, strike, iv, T, is_call=False
                )

                points.append(
                    IVPoint(
                        market=market,
                        maturity_days=maturity_days,
                        strike_pct=pct,
                        log_moneyness=log_m,
                        iv=iv,
                        call_price=call_price,
                        put_price=put_price,
                        delta_call=delta_call,
                        delta_put=delta_put,
                        vega=vega,
                        gamma=gamma,
                        theta=theta_day,
                    )
                )

        return IVSurface(
            market=market,
            spot=spot,
            timestamp=timestamp,
            params=params,
            points=points,
        )

    def atm_iv(self, market: str, time_years: float) -> float:
        """Convenience: ATM IV for a given time to expiry."""
        return self.afvr.iv_for(market, 0.0, time_years)

    def strike_iv(self, market: str, spot: float, strike: float, time_years: float) -> float:
        """IV for a specific strike."""
        if spot <= 0 or strike <= 0:
            return self.atm_iv(market, time_years)
        log_m = math.log(strike / spot)
        return self.afvr.iv_for(market, log_m, time_years)

    def skew_data(self, market: str, spot: float, maturity_days: float = 30) -> Dict:
        """
        Return smile skew data for a single maturity as arrays suitable for charting.
        """
        T = maturity_days / 365.25
        strikes = [spot * p / 100.0 for p in STANDARD_MONEYNESS_PERCENT]
        ivs = [
            self.strike_iv(market, spot, k, T) * 100  # in percent
            for k in strikes
        ]
        deltas = []
        for k, iv in zip(strikes, ivs):
            _, d, _, _, _, _ = black_scholes(spot, k, iv / 100.0, T, is_call=True)
            deltas.append(round(d * 100, 1))

        return {
            "market": market,
            "maturity_days": maturity_days,
            "spot": spot,
            "strikes": strikes,
            "moneyness_pcts": STANDARD_MONEYNESS_PERCENT,
            "ivs_percent": ivs,
            "deltas": deltas,
        }
