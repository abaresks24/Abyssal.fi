"""
PacificaOptions IV Engine — Entry Point
Run with: python main.py
"""
import asyncio
import logging
import signal
import sys
from typing import Optional

import structlog
from dotenv import load_dotenv

load_dotenv()

from config import config
from keeper import Keeper

# ── Logging Setup ────────────────────────────────────────────────────────────

def setup_logging():
    log_level = getattr(logging, config.log_level.upper(), logging.INFO)

    structlog.configure(
        processors=[
            structlog.contextvars.merge_contextvars,
            structlog.processors.add_log_level,
            structlog.processors.TimeStamper(fmt="iso"),
            structlog.dev.ConsoleRenderer() if sys.stderr.isatty()
            else structlog.processors.JSONRenderer(),
        ],
        wrapper_class=structlog.make_filtering_bound_logger(log_level),
        logger_factory=structlog.PrintLoggerFactory(),
        cache_logger_on_first_use=True,
    )

    # Also configure stdlib logging for third-party libs
    logging.basicConfig(
        level=log_level,
        format="%(asctime)s %(name)s %(levelname)s %(message)s",
        handlers=[
            logging.StreamHandler(sys.stdout),
        ]
        + (
            [logging.FileHandler(config.log_file)]
            if config.log_file
            else []
        ),
    )


# ── Main ─────────────────────────────────────────────────────────────────────

async def main():
    setup_logging()
    logger = structlog.get_logger()

    logger.info(
        "PacificaOptions IV Keeper starting",
        program_id=config.program_id,
        markets=config.markets,
        api_base=config.api_base_url,
        iv_interval=config.iv_update_interval,
    )

    if not config.api_key:
        logger.warning(
            "PACIFICA_API_KEY is not set — REST/WS calls will likely fail"
        )

    keeper = Keeper()

    # Handle graceful shutdown on SIGINT / SIGTERM
    loop = asyncio.get_running_loop()
    shutdown_event = asyncio.Event()

    def _signal_handler(sig):
        logger.info(f"Received signal {sig.name}, initiating shutdown...")
        shutdown_event.set()

    for sig in (signal.SIGINT, signal.SIGTERM):
        loop.add_signal_handler(sig, _signal_handler, sig)

    keeper_task = asyncio.create_task(keeper.run(), name="keeper")

    # Wait until shutdown signal
    await shutdown_event.wait()
    logger.info("Shutdown signal received, stopping keeper...")

    keeper_task.cancel()
    try:
        await keeper_task
    except asyncio.CancelledError:
        pass

    await keeper.stop()
    logger.info("PacificaOptions IV Keeper stopped cleanly")


if __name__ == "__main__":
    asyncio.run(main())
