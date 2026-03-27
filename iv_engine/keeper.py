"""
PacificaOptions IV Engine — Keeper
Orchestrates all on-chain keeper duties:
  1. IV parameter updates (UpdateIVParams)
  2. Auto-settlement of expired positions (SettleExpired)
  3. Delta rebalancing (RebalanceDelta)
"""
import asyncio
import json
import logging
import time
from pathlib import Path
from typing import Dict, List, Optional

from config import config, MARKET_DISCRIMINANTS, SCALE
from pacifica_client import (
    PacificaRestClient,
    PacificaWebSocketClient,
    PriceTick,
)
from afvr_calculator import AFVRCalculator
from iv_surface import IVSurfaceBuilder

try:
    from anchorpy import Program, Provider, Wallet, Context
    from anchorpy.idl import Idl
    from solders.keypair import Keypair
    from solders.pubkey import Pubkey
    from solana.rpc.async_api import AsyncClient
    import base58
    _ANCHORPY_AVAILABLE = True
except ImportError:
    _ANCHORPY_AVAILABLE = False

logger = logging.getLogger(__name__)


class Keeper:
    """
    Main keeper orchestrator.
    Runs three concurrent loops:
      - IV updater
      - Settlement checker
      - Delta rebalancer

    Receives real-time price ticks via WebSocket and stores them in
    the AFVR calculator's price history.
    """

    def __init__(self):
        self.afvr = AFVRCalculator()
        self.surface_builder = IVSurfaceBuilder(self.afvr)
        self.latest_prices: Dict[str, float] = {}
        self.latest_timestamps: Dict[str, float] = {}
        self._ws_client: Optional[PacificaWebSocketClient] = None
        self._running = False
        self._program: Optional[object] = None  # anchorpy Program, loaded lazily
        self._solana_client: Optional[object] = None

        # In-memory open positions list (populated from on-chain in _settlement_loop)
        self.open_positions: List[Dict] = []

    # ── Entry Point ──────────────────────────────────────────────────────────

    async def run(self):
        """Start all keeper tasks."""
        self._running = True
        logger.info("Keeper starting up...")

        # Start WebSocket stream
        self._ws_client = PacificaWebSocketClient(
            on_tick=self._handle_tick,
            markets=config.markets,
        )

        tasks = [
            asyncio.create_task(self._ws_client.start(), name="websocket"),
            asyncio.create_task(self._iv_update_loop(), name="iv_updater"),
            asyncio.create_task(self._settlement_loop(), name="settler"),
            asyncio.create_task(self._delta_rebalance_loop(), name="rebalancer"),
        ]

        try:
            await asyncio.gather(*tasks, return_exceptions=True)
        except asyncio.CancelledError:
            logger.info("Keeper tasks cancelled")
        finally:
            for t in tasks:
                t.cancel()
            if self._ws_client:
                await self._ws_client.stop()
            self._running = False
            logger.info("Keeper stopped")

    async def stop(self):
        self._running = False
        if self._ws_client:
            await self._ws_client.stop()

    # ── Price Tick Handler ───────────────────────────────────────────────────

    def _handle_tick(self, tick: PriceTick):
        """Callback for each incoming price tick from WebSocket."""
        self.latest_prices[tick.market] = tick.price
        self.latest_timestamps[tick.market] = tick.timestamp or time.time()
        self.afvr.update_price(tick.market, tick.price, self.latest_timestamps[tick.market])
        logger.debug(f"Price tick: {tick}")

    # ── IV Update Loop ───────────────────────────────────────────────────────

    async def _iv_update_loop(self):
        """Periodically recompute AFVR params and push to on-chain oracle."""
        logger.info(f"IV updater starting (interval={config.iv_update_interval}s)")
        while self._running:
            try:
                await self._push_iv_updates()
            except Exception as e:
                logger.error(f"IV update error: {e}", exc_info=True)
            await asyncio.sleep(config.iv_update_interval)

    async def _push_iv_updates(self):
        """Recompute and push IV params for all markets."""
        for market in config.markets:
                price = self.latest_prices.get(market, 0)
                if price <= 0:
                        logger.warning(f"No WebSocket price for {market} yet, skipping IV update")
                        continue

                params = self.afvr.compute_params(market)
                onchain = params.to_onchain()
                disc = MARKET_DISCRIMINANTS.get(market, -1)
                if disc < 0:
                    continue

                payload = {
                    "market_discriminant": disc,
                    "iv_atm": onchain["iv_atm"],
                    "iv_skew_rho": onchain["iv_skew_rho"],
                    "iv_curvature_phi": onchain["iv_curvature_phi"],
                    "theta_param": onchain["theta_param"],
                    "latest_price": int(price * SCALE),
                }

                logger.info(
                    f"[{market}] IV update: iv_atm={params.iv_atm:.3f} "
                    f"rv={params.realized_vol:.3f} price={price:.2f}"
                )

                # In production: call Anchor program's update_iv_params instruction
                # Here we log the payload that would be submitted
                await self._submit_iv_update(payload)

    async def _get_program(self):
        """Lazily initialise the anchorpy Program client."""
        if not _ANCHORPY_AVAILABLE:
            logger.warning("anchorpy not installed — IV updates will be skipped")
            return None
        if self._program is not None:
            return self._program

        try:
            # Load keeper keypair
            keypair_path = Path(config.wallet_keypair_path)
            raw = json.loads(keypair_path.read_text())
            keypair = Keypair.from_bytes(bytes(raw))

            # Load IDL (expected next to this file or via env)
            idl_path = Path(__file__).parent / "pacifica_options_idl.json"
            if not idl_path.exists():
                logger.warning(f"IDL not found at {idl_path} — skipping on-chain integration")
                return None

            idl_json = json.loads(idl_path.read_text())
            idl = Idl.from_json(json.dumps(idl_json))

            client = AsyncClient(config.solana_rpc_url)
            wallet = Wallet(keypair)
            provider = Provider(client, wallet)
            program_id = Pubkey.from_string(config.program_id)
            self._program = Program(idl, program_id, provider)
            self._solana_client = client
            logger.info(f"anchorpy program loaded: {config.program_id}")
        except Exception as e:
            logger.error(f"Failed to load anchorpy program: {e}", exc_info=True)
            return None

        return self._program

    async def _submit_iv_update(self, payload: Dict):
        """
        Submit IV update to on-chain program via anchorpy.
        Expects the IDL at iv_engine/pacifica_options_idl.json.
        """
        logger.debug(f"IV update payload: {json.dumps(payload)}")

        program = await self._get_program()
        if program is None:
            logger.warning("Skipping on-chain IV update (anchorpy unavailable or IDL missing)")
            return

        try:
            disc = payload["market_discriminant"]
            # Derive PDAs
            vault_auth = Pubkey.from_string(config.vault_authority) if hasattr(config, "vault_authority") and config.vault_authority else None
            if vault_auth is None:
                logger.warning("VAULT_AUTHORITY not configured in config — skipping IV update")
                return

            program_id = Pubkey.from_string(config.program_id)
            vault_pda, _ = Pubkey.find_program_address(
                [b"vault", bytes(vault_auth)], program_id
            )
            iv_oracle_pda, _ = Pubkey.find_program_address(
                [b"iv_oracle", bytes(vault_pda), bytes([disc])], program_id
            )

            keeper_keypair_path = Path(config.wallet_keypair_path)
            raw = json.loads(keeper_keypair_path.read_text())
            keeper_pubkey = Pubkey.from_bytes(bytes(raw[32:64]))  # public key portion

            await program.rpc["update_iv_params"](
                {
                    "market_discriminant": disc,
                    "iv_atm":             payload["iv_atm"],
                    "iv_skew_rho":        payload["iv_skew_rho"],
                    "iv_curvature_phi":   payload["iv_curvature_phi"],
                    "theta_param":        payload["theta_param"],
                    "latest_price":       payload["latest_price"],
                },
                ctx=Context(
                    accounts={
                        "vault":     vault_pda,
                        "iv_oracle": iv_oracle_pda,
                        "keeper":    keeper_pubkey,
                    }
                ),
            )
            logger.info(f"IV update submitted on-chain: market={disc} iv_atm={payload['iv_atm']}")
        except Exception as e:
            logger.error(f"Failed to submit IV update: {e}", exc_info=True)

    # ── Settlement Loop ──────────────────────────────────────────────────────

    async def _settlement_loop(self):
        """Periodically scan for expired positions and settle them."""
        logger.info(f"Settlement checker starting (interval={config.settle_check_interval}s)")
        while self._running:
            try:
                await self._settle_expired_positions()
            except Exception as e:
                logger.error(f"Settlement check error: {e}", exc_info=True)
            await asyncio.sleep(config.settle_check_interval)

    async def _fetch_open_positions(self):
        """Fetch all non-settled OptionPosition accounts from on-chain."""
        program = await self._get_program()
        if program is None:
            return
        try:
            accounts = await program.account["option_position"].all()
            self.open_positions = []
            for acc in accounts:
                pos = acc.account
                if pos.settled:
                    continue
                # Map market enum variant → string
                market_name = type(pos.market).__name__.upper()
                market = {"BTC": "BTC", "ETH": "ETH", "SOL": "SOL"}.get(market_name)
                if market is None:
                    continue
                # Map option_type enum variant → string
                ot_name = type(pos.option_type).__name__.lower()
                option_type = "Call" if ot_name == "call" else "Put"
                self.open_positions.append({
                    "pubkey":      str(acc.public_key),
                    "owner":       str(pos.owner),
                    "market":      market,
                    "option_type": option_type,
                    "strike":      pos.strike,
                    "expiry":      pos.expiry,
                    "size":        pos.size,
                    "settled":     False,
                })
            logger.info(f"Fetched {len(self.open_positions)} open positions from chain")
        except Exception as e:
            logger.error(f"Failed to fetch open positions: {e}", exc_info=True)

    async def _settle_expired_positions(self):
        """
        Fetch all open positions from on-chain, identify expired ones, settle.
        """
        await self._fetch_open_positions()

        now = time.time()
        expired = [
            pos for pos in self.open_positions
            if pos.get("expiry", float("inf")) <= now and not pos.get("settled", False)
        ]

        if not expired:
            return

        logger.info(f"Found {len(expired)} expired positions to settle")

        for pos in expired:
            market = pos.get("market", "BTC")
            price = self.latest_prices.get(market, 0)
            if price <= 0:
                logger.warning(f"No price for {market}, skipping settlement")
                continue

            settlement_price = int(price * SCALE)
            payload = {
                "market_discriminant": MARKET_DISCRIMINANTS.get(market, 0),
                "option_type": 0 if pos.get("option_type") == "Call" else 1,
                "strike": pos.get("strike", 0),
                "expiry": int(pos.get("expiry", 0)),
                "settlement_price": settlement_price,
            }

            logger.info(
                f"Settling position: {pos.get('pubkey', 'unknown')} "
                f"market={market} price={price:.2f}"
            )
            await self._submit_settlement(payload, pos)

    async def _submit_settlement(self, payload: Dict, position: Dict):
        """Submit settle_expired transaction via anchorpy."""
        logger.debug(f"Settlement payload: {json.dumps(payload)}")

        program = await self._get_program()
        if program is None:
            logger.warning("Skipping on-chain settlement (anchorpy unavailable)")
            position["settled"] = True
            return

        try:
            from solders.keypair import Keypair as _Keypair
            from anchorpy import Context as _Context

            vault_auth = Pubkey.from_string(config.vault_authority)
            program_id = Pubkey.from_string(config.program_id)
            usdc_mint = Pubkey.from_string(config.usdc_mint)

            disc = payload["market_discriminant"]
            option_type_disc = payload["option_type"]
            strike: int = payload["strike"]
            expiry: int = payload["expiry"]
            settlement_price: int = payload["settlement_price"]

            # Derive PDAs
            vault_pda, _ = Pubkey.find_program_address(
                [b"vault", bytes(vault_auth)], program_id
            )
            usdc_vault_pda, _ = Pubkey.find_program_address(
                [b"vault_usdc", bytes(vault_pda)], program_id
            )
            iv_oracle_pda, _ = Pubkey.find_program_address(
                [b"iv_oracle", bytes(vault_pda), bytes([disc])], program_id
            )
            holder_pubkey = Pubkey.from_string(position["owner"])
            position_pda, _ = Pubkey.find_program_address(
                [
                    b"position",
                    bytes(holder_pubkey),
                    bytes(vault_pda),
                    bytes([disc]),
                    bytes([option_type_disc]),
                    strike.to_bytes(8, byteorder="little"),
                    expiry.to_bytes(8, byteorder="little", signed=True),
                ],
                program_id,
            )

            # Derive holder's associated USDC token account
            TOKEN_PROGRAM_ID = Pubkey.from_string(
                "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
            )
            ASSOCIATED_TOKEN_PROGRAM_ID = Pubkey.from_string(
                "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJe1bRS"
            )
            holder_usdc, _ = Pubkey.find_program_address(
                [bytes(holder_pubkey), bytes(TOKEN_PROGRAM_ID), bytes(usdc_mint)],
                ASSOCIATED_TOKEN_PROGRAM_ID,
            )

            # Load keeper keypair for signing
            keeper_keypair_path = Path(config.wallet_keypair_path)
            raw = json.loads(keeper_keypair_path.read_text())
            keeper_kp = _Keypair.from_bytes(bytes(raw))

            await program.rpc["settle_expired"](
                {
                    "market_discriminant": disc,
                    "option_type":         option_type_disc,
                    "strike":              strike,
                    "expiry":              expiry,
                    "settlement_price":    settlement_price,
                },
                ctx=_Context(
                    accounts={
                        "vault":         vault_pda,
                        "usdc_vault":    usdc_vault_pda,
                        "iv_oracle":     iv_oracle_pda,
                        "holder":        holder_pubkey,
                        "position":      position_pda,
                        "holder_usdc":   holder_usdc,
                        "keeper":        keeper_kp.pubkey(),
                        "token_program": TOKEN_PROGRAM_ID,
                    },
                    signers=[keeper_kp],
                ),
            )
            logger.info(
                f"Settlement submitted on-chain: position={position_pda} "
                f"market={disc} settlement_price={settlement_price}"
            )
            position["settled"] = True
        except Exception as e:
            logger.error(f"Failed to submit settlement: {e}", exc_info=True)

    # ── Delta Rebalance Loop ─────────────────────────────────────────────────

    async def _delta_rebalance_loop(self):
        """Periodically check net portfolio delta and rebalance if needed."""
        logger.info(
            f"Delta rebalancer starting (interval={config.delta_rebalance_interval}s)"
        )
        while self._running:
            try:
                await self._check_and_rebalance_delta()
            except Exception as e:
                logger.error(f"Delta rebalance error: {e}", exc_info=True)
            await asyncio.sleep(config.delta_rebalance_interval)

    async def _fetch_vault_delta(self) -> int:
        """Fetch vault.delta_net from on-chain. Returns 0 on failure."""
        program = await self._get_program()
        if program is None:
            return 0
        try:
            if not hasattr(config, "vault_authority") or not config.vault_authority:
                return 0
            vault_auth = Pubkey.from_string(config.vault_authority)
            program_id = Pubkey.from_string(config.program_id)
            vault_pda, _ = Pubkey.find_program_address(
                [b"vault", bytes(vault_auth)], program_id
            )
            vault_account = await program.account["option_vault"].fetch(vault_pda)
            return int(vault_account.delta_net)
        except Exception as e:
            logger.warning(f"Failed to fetch vault delta: {e}")
            return 0

    async def _check_and_rebalance_delta(self):
        """
        Read vault's net delta from on-chain, compute hedge, submit if needed.
        """
        vault_delta = await self._fetch_vault_delta()

        threshold = int(config.delta_threshold * SCALE)
        if abs(vault_delta) <= threshold:
            logger.debug(f"Delta balanced: {vault_delta} <= threshold {threshold}")
            return

        # Hedge direction and size (hedge_size in USDC, 6 dec)
        is_buy = vault_delta < 0  # negative delta → buy perp to neutralise
        # Approximate hedge in USDC: use delta_net as delta units; convert to USDC via spot
        # Pick any tracked market price as a proxy (first available)
        proxy_spot = next((p for p in self.latest_prices.values() if p > 0), 1.0)
        hedge_size_usdc = min(
            abs(vault_delta) * proxy_spot / SCALE,  # delta units * price = USDC notional
            config.max_rebalance_usdc,
        )
        hedge_size = int(hedge_size_usdc * SCALE)
        spot_price_scaled = int(proxy_spot * SCALE)

        payload = {
            "target_delta": 0,
            "hedge_size": hedge_size,
            "spot_price": spot_price_scaled,
            "is_buy": is_buy,
        }

        logger.info(
            f"Rebalancing delta: vault_delta={vault_delta} "
            f"hedge_size={hedge_size} is_buy={is_buy}"
        )
        await self._submit_rebalance(payload)

    async def _submit_rebalance(self, payload: Dict):
        """
        Execute delta hedge in two steps:
          1. Place a market order on Pacifica perps (actual hedge).
          2. Record the hedge on-chain via rebalance_delta instruction.
        """
        logger.debug(f"Rebalance payload: {json.dumps(payload)}")

        is_buy: bool = payload["is_buy"]
        hedge_size_usdc: float = payload["hedge_size"] / SCALE
        spot_price: float = payload["spot_price"] / SCALE

        # Determine which market has the dominant delta exposure
        # Use the market with the highest tracked price as the hedge symbol
        symbol = max(
            (m for m in config.markets if self.latest_prices.get(m, 0) > 0),
            key=lambda m: self.latest_prices.get(m, 0),
            default="BTC",
        )
        side = "bid" if is_buy else "ask"
        # Convert USDC notional to underlying units
        underlying_amount = round(hedge_size_usdc / spot_price, 6) if spot_price > 0 else 0.0

        if underlying_amount <= 0:
            logger.warning("Hedge size too small, skipping")
            return

        # Step 1: Place market order on Pacifica perps
        try:
            async with PacificaRestClient() as rest:
                await rest.create_market_order(
                    symbol=symbol,
                    side=side,
                    amount=underlying_amount,
                    slippage_percent=0.5,
                )
            logger.info(
                f"Pacifica perp hedge placed: {side} {underlying_amount} {symbol} "
                f"(notional ≈ ${hedge_size_usdc:,.0f})"
            )
        except Exception as e:
            logger.error(f"Failed to place Pacifica hedge order: {e}", exc_info=True)
            # Don't record on-chain if the actual hedge failed
            return

        # Step 2: Record hedge on-chain via rebalance_delta instruction
        program = await self._get_program()
        if program is None:
            logger.warning("Skipping on-chain rebalance record (anchorpy unavailable)")
            return

        try:
            from solders.keypair import Keypair as _Keypair
            from anchorpy import Context as _Context

            vault_auth = Pubkey.from_string(config.vault_authority)
            program_id = Pubkey.from_string(config.program_id)
            vault_pda, _ = Pubkey.find_program_address(
                [b"vault", bytes(vault_auth)], program_id
            )

            keeper_keypair_path = Path(config.wallet_keypair_path)
            raw = json.loads(keeper_keypair_path.read_text())
            keeper_kp = _Keypair.from_bytes(bytes(raw))

            await program.rpc["rebalance_delta"](
                {
                    "target_delta": payload["target_delta"],
                    "hedge_size":   payload["hedge_size"],
                    "spot_price":   payload["spot_price"],
                    "is_buy":       is_buy,
                },
                ctx=_Context(
                    accounts={
                        "vault":  vault_pda,
                        "keeper": keeper_kp.pubkey(),
                    },
                    signers=[keeper_kp],
                ),
            )
            logger.info(
                f"Delta rebalance recorded on-chain: hedge_size={payload['hedge_size']} "
                f"is_buy={is_buy}"
            )
        except Exception as e:
            logger.error(f"Failed to record rebalance on-chain: {e}", exc_info=True)

    # ── Open Position Management ─────────────────────────────────────────────

    def register_position(self, position: Dict):
        """Register an open position for tracking (called after buy_option)."""
        self.open_positions.append(position)

    def remove_position(self, pubkey: str):
        """Remove a settled/closed position."""
        self.open_positions = [
            p for p in self.open_positions if p.get("pubkey") != pubkey
        ]
