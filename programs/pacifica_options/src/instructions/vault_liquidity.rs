use anchor_lang::prelude::*;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token::{self, Burn, Mint, MintTo, SetAuthority, Token, TokenAccount, Transfer};
use anchor_spl::token::spl_token::instruction::AuthorityType;
use crate::state::vault::OptionVault;
use crate::state::position::VaultLPPosition;
use crate::error::OptionsError;

// ── Initialize vLP Mint ───────────────────────────────────────────────────────
//
// Creates the SPL token mint that represents vault shares.
// Seeds: ["vlp_mint", vault] — mint authority is the vault PDA.
// Called once by the authority after vault initialization.

#[derive(Accounts)]
pub struct InitializeVlpMint<'info> {
    #[account(
        mut,
        seeds = [b"vault", vault.authority.as_ref()],
        bump = vault.bump,
        constraint = authority.key() == vault.authority @ OptionsError::Unauthorized,
    )]
    pub vault: Box<Account<'info, OptionVault>>,

    #[account(
        init,
        payer = authority,
        mint::decimals = 6,
        mint::authority = vault,
        seeds = [b"vlp_mint", vault.key().as_ref()],
        bump,
    )]
    pub vlp_mint: Box<Account<'info, Mint>>,

    #[account(mut)]
    pub authority: Signer<'info>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

pub fn initialize_vlp_mint(ctx: Context<InitializeVlpMint>) -> Result<()> {
    let vault = &mut ctx.accounts.vault;
    vault.vlp_mint = ctx.accounts.vlp_mint.key();
    msg!("vLP SPL mint initialized: {}", vault.vlp_mint);
    Ok(())
}

// ── Deposit Vault ─────────────────────────────────────────────────────────────
//
// Deposit USDC into the global vault → receive vLP SPL tokens to caller's ATA.
// vLP price = total_collateral / total_vlp_supply.
// First deposit seeds at 1 vLP = 1 USDC.

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct DepositVaultArgs {
    /// USDC amount to deposit (6 dec)
    pub usdc_amount: u64,
    /// Minimum vLP tokens expected — slippage guard (0 = no check)
    pub min_vlp_tokens: u64,
}

#[derive(Accounts)]
pub struct DepositVault<'info> {
    #[account(
        mut,
        seeds = [b"vault", vault.authority.as_ref()],
        bump = vault.bump,
    )]
    pub vault: Box<Account<'info, OptionVault>>,

    #[account(
        mut,
        seeds = [b"vault_usdc", vault.key().as_ref()],
        bump,
        token::mint = vault.usdc_mint,
        token::authority = vault,
    )]
    pub usdc_vault: Box<Account<'info, TokenAccount>>,

    /// vLP SPL token mint (must match vault.vlp_mint)
    #[account(
        mut,
        seeds = [b"vlp_mint", vault.key().as_ref()],
        bump,
        constraint = vlp_mint.key() == vault.vlp_mint @ OptionsError::InvalidUsdcMint,
    )]
    pub vlp_mint: Box<Account<'info, Mint>>,

    /// Depositor's vLP ATA — created on first deposit
    #[account(
        init_if_needed,
        payer = depositor,
        associated_token::mint = vlp_mint,
        associated_token::authority = depositor,
    )]
    pub depositor_vlp: Box<Account<'info, TokenAccount>>,

    /// Depositor's USDC token account
    #[account(
        mut,
        token::mint = vault.usdc_mint,
        token::authority = depositor,
    )]
    pub depositor_usdc: Box<Account<'info, TokenAccount>>,

    /// LP position tracker — created on first deposit, updated on each deposit/withdraw
    #[account(
        init_if_needed,
        payer = depositor,
        space = VaultLPPosition::LEN,
        seeds = [b"vault_lp_position", depositor.key().as_ref(), vault.key().as_ref()],
        bump,
    )]
    pub lp_position: Box<Account<'info, VaultLPPosition>>,

    #[account(mut)]
    pub depositor: Signer<'info>,

    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

pub fn deposit_vault(ctx: Context<DepositVault>, args: DepositVaultArgs) -> Result<()> {
    require!(!ctx.accounts.vault.paused, OptionsError::ProtocolPaused);
    require!(args.usdc_amount > 0, OptionsError::InsufficientUsdc);
    require!(
        ctx.accounts.vault.vlp_mint != Pubkey::default(),
        OptionsError::InvalidUsdcMint // vLP mint not yet initialized
    );

    let vault = &ctx.accounts.vault;

    // Compute how many vLP tokens to mint
    // First deposit: 1 vLP = 1 USDC (seed ratio)
    let vlp_tokens = if vault.total_vlp_tokens == 0 || vault.total_collateral == 0 {
        args.usdc_amount
    } else {
        (args.usdc_amount as u128)
            .checked_mul(vault.total_vlp_tokens as u128)
            .ok_or(OptionsError::MathOverflow)?
            .checked_div(vault.total_collateral as u128)
            .ok_or(OptionsError::DivisionByZero)? as u64
    };

    require!(vlp_tokens > 0, OptionsError::ZeroLpTokens);
    require!(vlp_tokens >= args.min_vlp_tokens, OptionsError::MinLpTokensNotMet);

    // 1. Transfer USDC from depositor → vault
    token::transfer(
        CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from:      ctx.accounts.depositor_usdc.to_account_info(),
                to:        ctx.accounts.usdc_vault.to_account_info(),
                authority: ctx.accounts.depositor.to_account_info(),
            },
        ),
        args.usdc_amount,
    )?;

    // 2. Mint vLP tokens to depositor's ATA (vault PDA is mint authority)
    let authority_key = ctx.accounts.vault.authority;
    let vault_bump   = ctx.accounts.vault.bump;
    let seeds: &[&[u8]] = &[b"vault", authority_key.as_ref(), &[vault_bump]];

    token::mint_to(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            MintTo {
                mint:      ctx.accounts.vlp_mint.to_account_info(),
                to:        ctx.accounts.depositor_vlp.to_account_info(),
                authority: ctx.accounts.vault.to_account_info(),
            },
            &[seeds],
        ),
        vlp_tokens,
    )?;

    // 3. Update LP position tracker (before mutable vault borrow)
    // Snapshot vault.fees_collected so we can compute fee share earned after this deposit.
    let clock = Clock::get()?;
    let vault_key = ctx.accounts.vault.key();
    let vault_fees_now = ctx.accounts.vault.fees_collected;
    {
        let lp = &mut ctx.accounts.lp_position;
        if lp.created_at == 0 {
            lp.bump = ctx.bumps.lp_position;
            lp.owner = ctx.accounts.depositor.key();
            lp.vault = vault_key;
            lp.created_at = clock.unix_timestamp;
        }
        lp.vlp_tokens = lp.vlp_tokens.checked_add(vlp_tokens).ok_or(OptionsError::MathOverflow)?;
        lp.usdc_deposited = lp.usdc_deposited.checked_add(args.usdc_amount).ok_or(OptionsError::MathOverflow)?;
        lp.last_deposit_at = clock.unix_timestamp;
        // Reset fees_checkpoint on each deposit so the LP only earns fees going forward
        // from their latest deposit weighted by their new total vLP holdings.
        lp.fees_checkpoint = vault_fees_now;
    }

    // 4. Update vault totals
    let vault = &mut ctx.accounts.vault;
    vault.total_collateral = vault.total_collateral
        .checked_add(args.usdc_amount)
        .ok_or(OptionsError::MathOverflow)?;
    vault.total_vlp_tokens = vault.total_vlp_tokens
        .checked_add(vlp_tokens)
        .ok_or(OptionsError::MathOverflow)?;

    msg!(
        "Vault deposit: usdc={} vlp_minted={} total_vlp={} total_collateral={}",
        args.usdc_amount, vlp_tokens,
        vault.total_vlp_tokens, vault.total_collateral
    );
    Ok(())
}

// ── Withdraw Vault ────────────────────────────────────────────────────────────
//
// Burn vLP tokens from caller's ATA → receive proportional USDC from vault.
// Solvency guard: remaining vault USDC must cover 120% of open interest.

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct WithdrawVaultArgs {
    /// vLP tokens to burn (6 dec)
    pub vlp_tokens: u64,
    /// Minimum USDC to receive — slippage guard (0 = no check)
    pub min_usdc_out: u64,
}

#[derive(Accounts)]
#[instruction(args: WithdrawVaultArgs)]
pub struct WithdrawVault<'info> {
    #[account(
        mut,
        seeds = [b"vault", vault.authority.as_ref()],
        bump = vault.bump,
    )]
    pub vault: Box<Account<'info, OptionVault>>,

    #[account(
        mut,
        seeds = [b"vault_usdc", vault.key().as_ref()],
        bump,
        token::mint = vault.usdc_mint,
        token::authority = vault,
    )]
    pub usdc_vault: Box<Account<'info, TokenAccount>>,

    /// vLP SPL token mint
    #[account(
        mut,
        seeds = [b"vlp_mint", vault.key().as_ref()],
        bump,
        constraint = vlp_mint.key() == vault.vlp_mint @ OptionsError::InvalidUsdcMint,
    )]
    pub vlp_mint: Box<Account<'info, Mint>>,

    /// Withdrawer's vLP ATA — must hold at least args.vlp_tokens
    #[account(
        mut,
        associated_token::mint = vlp_mint,
        associated_token::authority = withdrawer,
        constraint = withdrawer_vlp.amount >= args.vlp_tokens @ OptionsError::InsufficientLpTokens,
    )]
    pub withdrawer_vlp: Box<Account<'info, TokenAccount>>,

    /// Withdrawer's USDC token account (receives USDC)
    #[account(
        mut,
        token::mint = vault.usdc_mint,
        token::authority = withdrawer,
    )]
    pub withdrawer_usdc: Box<Account<'info, TokenAccount>>,

    /// LP position tracker — must exist (created on deposit)
    #[account(
        mut,
        seeds = [b"vault_lp_position", withdrawer.key().as_ref(), vault.key().as_ref()],
        bump = lp_position.bump,
        constraint = lp_position.owner == withdrawer.key() @ OptionsError::Unauthorized,
    )]
    pub lp_position: Box<Account<'info, VaultLPPosition>>,

    #[account(mut)]
    pub withdrawer: Signer<'info>,

    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
}

// ── Reset Vault (authority-only, devnet / emergency use) ─────────────────────
//
// Transfers all USDC from the vault back to the authority and zeroes the
// vLP accounting counters. Existing vLP SPL tokens lose their backing —
// only use on devnet or in a controlled emergency context.

#[derive(Accounts)]
pub struct ResetVault<'info> {
    #[account(
        mut,
        seeds = [b"vault", vault.authority.as_ref()],
        bump = vault.bump,
        constraint = authority.key() == vault.authority @ OptionsError::Unauthorized,
    )]
    pub vault: Box<Account<'info, OptionVault>>,

    #[account(
        mut,
        seeds = [b"vault_usdc", vault.key().as_ref()],
        bump,
        token::mint = vault.usdc_mint,
        token::authority = vault,
    )]
    pub usdc_vault: Box<Account<'info, TokenAccount>>,

    #[account(
        mut,
        token::mint = vault.usdc_mint,
        token::authority = authority,
    )]
    pub authority_usdc: Box<Account<'info, TokenAccount>>,

    #[account(mut, constraint = authority.key() == vault.authority @ OptionsError::Unauthorized)]
    pub authority: Signer<'info>,

    pub token_program: Program<'info, Token>,
}

pub fn reset_vault(ctx: Context<ResetVault>) -> Result<()> {
    let balance = ctx.accounts.usdc_vault.amount;

    if balance > 0 {
        let authority_key = ctx.accounts.vault.authority;
        let vault_bump = ctx.accounts.vault.bump;
        let seeds: &[&[u8]] = &[b"vault", authority_key.as_ref(), &[vault_bump]];

        token::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from:      ctx.accounts.usdc_vault.to_account_info(),
                    to:        ctx.accounts.authority_usdc.to_account_info(),
                    authority: ctx.accounts.vault.to_account_info(),
                },
                &[seeds],
            ),
            balance,
        )?;
    }

    let vault = &mut ctx.accounts.vault;
    vault.total_collateral  = 0;
    vault.total_vlp_tokens  = 0;
    vault.open_interest     = 0;
    vault.delta_net         = 0;

    msg!("Vault reset: {} USDC returned to authority", balance);
    Ok(())
}

pub fn withdraw_vault(ctx: Context<WithdrawVault>, args: WithdrawVaultArgs) -> Result<()> {
    require!(!ctx.accounts.vault.paused, OptionsError::ProtocolPaused);
    require!(args.vlp_tokens > 0, OptionsError::ZeroLpTokens);

    let vault = &ctx.accounts.vault;
    require!(vault.total_vlp_tokens > 0, OptionsError::InsufficientLiquidity);

    // usdc_out = vlp_tokens * total_collateral / total_vlp_tokens
    let usdc_out = (args.vlp_tokens as u128)
        .checked_mul(vault.total_collateral as u128)
        .ok_or(OptionsError::MathOverflow)?
        .checked_div(vault.total_vlp_tokens as u128)
        .ok_or(OptionsError::DivisionByZero)? as u64;

    require!(usdc_out > 0, OptionsError::InsufficientLiquidity);
    require!(usdc_out >= args.min_usdc_out, OptionsError::SlippageExceeded);
    require!(
        ctx.accounts.usdc_vault.amount >= usdc_out,
        OptionsError::InsufficientCollateral
    );

    // Solvency guard: vault after withdrawal must still cover 120% of OI
    let remaining = ctx.accounts.usdc_vault.amount
        .checked_sub(usdc_out)
        .ok_or(OptionsError::InsufficientCollateral)?;
    let min_required = (vault.open_interest as u128)
        .checked_mul(120)
        .ok_or(OptionsError::MathOverflow)?
        .checked_div(100)
        .ok_or(OptionsError::MathOverflow)? as u64;
    require!(remaining >= min_required, OptionsError::InsufficientCollateral);

    // ── Yield accrual guard ──────────────────────────────────────────────────
    // LP withdraws deposit + REAL fee share (proportional to vLP holdings since last deposit).
    // Floor: guaranteed min APY (1%) even if no fees earned yet.
    let clock = Clock::get()?;
    let max_withdraw = ctx.accounts.lp_position.max_withdrawable(
        vault.fees_collected,
        vault.total_vlp_tokens,
        100, // 1% min APY floor (bps)
        clock.unix_timestamp,
    );
    require!(
        usdc_out <= max_withdraw,
        OptionsError::WithdrawExceedsYield
    );

    // 1. Burn vLP tokens from withdrawer's ATA (withdrawer signs as token owner)
    token::burn(
        CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            Burn {
                mint:      ctx.accounts.vlp_mint.to_account_info(),
                from:      ctx.accounts.withdrawer_vlp.to_account_info(),
                authority: ctx.accounts.withdrawer.to_account_info(),
            },
        ),
        args.vlp_tokens,
    )?;

    // 2. Transfer USDC from vault → withdrawer (vault PDA signs)
    let authority_key = ctx.accounts.vault.authority;
    let vault_bump   = ctx.accounts.vault.bump;
    let seeds: &[&[u8]] = &[b"vault", authority_key.as_ref(), &[vault_bump]];

    token::transfer(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from:      ctx.accounts.usdc_vault.to_account_info(),
                to:        ctx.accounts.withdrawer_usdc.to_account_info(),
                authority: ctx.accounts.vault.to_account_info(),
            },
            &[seeds],
        ),
        usdc_out,
    )?;

    // 3. Update vault totals
    let vault = &mut ctx.accounts.vault;
    vault.total_collateral  = vault.total_collateral.saturating_sub(usdc_out);
    vault.total_vlp_tokens  = vault.total_vlp_tokens.saturating_sub(args.vlp_tokens);

    // 4. Update LP position tracker
    let lp = &mut ctx.accounts.lp_position;
    lp.vlp_tokens = lp.vlp_tokens.saturating_sub(args.vlp_tokens);
    lp.usdc_withdrawn = lp.usdc_withdrawn.saturating_add(usdc_out);

    msg!(
        "Vault withdrawal: vlp_burned={} usdc_out={} remaining_collateral={} lp_withdrawn={}",
        args.vlp_tokens, usdc_out, vault.total_collateral, lp.usdc_withdrawn
    );
    Ok(())
}

// ── Transfer vLP Mint Authority (authority-only) ──────────────────────────────
//
// Temporarily transfers the vLP SPL mint authority from the vault PDA to
// `new_authority`. Used to allow off-chain Metaplex metadata creation, which
// requires the mint authority to sign. Restore immediately after.

#[derive(Accounts)]
pub struct TakeVlpMintAuthority<'info> {
    #[account(
        mut,
        seeds = [b"vault", vault.authority.as_ref()],
        bump = vault.bump,
        constraint = authority.key() == vault.authority @ OptionsError::Unauthorized,
    )]
    pub vault: Box<Account<'info, OptionVault>>,

    #[account(
        mut,
        seeds = [b"vlp_mint", vault.key().as_ref()],
        bump,
        constraint = vlp_mint.key() == vault.vlp_mint @ OptionsError::InvalidUsdcMint,
    )]
    pub vlp_mint: Box<Account<'info, Mint>>,

    /// The new mint authority (typically the admin keypair)
    /// CHECK: arbitrary pubkey; admin is responsible for restoring authority
    pub new_authority: UncheckedAccount<'info>,

    #[account(mut, constraint = authority.key() == vault.authority @ OptionsError::Unauthorized)]
    pub authority: Signer<'info>,

    pub token_program: Program<'info, Token>,
}

pub fn take_vlp_mint_authority(ctx: Context<TakeVlpMintAuthority>) -> Result<()> {
    let vault_key   = ctx.accounts.vault.authority;
    let vault_bump  = ctx.accounts.vault.bump;
    let seeds: &[&[u8]] = &[b"vault", vault_key.as_ref(), &[vault_bump]];

    token::set_authority(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            SetAuthority {
                account_or_mint: ctx.accounts.vlp_mint.to_account_info(),
                current_authority: ctx.accounts.vault.to_account_info(),
            },
            &[seeds],
        ),
        AuthorityType::MintTokens,
        Some(ctx.accounts.new_authority.key()),
    )?;

    msg!(
        "vLP mint authority transferred to: {}",
        ctx.accounts.new_authority.key()
    );
    Ok(())
}

// ── Restore vLP Mint Authority ────────────────────────────────────────────────
//
// Restores the vLP SPL mint authority from the admin keypair back to the
// vault PDA. Must be called after Metaplex metadata creation.

#[derive(Accounts)]
pub struct RestoreVlpMintAuthority<'info> {
    #[account(
        seeds = [b"vault", vault.authority.as_ref()],
        bump = vault.bump,
        constraint = authority.key() == vault.authority @ OptionsError::Unauthorized,
    )]
    pub vault: Box<Account<'info, OptionVault>>,

    #[account(
        mut,
        seeds = [b"vlp_mint", vault.key().as_ref()],
        bump,
        constraint = vlp_mint.key() == vault.vlp_mint @ OptionsError::InvalidUsdcMint,
    )]
    pub vlp_mint: Box<Account<'info, Mint>>,

    #[account(mut, constraint = authority.key() == vault.authority @ OptionsError::Unauthorized)]
    pub authority: Signer<'info>,

    pub token_program: Program<'info, Token>,
}

pub fn restore_vlp_mint_authority(ctx: Context<RestoreVlpMintAuthority>) -> Result<()> {
    // The vault PDA is the canonical mint authority — re-derive its address
    let vault_pda_key = ctx.accounts.vault.key();

    // The authority keypair is the current mint authority and signs directly
    token::set_authority(
        CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            SetAuthority {
                account_or_mint: ctx.accounts.vlp_mint.to_account_info(),
                current_authority: ctx.accounts.authority.to_account_info(),
            },
        ),
        AuthorityType::MintTokens,
        Some(vault_pda_key),
    )?;

    msg!("vLP mint authority restored to vault PDA: {}", vault_pda_key);
    Ok(())
}
