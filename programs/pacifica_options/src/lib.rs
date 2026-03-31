use anchor_lang::prelude::*;

pub mod error;
pub mod state;
pub mod math;
pub mod instructions;

use instructions::initialize_vault::*;
use instructions::update_iv_params::*;
use instructions::buy_option::*;
use instructions::sell_option::*;
use instructions::exercise_option::*;
use instructions::settle_expired::*;
use instructions::rebalance_delta::*;
use instructions::add_liquidity::*;
use instructions::remove_liquidity::*;
use instructions::vault_liquidity::*;

declare_id!("CBkvR8SeN6j8RQKB7dSxG3dza2v71XHmWEe8LgfMW1hG");

/// PacificaOptions — Decentralized options market on Pacifica perpetuals
///
/// Fee Schedule:
///   - Platform trading fee: 0.05% (5 basis points) flat
///   - Settlement fee (ITM): 0.05% of payoff, capped at 50 USDC
///   - Settlement fee (OTM): 0%
#[program]
pub mod pacifica_options {
    use super::*;

    // ── Admin / Setup ────────────────────────────────────────────────────────

    /// Initialize the protocol vault
    pub fn initialize_vault(ctx: Context<InitializeVault>) -> Result<()> {
        instructions::initialize_vault::handler(ctx)
    }

    /// Pause the vault (halts all user-facing instructions)
    pub fn pause_vault(ctx: Context<PauseVault>) -> Result<()> {
        instructions::initialize_vault::pause_vault(ctx)
    }

    /// Unpause the vault
    pub fn unpause_vault(ctx: Context<PauseVault>) -> Result<()> {
        instructions::initialize_vault::unpause_vault(ctx)
    }

    /// Initialize an IV oracle account for a given market
    pub fn initialize_iv_oracle(
        ctx: Context<InitializeIVOracle>,
        market_discriminant: u8,
    ) -> Result<()> {
        instructions::update_iv_params::initialize_iv_oracle(ctx, market_discriminant)
    }

    /// Initialize an AMM pool for a specific options series
    pub fn initialize_amm_pool(
        ctx: Context<InitializeAmmPool>,
        args: InitAmmPoolArgs,
    ) -> Result<()> {
        instructions::add_liquidity::initialize_amm_pool(ctx, args)
    }

    // ── Keeper Operations ────────────────────────────────────────────────────

    /// Update IV surface parameters (keeper-only)
    pub fn update_iv_params(
        ctx: Context<UpdateIVParamsFull>,
        args: UpdateIVParamsArgsExt,
    ) -> Result<()> {
        instructions::update_iv_params::handler(ctx, args)
    }

    /// Auto-settle expired positions (keeper-only)
    pub fn settle_expired(
        ctx: Context<SettleExpired>,
        args: SettleExpiredArgs,
    ) -> Result<()> {
        instructions::settle_expired::handler(ctx, args)
    }

    /// Rebalance portfolio delta via perpetual hedges (keeper-only)
    pub fn rebalance_delta(
        ctx: Context<RebalanceDelta>,
        args: RebalanceDeltaArgs,
    ) -> Result<()> {
        instructions::rebalance_delta::handler(ctx, args)
    }

    // ── User Trading ─────────────────────────────────────────────────────────

    /// Buy an option (platform fee = 5 bps applied on top of BS premium)
    pub fn buy_option(ctx: Context<BuyOption>, args: BuyOptionArgs) -> Result<()> {
        instructions::buy_option::handler(ctx, args)
    }

    /// Sell (close) an option position back to the pool
    /// Platform fee = 5 bps deducted from proceeds
    pub fn sell_option(ctx: Context<SellOption>, args: SellOptionArgs) -> Result<()> {
        instructions::sell_option::handler(ctx, args)
    }

    /// Manually exercise an ITM option
    /// Settlement fee = 5 bps of payoff, capped at 50 USDC
    pub fn exercise_option(
        ctx: Context<ExerciseOption>,
        args: ExerciseOptionArgs,
    ) -> Result<()> {
        instructions::exercise_option::handler(ctx, args)
    }

    // ── Liquidity Management ─────────────────────────────────────────────────

    /// Add USDC liquidity to an AMM pool
    pub fn add_liquidity(ctx: Context<AddLiquidity>, args: AddLiquidityArgs) -> Result<()> {
        instructions::add_liquidity::handler(ctx, args)
    }

    /// Remove liquidity from an AMM pool and receive proportional USDC
    pub fn remove_liquidity(
        ctx: Context<RemoveLiquidity>,
        args: RemoveLiquidityArgs,
    ) -> Result<()> {
        instructions::remove_liquidity::handler(ctx, args)
    }

    // ── Global Vault LP ───────────────────────────────────────────────────────

    /// Deposit USDC into the global vault and receive vLP tokens
    pub fn deposit_vault(ctx: Context<DepositVault>, args: DepositVaultArgs) -> Result<()> {
        instructions::vault_liquidity::deposit_vault(ctx, args)
    }

    /// Burn vLP tokens and withdraw proportional USDC from the global vault
    pub fn withdraw_vault(ctx: Context<WithdrawVault>, args: WithdrawVaultArgs) -> Result<()> {
        instructions::vault_liquidity::withdraw_vault(ctx, args)
    }
}
