use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, Token, TokenAccount, MintTo};
use crate::constants::TOTAL_SUPPLY;

/// Initialize AIR token and mint total supply to treasury
/// This can only be called once
pub fn initialize_token(ctx: Context<InitializeToken>) -> Result<()> {
    // Mint total supply to treasury (PDA)
    token::mint_to(
        CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            MintTo {
                mint: ctx.accounts.mint.to_account_info(),
                to: ctx.accounts.treasury.to_account_info(),
                authority: ctx.accounts.mint_authority.to_account_info(),
            },
        ),
        TOTAL_SUPPLY,
    )?;

    // Remove mint authority to prevent further minting
    token::set_authority(
        CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            token::SetAuthority {
                current_authority: ctx.accounts.mint_authority.to_account_info(),
                account_or_mint: ctx.accounts.mint.to_account_info(),
            },
        ),
        token::spl_token::instruction::AuthorityType::MintTokens,
        None,
    )?;

    msg!("AIR Token initialized: {} total supply minted to treasury PDA", TOTAL_SUPPLY);
    msg!("Mint authority removed - no more tokens can be minted");
    Ok(())
}

#[derive(Accounts)]
pub struct InitializeToken<'info> {
    /// The AIR token mint account
    #[account(
        init,
        payer = payer,
        mint::decimals = 9,
        mint::authority = mint_authority,
    )]
    pub mint: Account<'info, Mint>,

    /// Treasury token account (PDA) that will hold the total supply
    #[account(
        init,
        payer = payer,
        seeds = [b"treasury"],
        bump,
        token::mint = mint,
        token::authority = treasury,
    )]
    pub treasury: Account<'info, TokenAccount>,

    /// Mint authority (will be revoked after initial mint)
    pub mint_authority: Signer<'info>,

    #[account(mut)]
    pub payer: Signer<'info>,

    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
    pub rent: Sysvar<'info, Rent>,
}
