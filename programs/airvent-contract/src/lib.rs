use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token::{self, Mint, Token, TokenAccount, MintTo, Transfer},
};

declare_id!("DaWa9EjUZc92NuAGeDd4sKZGFttGptREoAWGwxRtxoXi");

/// Total supply: 1 billion AIR tokens (with 9 decimals)
pub const TOTAL_SUPPLY: u64 = 1_000_000_000 * 1_000_000_000;

#[program]
pub mod airvent_contract {
    use super::*;

    /// Initialize AIR token and mint total supply to treasury
    /// This can only be called once
    pub fn initialize_token(ctx: Context<InitializeToken>) -> Result<()> {
        // Mint total supply to treasury
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

        msg!("AIR Token initialized: {} total supply minted to treasury", TOTAL_SUPPLY);
        msg!("Mint authority removed - no more tokens can be minted");
        Ok(())
    }

    /// Transfer AIR tokens from treasury or user accounts
    /// Used for reward distribution when users claim
    pub fn transfer_tokens(ctx: Context<TransferTokens>, amount: u64) -> Result<()> {
        token::transfer(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.from.to_account_info(),
                    to: ctx.accounts.to.to_account_info(),
                    authority: ctx.accounts.authority.to_account_info(),
                },
            ),
            amount,
        )?;
        msg!("Transferred {} AIR tokens", amount);
        Ok(())
    }
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

    /// Treasury token account that will hold the total supply
    /// Created as an Associated Token Account
    #[account(
        init,
        payer = payer,
        associated_token::mint = mint,
        associated_token::authority = treasury_authority,
    )]
    pub treasury: Account<'info, TokenAccount>,

    /// CHECK: Treasury authority (wallet that controls the treasury)
    pub treasury_authority: AccountInfo<'info>,

    /// Mint authority (will be revoked after initial mint)
    pub mint_authority: Signer<'info>,

    #[account(mut)]
    pub payer: Signer<'info>,

    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
pub struct TransferTokens<'info> {
    /// Source token account (treasury or user wallet)
    #[account(mut)]
    pub from: Account<'info, TokenAccount>,

    /// Destination token account (user wallet)
    #[account(mut)]
    pub to: Account<'info, TokenAccount>,

    /// Authority of the source account
    pub authority: Signer<'info>,

    pub token_program: Program<'info, Token>,
}
