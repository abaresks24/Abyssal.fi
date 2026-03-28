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
import struct
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

# ── Solana / solders imports (always available — no anchorpy needed) ──────────
try:
    from solders.keypair import Keypair
    from solders.pubkey import Pubkey
    from solders.instruction import AccountMeta, Instruction
    from solders.hash import Hash
    from solders.message import MessageV0, to_bytes_versioned
    from solders.transaction import VersionedTransaction
    from solana.rpc.async_api import AsyncClient
    from solana.rpc.commitment import Confirmed
    _SOLANA_AVAILABLE = True
except ImportError as _e:
    _SOLANA_AVAILABLE = False
    _SOLANA_IMPORT_ERR = str(_e)

logger = logging.getLogger(__name__)

# ── Instruction discriminators (from IDL) ────────────────────────────────────
# These are stable 8-byte Anchor discriminators derived from SHA256 of the
# instruction name — they never change without redeploying the program.
_DISC_UPDATE_IV_PARAMS = bytes([150, 63, 88, 61, 79, 144, 94, 127])
_DISC_SETTLE_EXPIRED   = bytes([187, 68, 57, 40, 121, 72, 73, 161])
_DISC_REBALANCE_DELTA  = bytes([106, 229, 255, 94, 120, 8, 15, 216])

# Program IDs for ATA derivation
_TOKEN_PROGRAM_ID = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
_ASSOC_TOKEN_PROGRAM_ID = "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJe1bRS"

# Market name → discriminant (for decoding on-chain positions)
_MARKET_BY_NAME: Dict[str, str] = {
    "btc": "BTC", "eth": "ETH", "sol": "SOL",
    "nvda": "NVDA", "tsla": "TSLA", "pltr": "PLTR",
    "crcl": "CRCL", "hood": "HOOD", "sp500": "SP500",
    "xau": "XAU", "xag": "XAG", "paxg": "PAXG",
    "platinum": "PLATINUM", "natgas": "NATGAS", "copper": "COPPER",
}
_MARKET_BY_DISC: Dict[int, str] = {v: k for k, v in MARKET_DISCRIMINANTS.items()}


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
        self._rpc: Optional[AsyncClient] = None
        self._keypair: Optional[object] = None  # Keypair, loaded lazily

        # In-memory open positions list (populated from on-chain in _settlement_loop)
        self.open_positions: List[Dict] = []

    # ── Entry Point ──────────────────────────────────────────────────────────

    async def run(self):
        """Start all keeper tasks."""
        self._running = True
        logger.info("Keeper starting up...")

        if not _SOLANA_AVAILABLE:
            logger.error(
                f"solders/solana-py not available — on-chain calls will be skipped. "
                f"Install with: pip install solders solana. Error: {_SOLANA_IMPORT_ERR}"
            )
        else:
            logger.info("Solana client ready — on-chain IV updates enabled")

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
            if self._rpc:
                await self._rpc.close()
            self._running = False
            logger.info("Keeper stopped")

    async def stop(self):
        self._running = False
        if self._ws_client:
            await self._ws_client.stop()

    # ── Solana client helpers ────────────────────────────────────────────────

    def _get_rpc(self) -> Optional["AsyncClient"]:
        """Return (or create) the Solana AsyncClient."""
        if not _SOLANA_AVAILABLE:
            return None
        if self._rpc is None:
            self._rpc = AsyncClient(config.solana_rpc_url)
        return self._rpc

    def _get_keypair(self) -> Optional["Keypair"]:
        """Load keeper keypair once and cache it."""
        if not _SOLANA_AVAILABLE:
            return None
        if self._keypair is not None:
            return self._keypair
        try:
            raw = json.loads(Path(config.wallet_keypair_path).read_text())
            self._keypair = Keypair.from_bytes(bytes(raw))
            logger.info(f"Keeper keypair loaded: {self._keypair.pubkey()}")
        except Exception as e:
            logger.error(f"Failed to load keypair from {config.wallet_keypair_path}: {e}")
            return None
        return self._keypair

    def _get_program_id(self) -> Optional["Pubkey"]:
        if not _SOLANA_AVAILABLE:
            return None
        return Pubkey.from_string(config.program_id)

    def _derive_vault_pda(self, vault_auth: "Pubkey", program_id: "Pubkey") -> "Pubkey":
        pda, _ = Pubkey.find_program_address([b"vault", bytes(vault_auth)], program_id)
        return pda

    def _derive_iv_oracle_pda(self, vault_pda: "Pubkey", disc: int, program_id: "Pubkey") -> "Pubkey":
        pda, _ = Pubkey.find_program_address(
            [b"iv_oracle", bytes(vault_pda), bytes([disc])], program_id
        )
        return pda

    async def _send_instruction(self, ix: "Instruction", signer: "Keypair") -> Optional[str]:
        """Build a VersionedTransaction and submit it, returning the signature."""
        rpc = self._get_rpc()
        if rpc is None:
            return None
        try:
            blockhash_resp = await rpc.get_latest_blockhash()
            blockhash = blockhash_resp.value.blockhash

            msg = MessageV0.try_compile(
                payer=signer.pubkey(),
                instructions=[ix],
                address_lookup_table_accounts=[],
                recent_blockhash=blockhash,
            )
            tx = VersionedTransaction(msg, [signer])
            resp = await rpc.send_transaction(tx)
            sig = str(resp.value)
            logger.debug(f"Transaction sent: {sig}")
            return sig
        except Exception as e:
            logger.error(f"Failed to send transaction: {e}", exc_info=True)
            return None

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
        kp = self._get_keypair()
        if kp is None:
            logger.warning("No keypair — skipping IV updates")
            return

        vault_authority_str = getattr(config, "vault_authority", "")
        if not vault_authority_str:
            logger.warning("VAULT_AUTHORITY not configured — skipping IV updates")
            return

        vault_auth = Pubkey.from_string(vault_authority_str)
        program_id = self._get_program_id()
        vault_pda = self._derive_vault_pda(vault_auth, program_id)

        for market in config.markets:
            price = self.latest_prices.get(market, 0)
            if price <= 0:
                logger.warning(f"No price for {market} yet, skipping IV update")
                continue

            params = self.afvr.compute_params(market)
            onchain = params.to_onchain()
            disc = MARKET_DISCRIMINANTS.get(market, -1)
            if disc < 0:
                continue

            iv_oracle_pda = self._derive_iv_oracle_pda(vault_pda, disc, program_id)

            logger.info(
                f"[{market}] IV update: iv_atm={params.iv_atm:.3f} "
                f"rv={params.realized_vol:.3f} price={price:.2f}"
            )

            await self._submit_iv_update(
                disc=disc,
                iv_atm=onchain["iv_atm"],
                iv_skew_rho=onchain["iv_skew_rho"],
                iv_curvature_phi=onchain["iv_curvature_phi"],
                theta_param=onchain["theta_param"],
                latest_price=int(price * SCALE),
                vault_pda=vault_pda,
                iv_oracle_pda=iv_oracle_pda,
                keeper_kp=kp,
                program_id=program_id,
            )

    async def _submit_iv_update(
        self,
        disc: int,
        iv_atm: int,
        iv_skew_rho: int,
        iv_curvature_phi: int,
        theta_param: int,
        latest_price: int,
        vault_pda: "Pubkey",
        iv_oracle_pda: "Pubkey",
        keeper_kp: "Keypair",
        program_id: "Pubkey",
    ):
        """
        Submit UpdateIVParams instruction.

        Instruction data layout (Anchor borsh):
          [8 bytes discriminator]
          u8  market_discriminant
          u64 iv_atm
          i64 iv_skew_rho
          u64 iv_curvature_phi
          u64 theta_param
          u64 latest_price
        """
        if not _SOLANA_AVAILABLE:
            return

        # Borsh-encode the args struct
        args_data = struct.pack(
            "<BQqQQQ",
            disc,
            iv_atm,
            iv_skew_rho,
            iv_curvature_phi,
            theta_param,
            latest_price,
        )
        ix_data = _DISC_UPDATE_IV_PARAMS + args_data

        ix = Instruction(
            program_id=program_id,
            data=ix_data,
            accounts=[
                AccountMeta(pubkey=vault_pda,          is_signer=False, is_writable=True),
                AccountMeta(pubkey=iv_oracle_pda,      is_signer=False, is_writable=True),
                AccountMeta(pubkey=keeper_kp.pubkey(), is_signer=True,  is_writable=False),
            ],
        )

        sig = await self._send_instruction(ix, keeper_kp)
        if sig:
            logger.info(
                f"IV update submitted on-chain: market={_MARKET_BY_DISC.get(disc, disc)} "
                f"iv_atm={iv_atm} tx={sig}"
            )
        else:
            logger.warning(f"IV update tx failed for market={_MARKET_BY_DISC.get(disc, disc)}")

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
        rpc = self._get_rpc()
        if rpc is None:
            return

        # OptionPosition account discriminator (first 8 bytes of SHA256("account:OptionPosition"))
        # We use getProgramAccounts with a memcmp filter on the settled flag offset.
        # For simplicity, fetch all accounts and filter in Python.
        try:
            program_id = self._get_program_id()
            # Anchor account discriminator for OptionPosition
            # Can be computed: sha256(b"account:OptionPosition")[:8]
            import hashlib
            disc_bytes = hashlib.sha256(b"account:OptionPosition").digest()[:8]

            resp = await rpc.get_program_accounts(
                program_id,
                encoding="base64",
                filters=[{"memcmp": {"offset": 0, "bytes": _b58_encode(disc_bytes)}}],
            )

            self.open_positions = []
            for acc_info in resp.value:
                try:
                    data = _decode_account_data(acc_info.account.data)
                    if data is None:
                        continue
                    pos = _decode_option_position(data)
                    if pos is None or pos.get("settled"):
                        continue
                    pos["pubkey"] = str(acc_info.pubkey)
                    self.open_positions.append(pos)
                except Exception:
                    continue

            logger.info(f"Fetched {len(self.open_positions)} open positions from chain")
        except Exception as e:
            logger.error(f"Failed to fetch open positions: {e}", exc_info=True)

    async def _settle_expired_positions(self):
        """Fetch all open positions from on-chain, identify expired ones, settle."""
        await self._fetch_open_positions()

        now = time.time()
        expired = [
            pos for pos in self.open_positions
            if pos.get("expiry", float("inf")) <= now and not pos.get("settled", False)
        ]

        if not expired:
            return

        logger.info(f"Found {len(expired)} expired positions to settle")

        kp = self._get_keypair()
        if kp is None:
            return

        vault_authority_str = getattr(config, "vault_authority", "")
        if not vault_authority_str:
            return

        vault_auth = Pubkey.from_string(vault_authority_str)
        program_id = self._get_program_id()
        vault_pda = self._derive_vault_pda(vault_auth, program_id)
        usdc_vault_pda, _ = Pubkey.find_program_address(
            [b"vault_usdc", bytes(vault_pda)], program_id
        )
        token_program = Pubkey.from_string(_TOKEN_PROGRAM_ID)
        assoc_token_program = Pubkey.from_string(_ASSOC_TOKEN_PROGRAM_ID)
        usdc_mint = Pubkey.from_string(config.usdc_mint)

        for pos in expired:
            market = pos.get("market", "BTC")
            price = self.latest_prices.get(market, 0)
            if price <= 0:
                logger.warning(f"No price for {market}, skipping settlement")
                continue

            disc = MARKET_DISCRIMINANTS.get(market, 0)
            option_type_disc = 0 if pos.get("option_type") == "Call" else 1
            strike: int = pos.get("strike", 0)
            expiry: int = int(pos.get("expiry", 0))
            settlement_price = int(price * SCALE)

            iv_oracle_pda = self._derive_iv_oracle_pda(vault_pda, disc, program_id)
            holder_pubkey = Pubkey.from_string(pos["owner"])
            position_pda, _ = Pubkey.find_program_address(
                [
                    b"position",
                    bytes(holder_pubkey),
                    bytes(vault_pda),
                    bytes([disc]),
                    bytes([option_type_disc]),
                    strike.to_bytes(8, "little"),
                    expiry.to_bytes(8, "little", signed=True),
                ],
                program_id,
            )
            holder_usdc, _ = Pubkey.find_program_address(
                [bytes(holder_pubkey), bytes(token_program), bytes(usdc_mint)],
                assoc_token_program,
            )

            logger.info(
                f"Settling position: {pos.get('pubkey', 'unknown')} "
                f"market={market} price={price:.2f}"
            )
            await self._submit_settlement(
                disc=disc,
                option_type_disc=option_type_disc,
                strike=strike,
                expiry=expiry,
                settlement_price=settlement_price,
                vault_pda=vault_pda,
                usdc_vault_pda=usdc_vault_pda,
                iv_oracle_pda=iv_oracle_pda,
                holder_pubkey=holder_pubkey,
                position_pda=position_pda,
                holder_usdc=holder_usdc,
                token_program=token_program,
                keeper_kp=kp,
                program_id=program_id,
                position=pos,
            )

    async def _submit_settlement(
        self,
        disc: int,
        option_type_disc: int,
        strike: int,
        expiry: int,
        settlement_price: int,
        vault_pda: "Pubkey",
        usdc_vault_pda: "Pubkey",
        iv_oracle_pda: "Pubkey",
        holder_pubkey: "Pubkey",
        position_pda: "Pubkey",
        holder_usdc: "Pubkey",
        token_program: "Pubkey",
        keeper_kp: "Keypair",
        program_id: "Pubkey",
        position: Dict,
    ):
        """
        Submit SettleExpired instruction.

        Args struct (borsh):
          u8  market_discriminant
          u8  option_type
          u64 strike
          i64 expiry
          u64 settlement_price
        """
        if not _SOLANA_AVAILABLE:
            return

        args_data = struct.pack(
            "<BBQqQ",
            disc,
            option_type_disc,
            strike,
            expiry,
            settlement_price,
        )
        ix_data = _DISC_SETTLE_EXPIRED + args_data

        ix = Instruction(
            program_id=program_id,
            data=ix_data,
            accounts=[
                AccountMeta(pubkey=vault_pda,          is_signer=False, is_writable=True),
                AccountMeta(pubkey=usdc_vault_pda,     is_signer=False, is_writable=True),
                AccountMeta(pubkey=iv_oracle_pda,      is_signer=False, is_writable=False),
                AccountMeta(pubkey=holder_pubkey,      is_signer=False, is_writable=False),
                AccountMeta(pubkey=position_pda,       is_signer=False, is_writable=True),
                AccountMeta(pubkey=holder_usdc,        is_signer=False, is_writable=True),
                AccountMeta(pubkey=keeper_kp.pubkey(), is_signer=True,  is_writable=False),
                AccountMeta(pubkey=token_program,      is_signer=False, is_writable=False),
            ],
        )

        sig = await self._send_instruction(ix, keeper_kp)
        if sig:
            logger.info(f"Settlement submitted on-chain: position={position_pda} tx={sig}")
            position["settled"] = True
        else:
            logger.warning(f"Settlement tx failed for position={position_pda}")

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
        rpc = self._get_rpc()
        if rpc is None:
            return 0

        vault_authority_str = getattr(config, "vault_authority", "")
        if not vault_authority_str:
            return 0

        try:
            vault_auth = Pubkey.from_string(vault_authority_str)
            program_id = self._get_program_id()
            vault_pda = self._derive_vault_pda(vault_auth, program_id)

            resp = await rpc.get_account_info(vault_pda, encoding="base64")
            if resp.value is None:
                return 0

            data = _decode_account_data(resp.value.data)
            if data is None or len(data) < 8 + 32 + 32 + 32 + 32 + 8 + 8 + 8:
                return 0

            # OptionVault layout (after 8-byte discriminator):
            # authority: Pubkey (32) + keeper: Pubkey (32) + usdc_mint: Pubkey (32) +
            # usdc_vault: Pubkey (32) + total_collateral: u64 (8) + open_interest: u64 (8)
            # + delta_net: i64 (8) + ...
            offset = 8 + 32 + 32 + 32 + 32 + 8 + 8
            delta_net = struct.unpack_from("<q", data, offset)[0]
            return delta_net
        except Exception as e:
            logger.warning(f"Failed to fetch vault delta: {e}")
            return 0

    async def _check_and_rebalance_delta(self):
        """Read vault's net delta from on-chain, compute hedge, submit if needed."""
        vault_delta = await self._fetch_vault_delta()

        threshold = int(config.delta_threshold * SCALE)
        if abs(vault_delta) <= threshold:
            logger.debug(f"Delta balanced: {vault_delta} <= threshold {threshold}")
            return

        is_buy = vault_delta < 0
        proxy_spot = next((p for p in self.latest_prices.values() if p > 0), 1.0)
        hedge_size_usdc = min(
            abs(vault_delta) * proxy_spot / SCALE,
            config.max_rebalance_usdc,
        )
        hedge_size = int(hedge_size_usdc * SCALE)
        spot_price_scaled = int(proxy_spot * SCALE)

        logger.info(
            f"Rebalancing delta: vault_delta={vault_delta} "
            f"hedge_size={hedge_size} is_buy={is_buy}"
        )
        await self._submit_rebalance(
            target_delta=0,
            hedge_size=hedge_size,
            spot_price=spot_price_scaled,
            is_buy=is_buy,
            hedge_size_usdc=hedge_size_usdc,
            proxy_spot=proxy_spot,
        )

    async def _submit_rebalance(
        self,
        target_delta: int,
        hedge_size: int,
        spot_price: int,
        is_buy: bool,
        hedge_size_usdc: float,
        proxy_spot: float,
    ):
        """
        Execute delta hedge:
          1. Place market order on Pacifica perps (actual hedge).
          2. Record hedge on-chain via rebalance_delta instruction.

        RebalanceDeltaArgs struct (borsh):
          i64 target_delta
          u64 hedge_size
          bool is_buy
        """
        # Determine hedge symbol
        symbol = max(
            (m for m in config.markets if self.latest_prices.get(m, 0) > 0),
            key=lambda m: self.latest_prices.get(m, 0),
            default="BTC",
        )
        side = "bid" if is_buy else "ask"
        underlying_amount = round(hedge_size_usdc / proxy_spot, 6) if proxy_spot > 0 else 0.0

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
            return  # Don't record on-chain if the actual hedge failed

        # Step 2: Record hedge on-chain
        if not _SOLANA_AVAILABLE:
            logger.warning("Skipping on-chain rebalance record (solana libs unavailable)")
            return

        kp = self._get_keypair()
        vault_authority_str = getattr(config, "vault_authority", "")
        if kp is None or not vault_authority_str:
            return

        vault_auth = Pubkey.from_string(vault_authority_str)
        program_id = self._get_program_id()
        vault_pda = self._derive_vault_pda(vault_auth, program_id)

        args_data = struct.pack("<qQ?", target_delta, hedge_size, is_buy)
        ix_data = _DISC_REBALANCE_DELTA + args_data

        ix = Instruction(
            program_id=program_id,
            data=ix_data,
            accounts=[
                AccountMeta(pubkey=vault_pda,    is_signer=False, is_writable=True),
                AccountMeta(pubkey=kp.pubkey(),  is_signer=True,  is_writable=False),
            ],
        )

        sig = await self._send_instruction(ix, kp)
        if sig:
            logger.info(
                f"Delta rebalance recorded on-chain: hedge_size={hedge_size} "
                f"is_buy={is_buy} tx={sig}"
            )
        else:
            logger.warning("Delta rebalance on-chain recording failed")

    # ── Open Position Management ─────────────────────────────────────────────

    def register_position(self, position: Dict):
        """Register an open position for tracking (called after buy_option)."""
        self.open_positions.append(position)

    def remove_position(self, pubkey: str):
        """Remove a settled/closed position."""
        self.open_positions = [
            p for p in self.open_positions if p.get("pubkey") != pubkey
        ]


# ── Account data helpers ──────────────────────────────────────────────────────

def _decode_account_data(data) -> Optional[bytes]:
    """Decode base64-encoded account data from RPC response."""
    import base64
    if isinstance(data, (list, tuple)) and len(data) >= 1:
        raw = data[0]
        if isinstance(raw, str):
            return base64.b64decode(raw)
        if isinstance(raw, bytes):
            return raw
    if isinstance(data, bytes):
        return data
    if isinstance(data, str):
        import base64
        return base64.b64decode(data)
    return None


def _decode_option_position(data: bytes) -> Optional[Dict]:
    """
    Decode an OptionPosition account from raw borsh bytes.

    Layout (after 8-byte discriminator):
      owner:       Pubkey (32)
      vault:       Pubkey (32)
      market:      u8 (1)      — Market enum discriminant
      option_type: u8 (1)      — OptionType enum discriminant
      strike:      u64 (8)
      expiry:      i64 (8)
      size:        u64 (8)
      premium_paid:u64 (8)
      entry_iv:    u64 (8)
      settled:     bool (1)
    """
    if len(data) < 8 + 32 + 32 + 1 + 1 + 8 + 8 + 8 + 8 + 8 + 1:
        return None
    try:
        offset = 8  # skip discriminator
        owner_bytes = data[offset:offset + 32]; offset += 32
        _vault_bytes = data[offset:offset + 32]; offset += 32
        market_disc   = data[offset]; offset += 1
        option_type   = data[offset]; offset += 1
        strike        = struct.unpack_from("<Q", data, offset)[0]; offset += 8
        expiry        = struct.unpack_from("<q", data, offset)[0]; offset += 8
        _size         = struct.unpack_from("<Q", data, offset)[0]; offset += 8
        _premium_paid = struct.unpack_from("<Q", data, offset)[0]; offset += 8
        _entry_iv     = struct.unpack_from("<Q", data, offset)[0]; offset += 8
        settled       = bool(data[offset])

        market = _MARKET_BY_DISC.get(market_disc)
        if market is None:
            return None

        from solders.pubkey import Pubkey as _Pubkey
        owner_str = str(_Pubkey.from_bytes(owner_bytes))

        return {
            "owner":       owner_str,
            "market":      market,
            "option_type": "Call" if option_type == 0 else "Put",
            "strike":      strike,
            "expiry":      expiry,
            "size":        _size,
            "settled":     settled,
        }
    except Exception:
        return None


def _b58_encode(data: bytes) -> str:
    """Base58-encode bytes (for RPC memcmp filters)."""
    import base58
    return base58.b58encode(data).decode()
