use anchor_lang::prelude::*;

#[error_code]
pub enum OptionsError {
    // ── Vault / Admin ────────────────────────────────────────────────────────
    #[msg("Protocol is paused")]
    ProtocolPaused,

    #[msg("Unauthorized: caller is not the vault authority")]
    Unauthorized,

    #[msg("Unauthorized: caller is not the designated keeper")]
    UnauthorizedKeeper,

    // ── Option Parameters ────────────────────────────────────────────────────
    #[msg("Option has already expired")]
    OptionExpired,

    #[msg("Option has not yet expired")]
    OptionNotExpired,

    #[msg("Option has already been settled")]
    AlreadySettled,

    #[msg("Option is out-of-the-money; no payoff")]
    OutOfTheMoney,

    #[msg("Invalid strike price: must be > 0")]
    InvalidStrike,

    #[msg("Invalid expiry: must be in the future")]
    InvalidExpiry,

    #[msg("Invalid option size: must be > 0")]
    InvalidSize,

    #[msg("Expiry too far in the future (max 90 days)")]
    ExpiryTooFar,

    #[msg("Expiry too close (min 1 hour)")]
    ExpiryTooClose,

    // ── Pricing / Math ───────────────────────────────────────────────────────
    #[msg("Arithmetic overflow in fixed-point math")]
    MathOverflow,

    #[msg("Division by zero")]
    DivisionByZero,

    #[msg("Computed premium is zero or negative")]
    ZeroPremium,

    #[msg("IV value out of valid range [1%, 500%]")]
    IVOutOfRange,

    #[msg("Price feed is stale (older than 60 seconds)")]
    StalePriceFeed,

    #[msg("Insufficient collateral in vault")]
    InsufficientCollateral,

    // ── AMM / Liquidity ──────────────────────────────────────────────────────
    #[msg("Insufficient liquidity in AMM pool")]
    InsufficientLiquidity,

    #[msg("Slippage tolerance exceeded")]
    SlippageExceeded,

    #[msg("AMM pool k-invariant violated")]
    KInvariantViolated,

    #[msg("LP token amount is zero")]
    ZeroLpTokens,

    #[msg("Minimum LP tokens not met")]
    MinLpTokensNotMet,

    #[msg("Insufficient LP tokens to remove")]
    InsufficientLpTokens,

    // ── Token / Account ──────────────────────────────────────────────────────
    #[msg("Insufficient USDC balance")]
    InsufficientUsdc,

    #[msg("Invalid USDC mint")]
    InvalidUsdcMint,

    #[msg("Invalid token account owner")]
    InvalidTokenAccountOwner,

    // ── Delta Rebalancing ────────────────────────────────────────────────────
    #[msg("Delta imbalance within acceptable threshold; rebalance not needed")]
    DeltaBalanced,

    #[msg("Rebalance size exceeds maximum allowed")]
    RebalanceSizeTooLarge,

    // ── IV Oracle ────────────────────────────────────────────────────────────
    #[msg("IV oracle data is too old")]
    IVOracleStale,

    #[msg("IV parameters have not changed")]
    IVParamsUnchanged,

    #[msg("IV jump too large: new IV deviates >50% from current value")]
    IVJumpTooLarge,

    // ── Settlement ───────────────────────────────────────────────────────────
    #[msg("Settlement fee exceeds cap")]
    SettlementFeeCapExceeded,

    #[msg("Invalid settlement price")]
    InvalidSettlementPrice,

    // ── Market ───────────────────────────────────────────────────────────────
    #[msg("Unknown market identifier")]
    UnknownMarket,

    #[msg("Market is not supported")]
    MarketNotSupported,

    // ── Numerical ────────────────────────────────────────────────────────────
    #[msg("Square root input is negative")]
    NegativeSqrtInput,

    #[msg("Logarithm input must be positive")]
    LogNonPositive,

    #[msg("Value exceeds u64 maximum")]
    U64Overflow,
}
