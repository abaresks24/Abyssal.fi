"""
PacificaOptions IV Engine — Configuration
All settings loaded from environment variables with sane defaults.
"""
import os
from dataclasses import dataclass, field
from typing import Optional
from dotenv import load_dotenv

load_dotenv()


@dataclass
class KeeperConfig:
    # ── Pacifica API ─────────────────────────────────────────────────────────
    # Optional API Config Key — increases rate limits on public endpoints (prices, tickers).
    # Generate one via POST /account/api_keys/create (see rest/api_config_keys.py in SDK).
    api_key: str = field(
        default_factory=lambda: os.environ.get("PACIFICA_API_KEY", "")
    )
    # Authentication for trading uses Solana keypair signing (no Bearer token needed).
    # Reference: https://github.com/pacifica-fi/python-sdk
    api_base_url: str = field(
        default_factory=lambda: os.environ.get(
            "PACIFICA_API_BASE_URL", "https://api.pacifica.fi/api/v1"
        )
    )
    ws_url: str = field(
        default_factory=lambda: os.environ.get(
            "PACIFICA_WS_URL", "wss://ws.pacifica.fi/ws"
        )
    )
    # Signature validity window in milliseconds (SDK default: 5000)
    expiry_window_ms: int = field(
        default_factory=lambda: int(os.environ.get("PACIFICA_EXPIRY_WINDOW_MS", "5000"))
    )

    # ── Solana ───────────────────────────────────────────────────────────────
    solana_rpc_url: str = field(
        default_factory=lambda: os.environ.get(
            "SOLANA_RPC_URL", "https://api.mainnet-beta.solana.com"
        )
    )
    wallet_keypair_path: str = field(
        default_factory=lambda: os.environ.get(
            "WALLET_KEYPAIR_PATH", os.path.expanduser("~/.config/solana/id.json")
        )
    )

    # ── Program IDs ──────────────────────────────────────────────────────────
    program_id: str = field(
        default_factory=lambda: os.environ.get(
            "PROGRAM_ID", "CBkvR8SeN6j8RQKB7dSxG3dza2v71XHmWEe8LgfMW1hG"
        )
    )
    usdc_mint: str = field(
        default_factory=lambda: os.environ.get(
            "USDC_MINT", "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU"  # devnet USDC
        )
    )
    # Public key of the wallet that initialized the vault (admin/authority)
    vault_authority: str = field(
        default_factory=lambda: os.environ.get("VAULT_AUTHORITY", "")
    )

    # ── Keeper Settings ───────────────────────────────────────────────────────
    # How often to push IV updates (seconds)
    iv_update_interval: int = field(
        default_factory=lambda: int(os.environ.get("IV_UPDATE_INTERVAL", "60"))
    )
    # How often to check for expired options (seconds)
    settle_check_interval: int = field(
        default_factory=lambda: int(os.environ.get("SETTLE_CHECK_INTERVAL", "30"))
    )
    # How often to check delta imbalance (seconds)
    delta_rebalance_interval: int = field(
        default_factory=lambda: int(os.environ.get("DELTA_REBALANCE_INTERVAL", "120"))
    )
    # Delta threshold as fraction of open interest to trigger rebalance
    delta_threshold: float = field(
        default_factory=lambda: float(os.environ.get("DELTA_THRESHOLD", "0.02"))
    )
    # Max single rebalance size in USDC
    max_rebalance_usdc: float = field(
        default_factory=lambda: float(os.environ.get("MAX_REBALANCE_USDC", "500000"))
    )

    # ── Supported Markets ─────────────────────────────────────────────────────
    markets: list = field(
        default_factory=lambda: [
            # Crypto
            "BTC", "ETH", "SOL",
            # Equities
            "NVDA", "TSLA", "PLTR", "CRCL", "HOOD", "SP500",
            # Commodities
            "XAU", "XAG", "PAXG", "PLATINUM", "NATGAS", "COPPER",
        ]
    )

    # ── AFVR Model Bounds ─────────────────────────────────────────────────────
    iv_atm_min: float = 0.01   # 1%
    iv_atm_max: float = 5.0    # 500%
    skew_rho_min: float = -2.0
    skew_rho_max: float = 2.0
    curvature_phi_min: float = 0.0
    curvature_phi_max: float = 5.0

    # ── Realized Volatility Window ────────────────────────────────────────────
    rv_window_minutes: int = 60
    rv_blend_weight: float = 0.3  # weight on RV in AFVR model

    # ── Price Buffer ─────────────────────────────────────────────────────────
    price_buffer_size: int = 60

    # ── Logging ──────────────────────────────────────────────────────────────
    log_level: str = field(
        default_factory=lambda: os.environ.get("LOG_LEVEL", "INFO")
    )
    log_file: Optional[str] = field(
        default_factory=lambda: os.environ.get("LOG_FILE", None)
    )


# Singleton config
config = KeeperConfig()

# Market discriminant mapping — must match Rust Market enum exactly
MARKET_DISCRIMINANTS = {
    # Crypto
    "BTC": 0, "ETH": 1, "SOL": 2,
    # Equities
    "NVDA": 3, "TSLA": 4, "PLTR": 5, "CRCL": 6, "HOOD": 7, "SP500": 8,
    # Commodities
    "XAU": 9, "XAG": 10, "PAXG": 11, "PLATINUM": 12, "NATGAS": 13, "COPPER": 14,
}

# Fixed-point scale
SCALE = 1_000_000

# Platform fee
PLATFORM_FEE_BPS = 5
SETTLEMENT_FEE_BPS = 5
SETTLEMENT_FEE_CAP_USDC = 50.0
