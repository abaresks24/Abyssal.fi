use anchor_lang::prelude::*;
use crate::state::vault::OptionVault;
use crate::state::amm_pool::AmmPool;
use crate::state::position::{OptionPosition, OptionType};
use crate::instructions::buy_option::{market_from_u8, option_type_from_u8};

/// Args mirror BuyOptionArgs so the seeds can be derived identically.
#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct EnsureSeriesArgs {
    pub market_discriminant: u8,
    pub option_type: u8,
    pub strike: u64,
    pub expiry: i64,
}

/// Idempotent — creates the AMM pool and/or position PDA if they do not yet
/// exist.  Must be called (in the same transaction or a prior one) before the
/// first `buy_option` for a given (user, series) combination.
///
/// Separating this from `buy_option` keeps each instruction's stack frame
/// under the 4 096-byte BPF limit.
#[derive(Accounts)]
#[instruction(args: EnsureSeriesArgs)]
pub struct EnsureSeries<'info> {
    #[account(
        seeds = [b"vault", vault.authority.as_ref()],
        bump = vault.bump,
    )]
    pub vault: Box<Account<'info, OptionVault>>,

    /// AMM pool for this options series
    #[account(
        init_if_needed,
        payer = payer,
        space = AmmPool::LEN,
        seeds = [
            b"amm_pool",
            vault.key().as_ref(),
            &[args.market_discriminant],
            &[args.option_type],
            &args.strike.to_le_bytes(),
            &args.expiry.to_le_bytes(),
        ],
        bump,
    )]
    pub amm_pool: Box<Account<'info, AmmPool>>,

    /// Position account for (payer, series)
    #[account(
        init_if_needed,
        payer = payer,
        space = OptionPosition::LEN,
        seeds = [
            b"position",
            payer.key().as_ref(),
            vault.key().as_ref(),
            &[args.market_discriminant],
            &[args.option_type],
            &args.strike.to_le_bytes(),
            &args.expiry.to_le_bytes(),
        ],
        bump,
    )]
    pub position: Box<Account<'info, OptionPosition>>,

    #[account(mut)]
    pub payer: Signer<'info>,

    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

pub fn handler(ctx: Context<EnsureSeries>, args: EnsureSeriesArgs) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    let market = market_from_u8(args.market_discriminant)?;
    let option_type = option_type_from_u8(args.option_type)?;

    // Seed AMM pool if newly created
    {
        let pool = &mut ctx.accounts.amm_pool;
        if pool.vault == Pubkey::default() {
            pool.bump            = ctx.bumps.amm_pool;
            pool.vault           = ctx.accounts.vault.key();
            pool.market          = market;
            pool.option_type     = option_type;
            pool.strike          = args.strike;
            pool.expiry          = args.expiry;
            pool.reserve_options = 0;
            pool.reserve_usdc    = 0;
            pool.set_k_invariant(0);
            pool.total_lp_tokens = 0;
            pool.fees_earned     = 0;
            pool.last_rebalance  = now;
            pool._padding        = [0u8; 32];
        }
    }

    // Seed position if newly created
    {
        let position = &mut ctx.accounts.position;
        if position.owner == Pubkey::default() {
            position.bump             = ctx.bumps.position;
            position.owner            = ctx.accounts.payer.key();
            position.vault            = ctx.accounts.vault.key();
            position.market           = market;
            position.option_type      = option_type;
            position.strike           = args.strike;
            position.expiry           = args.expiry;
            position.size             = 0;
            position.premium_paid     = 0;
            position.entry_iv         = 0;
            position.entry_delta      = 0;
            position.settled          = false;
            position.payoff_received  = 0;
            position.created_at       = now;
            position._padding         = [0u8; 32];
        }
    }

    Ok(())
}
