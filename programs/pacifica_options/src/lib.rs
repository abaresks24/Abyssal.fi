use anchor_lang::prelude::*;

pub mod error;
pub mod state;
pub mod math;
pub mod instructions;

use instructions::initialize_vault::*;
use instructions::ensure_series::*;
use instructions::update_iv_params::*;
use instructions::buy_option::*;
use instructions::sell_option::*;
use instructions::exercise_option::*;
use instructions::settle_expired::*;
use instructions::rebalance_delta::*;
use instructions::add_liquidity::*;
use instructions::remove_liquidity::*;
use instructions::vault_liquidity::*;
use instructions::list_for_resale::*;
use instructions::write_option_listing::*;
use instructions::fill_resale_listing::*;
use instructions::fill_written_listing::*;
use instructions::cancel_listing::*;
use instructions::settle_written_option::*;
use instructions::mint_option_nft::*;
use instructions::close_orphan::*;

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

    /// Migrate vault USDC mint step 1: close old vault_usdc, update usdc_mint
    pub fn migrate_usdc_mint_close(ctx: Context<MigrateUsdcMintClose>) -> Result<()> {
        instructions::initialize_vault::migrate_usdc_mint_close(ctx)
    }

    /// Migrate vault USDC mint step 2: re-create vault_usdc for new mint
    pub fn reinit_vault_usdc(ctx: Context<ReinitVaultUsdc>) -> Result<()> {
        instructions::initialize_vault::reinit_vault_usdc(ctx)
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

    /// Initialize AMM pool and position PDAs for a (user, series) pair.
    /// Call once per series before the first buy_option. Idempotent.
    pub fn ensure_series(ctx: Context<EnsureSeries>, args: EnsureSeriesArgs) -> Result<()> {
        instructions::ensure_series::handler(ctx, args)
    }

    /// Buy an option (platform fee = 5 bps applied on top of BS premium)
    pub fn buy_option(ctx: Context<BuyOption>, args: BuyOptionArgs) -> Result<()> {
        instructions::buy_option::handler(ctx, args)
    }

    /// Mint the NFT receipt for an option position.
    /// Call in the same transaction as buy_option (second instruction).
    /// Idempotent: no-op if the NFT was already minted.
    pub fn mint_option_nft(ctx: Context<MintOptionNft>) -> Result<()> {
        instructions::mint_option_nft::handler(ctx)
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

    // ── P2P Marketplace ───────────────────────────────────────────────────────

    /// List an existing protocol-issued position for resale
    pub fn list_for_resale(ctx: Context<ListForResale>, args: ListForResaleArgs) -> Result<()> {
        instructions::list_for_resale::handler(ctx, args)
    }

    /// Write a new option from scratch — locks collateral as counterparty
    pub fn write_option_listing(
        ctx: Context<WriteOptionListing>,
        args: WriteOptionListingArgs,
    ) -> Result<()> {
        instructions::write_option_listing::handler(ctx, args)
    }

    /// Fill a resale listing — transfers the position from seller to buyer
    pub fn fill_resale_listing(ctx: Context<FillResaleListing>) -> Result<()> {
        instructions::fill_resale_listing::handler(ctx)
    }

    /// Fill a written listing — creates a WrittenPosition for the buyer
    pub fn fill_written_listing(ctx: Context<FillWrittenListing>) -> Result<()> {
        instructions::fill_written_listing::handler(ctx)
    }

    /// Cancel a resale listing (seller reclaims rent; no token movement)
    pub fn cancel_resale_listing(ctx: Context<CancelResaleListing>) -> Result<()> {
        instructions::cancel_listing::cancel_resale_handler(ctx)
    }

    /// Cancel a written listing — returns collateral to writer
    pub fn cancel_written_listing(ctx: Context<CancelWrittenListing>) -> Result<()> {
        instructions::cancel_listing::cancel_written_handler(ctx)
    }

    /// Settle a written option at or after expiry (permissionless)
    pub fn settle_written_option(
        ctx: Context<SettleWrittenOption>,
        args: SettleWrittenOptionArgs,
    ) -> Result<()> {
        instructions::settle_written_option::handler(ctx, args)
    }

    // ── Global Vault LP ───────────────────────────────────────────────────────

    /// Initialize the vLP SPL token mint (authority-only, called once after vault init)
    pub fn initialize_vlp_mint(ctx: Context<InitializeVlpMint>) -> Result<()> {
        instructions::vault_liquidity::initialize_vlp_mint(ctx)
    }

    /// Reset vault accounting to zero and return all USDC to authority.
    /// Existing vLP tokens lose their backing. Authority-only.
    pub fn reset_vault(ctx: Context<ResetVault>) -> Result<()> {
        instructions::vault_liquidity::reset_vault(ctx)
    }

    /// Fix stale OI/delta counters without moving funds. Authority-only.
    /// Use when bookkeeping drifts from actual open positions.
    pub fn fix_open_interest(ctx: Context<FixOpenInterest>) -> Result<()> {
        instructions::vault_liquidity::fix_open_interest(ctx)
    }

    /// Zero the fees_collected counter (cosmetic/admin reset). Authority-only.
    /// Does not affect future fee accumulation.
    pub fn zero_fees_collected(ctx: Context<FixOpenInterest>) -> Result<()> {
        instructions::vault_liquidity::zero_fees_collected(ctx)
    }

    /// Close an OptionPosition PDA with size == 0 (orphan from failed buy).
    /// Reclaims rent to the owner.
    pub fn close_orphan_position(ctx: Context<CloseOrphanPosition>) -> Result<()> {
        instructions::close_orphan::close_orphan_position(ctx)
    }

    /// Close an AmmPool PDA with zero reserves (orphan from unused series).
    /// Reclaims rent to the vault authority.
    pub fn close_orphan_amm_pool(ctx: Context<CloseOrphanAmmPool>) -> Result<()> {
        instructions::close_orphan::close_orphan_amm_pool(ctx)
    }

    /// Transfer vLP mint authority from vault PDA to `new_authority`.
    /// Use before creating Metaplex token metadata (mint authority must sign).
    /// Must call restore_vlp_mint_authority immediately after.
    pub fn take_vlp_mint_authority(ctx: Context<TakeVlpMintAuthority>) -> Result<()> {
        instructions::vault_liquidity::take_vlp_mint_authority(ctx)
    }

    /// Restore vLP mint authority from admin keypair back to vault PDA.
    pub fn restore_vlp_mint_authority(ctx: Context<RestoreVlpMintAuthority>) -> Result<()> {
        instructions::vault_liquidity::restore_vlp_mint_authority(ctx)
    }

    /// Deposit USDC into the global vault and receive vLP SPL tokens
    pub fn deposit_vault(ctx: Context<DepositVault>, args: DepositVaultArgs) -> Result<()> {
        instructions::vault_liquidity::deposit_vault(ctx, args)
    }

    /// Burn vLP SPL tokens and withdraw proportional USDC from the global vault
    pub fn withdraw_vault(ctx: Context<WithdrawVault>, args: WithdrawVaultArgs) -> Result<()> {
        instructions::vault_liquidity::withdraw_vault(ctx, args)
    }
}
