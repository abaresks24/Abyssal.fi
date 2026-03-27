"""
PacificaOptions IV Engine — Pacifica API Client
Implements the official Pacifica Python SDK authentication pattern:
  - All signed requests use Solana keypair signing (no Bearer token)
  - REST base: https://api.pacifica.fi/api/v1
  - WebSocket: wss://ws.pacifica.fi/ws

Reference: https://github.com/pacifica-fi/python-sdk
"""
import asyncio
import json
import logging
import time
import uuid
from pathlib import Path
from typing import Callable, Dict, List, Optional

import aiohttp
import base58
import websockets
from solders.keypair import Keypair
from tenacity import (
    retry,
    retry_if_exception_type,
    stop_after_attempt,
    wait_exponential,
)

from config import config

logger = logging.getLogger(__name__)

# ── CoinGecko fallback (no auth required) ────────────────────────────────────

COINGECKO_IDS = {"BTC": "bitcoin", "ETH": "ethereum", "SOL": "solana"}
COINGECKO_URL = "https://api.coingecko.com/api/v3/simple/price"


async def fetch_prices_coingecko() -> Dict[str, float]:
    """Fetch BTC/ETH/SOL spot prices from CoinGecko public API."""
    ids = ",".join(COINGECKO_IDS.values())
    params = {"ids": ids, "vs_currencies": "usd"}
    try:
        async with aiohttp.ClientSession() as session:
            async with session.get(
                COINGECKO_URL, params=params, timeout=aiohttp.ClientTimeout(total=10)
            ) as resp:
                resp.raise_for_status()
                data = await resp.json()
                prices = {
                    m: float(data.get(cg_id, {}).get("usd", 0))
                    for m, cg_id in COINGECKO_IDS.items()
                }
                logger.debug(f"CoinGecko prices: {prices}")
                return prices
    except Exception as e:
        logger.warning(f"CoinGecko fetch failed: {e}")
        return {m: 0.0 for m in COINGECKO_IDS}


# ── Signing helpers (from Pacifica SDK common/utils.py) ──────────────────────

def _sort_json_keys(value):
    """Recursively sort dict keys for deterministic message serialisation."""
    if isinstance(value, dict):
        return {k: _sort_json_keys(v) for k, v in sorted(value.items())}
    if isinstance(value, list):
        return [_sort_json_keys(i) for i in value]
    return value


def sign_message(header: Dict, payload: Dict, keypair: Keypair) -> tuple:
    """
    Sign a Pacifica API request using a Solana keypair.
    Exact implementation of common/utils.py from the official SDK.
    Returns (message_str, base58_signature).
    """
    # payload goes inside a "data" key — NOT merged at the top level
    data = {**header, "data": payload}
    data_sorted = _sort_json_keys(data)
    message_str = json.dumps(data_sorted, separators=(",", ":"))
    sig_bytes = keypair.sign_message(message_str.encode("utf-8"))
    signature = base58.b58encode(bytes(sig_bytes)).decode("utf-8")
    return message_str, signature


def _load_keypair() -> Keypair:
    """Load the keeper's Solana keypair from disk."""
    path = Path(config.wallet_keypair_path)
    raw = json.loads(path.read_text())
    return Keypair.from_bytes(bytes(raw))


def _build_signed_body(op_type: str, payload: Dict, keypair: Keypair) -> Dict:
    """Construct a fully-signed request body ready to POST."""
    ts = int(time.time() * 1_000)
    expiry = config.expiry_window_ms
    header = {"type": op_type, "timestamp": ts, "expiry_window": expiry}
    _, signature = sign_message(header, payload, keypair)
    return {
        "account": str(keypair.pubkey()),
        "signature": signature,
        "timestamp": ts,
        "expiry_window": expiry,
        **payload,
    }


# ── Data model ───────────────────────────────────────────────────────────────

class PriceTick:
    __slots__ = ("market", "price", "timestamp", "bid", "ask", "volume_24h")

    def __init__(
        self,
        market: str,
        price: float,
        timestamp: int,
        bid: float = 0.0,
        ask: float = 0.0,
        volume_24h: float = 0.0,
    ):
        self.market = market
        self.price = price
        self.timestamp = timestamp
        self.bid = bid
        self.ask = ask
        self.volume_24h = volume_24h

    def __repr__(self) -> str:
        return f"PriceTick({self.market} @ {self.price:.2f}, ts={self.timestamp})"


# ── REST client ──────────────────────────────────────────────────────────────

class PacificaRestClient:
    """
    Async REST client for Pacifica API.
    Public endpoints (ticker) don't require signing.
    Trading endpoints (orders) require keypair signing.
    """

    def __init__(self):
        self._session: Optional[aiohttp.ClientSession] = None

    async def __aenter__(self):
        headers = {
            "Content-Type": "application/json",
            "User-Agent": "PacificaOptions-Keeper/0.1.0",
        }
        if config.api_key:
            headers["x-api-key"] = config.api_key
        self._session = aiohttp.ClientSession(
            base_url=config.api_base_url,
            headers=headers,
            timeout=aiohttp.ClientTimeout(total=10),
        )
        return self

    async def __aexit__(self, *args):
        if self._session:
            await self._session.close()

    # ── Public market data ───────────────────────────────────────────────────

    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=1, max=10),
        retry=retry_if_exception_type(aiohttp.ClientError),
    )
    async def get_ticker(self, market: str) -> Dict:
        """Fetch current ticker for a market (public endpoint)."""
        async with self._session.get(f"/markets/{market}-PERP/ticker") as resp:
            resp.raise_for_status()
            return await resp.json()

    async def get_mark_price(self, market: str) -> float:
        """Return mark price for a market, or 0.0 on failure."""
        try:
            data = await self.get_ticker(market)
            return float(data.get("markPrice", data.get("lastPrice", 0)) or 0)
        except Exception as e:
            logger.debug(f"get_mark_price({market}) failed: {e}")
            return 0.0

    async def get_all_mark_prices(self) -> Dict[str, float]:
        """
        Return mark prices for all configured markets.
        Falls back to CoinGecko for any market with price = 0.
        """
        prices: Dict[str, float] = {}
        for market in config.markets:
            prices[market] = await self.get_mark_price(market)

        missing = [m for m, p in prices.items() if p <= 0]
        if missing:
            logger.info(f"Pacifica REST missing prices for {missing} — trying CoinGecko")
            cg = await fetch_prices_coingecko()
            for m in missing:
                if cg.get(m, 0) > 0:
                    prices[m] = cg[m]
                    logger.info(f"CoinGecko fallback: {m} = {cg[m]:.2f}")

        return prices

    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=1, max=10),
        retry=retry_if_exception_type(aiohttp.ClientError),
    )
    async def get_funding_rate(self, market: str) -> float:
        """Fetch current funding rate for a perpetual market."""
        async with self._session.get(f"/markets/{market}-PERP/funding") as resp:
            resp.raise_for_status()
            data = await resp.json()
            return float(data.get("fundingRate", 0) or 0)

    # ── Signed trading endpoints ─────────────────────────────────────────────

    async def create_market_order(
        self,
        symbol: str,
        side: str,
        amount: float,
        slippage_percent: float = 0.5,
        reduce_only: bool = False,
    ) -> Dict:
        """
        Place a market order on Pacifica perps (signed).
        side: "bid" (buy) or "ask" (sell)
        Used by the keeper for delta hedging.
        """
        keypair = _load_keypair()
        payload = {
            "symbol": symbol,
            "side": side,
            "amount": str(amount),
            "reduce_only": reduce_only,
            "slippage_percent": str(slippage_percent),
            "client_order_id": str(uuid.uuid4()),
        }
        body = _build_signed_body("create_market_order", payload, keypair)
        async with self._session.post("/orders/create_market", json=body) as resp:
            resp.raise_for_status()
            result = await resp.json()
            logger.info(f"Market order placed: {symbol} {side} {amount} → {result}")
            return result

    async def cancel_order(self, symbol: str, order_id: int) -> Dict:
        """Cancel an existing order (signed)."""
        keypair = _load_keypair()
        payload = {"symbol": symbol, "order_id": order_id}
        body = _build_signed_body("cancel_order", payload, keypair)
        async with self._session.post("/orders/cancel", json=body) as resp:
            resp.raise_for_status()
            return await resp.json()


# ── WebSocket client ─────────────────────────────────────────────────────────

class PacificaWebSocketClient:
    """
    WebSocket client streaming real-time price ticks from Pacifica.

    Subscription format (from Pacifica SDK ws/subscribe_prices.py):
        {"method": "subscribe", "params": {"source": "prices"}}

    Reconnects automatically with exponential back-off.
    """

    def __init__(
        self,
        on_tick: Callable[[PriceTick], None],
        markets: Optional[List[str]] = None,
    ):
        self._on_tick = on_tick
        self._markets = set(markets or config.markets)
        self._running = False
        self._reconnect_delay = 1.0

    async def start(self):
        """Stream prices until stop() is called."""
        self._running = True
        while self._running:
            try:
                await self._connect_and_stream()
                self._reconnect_delay = 1.0  # reset on clean disconnect
            except Exception as e:
                if not self._running:
                    break
                logger.warning(
                    f"WebSocket error: {e}. Reconnecting in {self._reconnect_delay:.0f}s..."
                )
                await asyncio.sleep(self._reconnect_delay)
                self._reconnect_delay = min(self._reconnect_delay * 2, 60.0)

    async def stop(self):
        self._running = False

    async def _connect_and_stream(self):
        logger.info(f"WebSocket connecting to {config.ws_url}")
        async with websockets.connect(config.ws_url, ping_interval=30) as ws:
            logger.info("WebSocket connected — subscribing to prices")
            await ws.send(
                json.dumps({"method": "subscribe", "params": {"source": "prices"}})
            )
            async for raw in ws:
                if not self._running:
                    break
                self._handle_message(raw)

    def _handle_message(self, raw: str):
        try:
            msg = json.loads(raw)
            # Only process price channel updates (ignore subscription ack)
            if msg.get("channel") != "prices" or not isinstance(msg.get("data"), list):
                return

            for item in msg["data"]:
                market: str = item.get("symbol", "")
                if market not in self._markets:
                    continue

                price = float(item.get("mark", 0) or 0)
                if price <= 0:
                    continue

                tick = PriceTick(
                    market=market,
                    price=price,
                    timestamp=int(item.get("timestamp", 0) or time.time() * 1000),
                    bid=float(item.get("mid", 0) or 0),
                    ask=float(item.get("mid", 0) or 0),
                    volume_24h=float(item.get("volume_24h", 0) or 0),
                )
                self._on_tick(tick)

        except (json.JSONDecodeError, KeyError, ValueError, TypeError) as e:
            logger.debug(f"Failed to parse tick: {e} | raw={str(raw)[:120]}")
