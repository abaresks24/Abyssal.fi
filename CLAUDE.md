# Abyssal.fi — Agent Context

> Decentralized on-chain options market on Solana.
> Options are European, cash-settled in USDC, priced via Black-Scholes + AFVR IV surface.
> AMM pools act as counterparty; delta hedging via Pacifica perpetuals.

---

## Repository Layout

```
Abyssal.fi/
├── programs/pacifica_options/   # Anchor smart contract (Rust)
│   └── src/
│       ├── lib.rs               # Program entrypoint + instruction dispatch
│       ├── error.rs             # OptionsError enum
│       ├── state/
│       │   ├── vault.rs         # OptionVault, IVParams
│       │   ├── amm_pool.rs      # AmmPool (constant-product)
│       │   ├── position.rs      # OptionPosition, LPPosition
│       │   ├── iv_oracle.rs     # IVOracle (per-market)
│       │   └── price_buffer.rs  # Rolling price history
│       ├── math/
│       │   ├── black_scholes.rs # BS pricing + Greeks (fixed-point)
│       │   ├── greeks.rs
│       │   └── fixed_point.rs   # SCALE = 1_000_000
│       └── instructions/        # One file per instruction
│           ├── initialize_vault.rs   # + pause_vault / unpause_vault
│           ├── update_iv_params.rs   # + initialize_iv_oracle
│           ├── buy_option.rs
│           ├── sell_option.rs
│           ├── exercise_option.rs
│           ├── settle_expired.rs
│           ├── rebalance_delta.rs
│           ├── add_liquidity.rs      # + initialize_amm_pool
│           └── remove_liquidity.rs
├── frontend/                    # Next.js 14 App Router (TypeScript)
│   ├── src/
│   │   ├── app/
│   │   │   ├── layout.tsx       # Root layout, fonts, dark class
│   │   │   ├── globals.css      # CSS variables (Pacifica palette)
│   │   │   └── page.tsx         # Main page (tabs: Trade / Positions / Liquidity / Analytics)
│   │   ├── components/
│   │   │   ├── Header.tsx
│   │   │   ├── OptionSelector.tsx
│   │   │   ├── PriceQuote.tsx
│   │   │   ├── GreeksDashboard.tsx
│   │   │   ├── PositionsList.tsx
│   │   │   ├── IVSurface.tsx
│   │   │   ├── LiquidityPanel.tsx
│   │   │   ├── TradeModal.tsx
│   │   │   └── WalletProvider.tsx
│   │   ├── hooks/
│   │   │   ├── usePacificaPrice.ts  # WebSocket price feed
│   │   │   ├── useGreeks.ts
│   │   │   ├── useOptions.ts
│   │   │   └── useWallet.ts
│   │   ├── lib/
│   │   │   ├── anchor_client.ts     # All on-chain calls (Program<PacificaOptions>)
│   │   │   ├── constants.ts         # PROGRAM_ID, USDC_MINT, SOLANA_RPC, SCALE, fees
│   │   │   ├── black_scholes.ts     # Client-side BS for live previews
│   │   │   ├── pacifica_api.ts      # REST/WS wrapper for Pacifica price feed
│   │   │   └── pacifica_options_idl.json
│   │   └── types/index.ts
│   ├── tailwind.config.js
│   ├── next.config.js
│   └── .env.local
├── iv_engine/                   # Python keeper service
│   ├── main.py
│   ├── keeper.py                # Orchestrator (IV updates, settle, delta hedge)
│   ├── pacifica_client.py       # REST + WebSocket client + CoinGecko fallback
│   ├── afvr_calculator.py       # AFVR IV surface computation
│   ├── iv_surface.py
│   ├── config.py
│   ├── requirements.txt
│   └── .env
└── scripts/
    └── init_protocol.ts         # One-time protocol initialization
```

---

## Deployed Addresses (Solana Devnet)

| Account | Address |
|---|---|
| Program | `CBkvR8SeN6j8RQKB7dSxG3dza2v71XHmWEe8LgfMW1hG` |
| Vault PDA | `6VJctQcCPRkSwWVL8coqNhxdvtJhQYGzZnLV2ohowP5g` |
| Vault USDC | `jizzTANsmdq9zLbrFdroiUk3xPUzQb4hbrpJHWRvqy3` |
| BTC IV Oracle      | `ADJm8QBLYRhwQHuWCW57QMFDdvqpNtTkSyMwLiSkkyUB` |
| ETH IV Oracle      | `7YF8ocifL6D6kXDSL3YspPmf6sPSA4s4E2RsdaNmhfwu` |
| SOL IV Oracle      | `8CTidLNY1aRn2uiHToJesWcFWBv1NaDLJ41mY9bvpjpy` |
| NVDA IV Oracle     | `3X8erYWxg25G1FTZ5JuG198w8FwcFhDFJe1ex538baTw` |
| TSLA IV Oracle     | `DTZTV5oUwvCiEEq21x7FZbRqc9Nt2ARYmVLq7tTT569k` |
| PLTR IV Oracle     | `25Wa2TVC8b7tTyg1bhdSzfYcYMvhjqVR5dyLugfmthQn` |
| CRCL IV Oracle     | `5T4T6derHhKqibthFXwpiLp4FFx85tN8BQXUGYh2BnzJ` |
| HOOD IV Oracle     | `3BHC79FgTae3mywQyg2o4tTUb8KswtqCwbxA6a2kEZ11` |
| SP500 IV Oracle    | `CEGLw4pHGWaz8x3FaMomuHSdwK4sjjenjPKcgM3H2xCc` |
| XAU IV Oracle      | `JAvBtx2xY4it6rmaVXpshrWVs9shYCtQ4sxvGZ7v7uGq` |
| XAG IV Oracle      | `D9gKWAJiip95styk4K6NW7UKN746SGqiLnr39peG6mTW` |
| PAXG IV Oracle     | `5PbRFu5FaoPEfiHhTdhYjnE5oj8CtKZzN8XNN4vMhz6K` |
| PLATINUM IV Oracle | `J2J8TFeo7MUQZ5nXoCQuLYEnCkhkK4zEKDiAny9uj3tK` |
| NATGAS IV Oracle   | `HiTvMtWJ2sZEBWVzSpySj2mFtQrWoXTRkrW8YfX4hyf7` |
| COPPER IV Oracle   | `9Utnwhw23uAfRA1JP8J8Ja5sadB7PB686aYWrJtoMXVB`  |
| USDC Mint (devnet) | `4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU` |
| Authority keypair | `~/.config/solana/id.json` |
| Keeper keypair | `~/.config/solana/keeper.json` (= id.json on devnet) |

---

## On-Chain Data Model

### Fixed-point scaling
All USDC amounts and prices use **SCALE = 1_000_000** (6 decimals).
All IV/Greeks use **SCALE = 1_000_000** (1.0 = 100% vol).

### Market discriminants
```
Crypto:      BTC=0  | ETH=1  | SOL=2
Equities:    NVDA=3 | TSLA=4 | PLTR=5 | CRCL=6 | HOOD=7 | SP500=8
Commodities: XAU=9  | XAG=10 | PAXG=11 | PLATINUM=12 | NATGAS=13 | COPPER=14
```

### Option type discriminants
```
Call = 0 | Put = 1
```

### PDA seeds
```
Vault:       ["vault",      authority]
VaultUSDC:   ["vault_usdc", vault]
IVOracle:    ["iv_oracle",  vault, market_disc (1 byte)]
AmmPool:     ["amm_pool",   vault, market_disc, option_type_disc, strike (le8), expiry (le8)]
Position:    ["position",   owner, vault, market_disc, option_type_disc, strike (le8), expiry (le8)]
LPPosition:  ["lp_position", owner, pool]
```

### Key accounts

**OptionVault** — one global vault
```
authority, keeper, usdc_mint, usdc_vault,
total_collateral, open_interest, delta_net (i64),
iv_params: { iv_atm, iv_skew_rho, iv_curvature_phi, theta_param },
last_iv_update, fees_collected, paused
```

**AmmPool** — one per (market, optionType, strike, expiry)
```
vault, market, option_type, strike, expiry,
reserve_options, reserve_usdc, k_invariant (u128 stored as lo/hi),
total_lp_tokens, fees_earned
```
AMM is constant-product: `k = reserve_options × reserve_usdc`

**OptionPosition** — one per (owner, series)
```
owner, vault, market, option_type, strike, expiry,
size (underlying units), premium_paid, entry_iv, settled
```

**IVOracle** — one per (vault, market)
```
market_discriminant, iv_atm, iv_skew_rho, iv_curvature_phi,
theta_param, latest_price, last_update
```

---

## Fee Schedule

| Event | Fee |
|---|---|
| Buy / Sell | 0.05% (5 bps) of premium |
| Exercise (ITM) | 0.05% of payoff, capped at 50 USDC |
| Exercise (OTM) | 0% |

Constants in `frontend/src/lib/constants.ts`:
```ts
PLATFORM_FEE_BPS = 5
BPS_DENOM = 10_000
SCALE = 1_000_000
```

---

## Frontend Stack

- **Next.js 14** App Router, `'use client'` components
- **Tailwind CSS** + custom CSS variables (Pacifica dark palette)
- **@coral-xyz/anchor** for on-chain calls
- **@solana/wallet-adapter-react** — Phantom + Solflare
- **Recharts** for IV surface visualization

### Design system (Pacifica palette)
CSS variables defined in `globals.css`:

```css
--background:      #0a121c    /* page bg (dark navy) */
--popover:         #0c1218    /* cards / panels */
--secondary:       #1a263a    /* secondary surfaces */
--foreground:      #ffffff    /* primary text */
--muted-foreground:#8898a8    /* secondary text */
--primary:         #55c3e9    /* brand cyan */
--primary-hover:   #7edcfa
--bid:             #02c77b    /* green / long / gain */
--ask:             #eb365a    /* red / short / loss */
--warn:            #ecca5a    /* warning yellow */
--border:          rgba(255,255,255,0.12)
--radius:          0.5rem
```

Font: **Inter** (body) + **JetBrains Mono** (numbers)
Tailwind dark mode: `darkMode: 'class'`, `<html class="dark">`

### Anchor client (`frontend/src/lib/anchor_client.ts`)
All transactions go through `PacificaOptionsClient`:
```ts
client.buyOption({ vaultAuthority, market, optionType, strikeUsdc, expiry, sizeUnderlying, maxPremiumUsdc })
client.sellOption({ ... minProceedsUsdc })
client.exerciseOption({ vaultAuthority, market, optionType, strikeUsdc, expiry })
client.addLiquidity({ ... usdcAmount, minLpTokens? })
client.removeLiquidity({ ... lpTokens, minUsdcOut })
```
PDA helpers exported: `findVaultPDA`, `findAmmPoolPDA`, `findPositionPDA`, `findLPPositionPDA`, `findIVOraclePDA`

---

## IV Engine (Python)

Located in `iv_engine/`. Runs as a background keeper service.

**Start:**
```bash
cd iv_engine
.venv/bin/python main.py
```

**Architecture:**
```
Keeper.run()
  ├── PacificaWebSocketClient  — real-time price ticks (reconnects automatically)
  ├── _iv_update_loop()        — every 300s: compute AFVR params → update_iv_params
  ├── _settlement_loop()       — every 30s: settle expired positions
  └── _delta_rebalance_loop()  — every 120s: hedge net delta via perps
```

**Price fallback chain:**
1. Cached WebSocket tick (Pacifica)
2. Pacifica REST API
3. CoinGecko public API (`fetch_prices_coingecko()`)

**IV model:** AFVR (Asymmetric Funding-Adjusted Volatility with Risk-reversal)
- `AFVRCalculator.compute_params(market)` → `{ iv_atm, iv_skew_rho, iv_curvature_phi, theta_param }`
- `IVSurfaceBuilder` builds the full vol surface

**⚠ TODO:** `_submit_iv_update()` and `_submit_settlement()` currently only log payloads.
On-chain submission via `anchorpy` is not yet implemented.

---

## Development Commands

```bash
# Smart contract
anchor build
anchor test
anchor deploy --provider.cluster devnet

# Protocol init (run once after deploy)
npx ts-node scripts/init_protocol.ts

# Frontend
cd frontend
npm run dev       # http://localhost:3000
npm run build

# IV engine
cd iv_engine
.venv/bin/pip install -r requirements.txt
.venv/bin/python main.py
```

---

## What Works / What Is Still TODO

### ✅ Done
- Anchor program deployed to devnet
- All 11 tests pass
- Protocol initialized (vault + 3 IV oracles)
- Frontend: wallet connection (Phantom / Solflare)
- Frontend: live BS pricing preview
- Frontend: Greeks dashboard
- Frontend: IV surface chart
- Frontend: Pacifica design system (colors, fonts)
- Frontend: `anchor_client.ts` wired to real program (real PDAs, real IDL)
- IV engine: AFVR calculator
- IV engine: CoinGecko price fallback

### 🔲 TODO
1. **Initialize AMM pools** — vault + oracles are live but no pools yet; call `initializeAmmPool` per series before users can trade
2. **IV engine on-chain submission** — wire `_submit_iv_update()` with anchorpy to actually call `update_iv_params`
3. **Frontend: connect `handleConfirmTrade` to `anchor_client.buyOption`** — currently mock
4. **Frontend: fetch real positions** — currently uses `MOCK_POSITIONS`; need to `getProgramAccounts` for `OptionPosition` by owner
5. **Frontend: fetch real AMM pool data** — `LiquidityPanel` uses mock pools
6. **`usePacificaPrice` hook** — currently REST polling; should use WebSocket for live ticks
7. **Settlement** — `settle_expired` instruction exists but keeper doesn't yet call it on-chain
8. **Delta rebalancing** — `rebalance_delta` instruction exists but keeper doesn't yet call it on-chain

---

## Key Conventions

- **Never use `yarn`** — project uses `npm`
- **`anchor test` uses `npx ts-mocha`**, not yarn
- All large `#[derive(Accounts)]` structs use `Box<Account<'info, T>>` to stay within the 4096-byte BPF stack limit
- IDL naming: Rust `IVOracle` → TS `ivOracle`, Rust `LPPosition` → TS `lpPosition`
- `declare_id!` in `lib.rs` and `Anchor.toml` must match the actual deployed keypair address (`CBkvR8...`)
- Amounts passed to program methods must be `BN(Math.round(usdcAmount * SCALE))`
