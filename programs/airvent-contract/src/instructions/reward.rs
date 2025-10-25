use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount};
use crate::{
    errors::ErrorCode,
    state::{DeviceRegistry, DeviceRewards, RewardConfig},
};

/// Initialize reward configuration (one-time setup)
pub fn initialize_reward_config(
    ctx: Context<InitializeRewardConfig>,
    initial_reward: u64,
) -> Result<()> {
    let config = &mut ctx.accounts.reward_config;
    config.authority = ctx.accounts.authority.key();
    config.initial_reward = initial_reward;
    config.start_timestamp = Clock::get()?.unix_timestamp;
    config.total_data_submitted = 0;
    config.total_rewards_distributed = 0;

    msg!(
        "Reward config initialized: {} AIR per data, halving every 4 years",
        initial_reward
    );
    Ok(())
}

/// Claim accumulated rewards and receive AIR tokens
/// Only device owner can claim
pub fn claim_rewards(ctx: Context<ClaimRewards>, device_id: String) -> Result<()> {
    let device_rewards = &mut ctx.accounts.device_rewards;
    let amount_to_claim = device_rewards.accumulated_points;

    // Check if there are rewards to claim
    require!(amount_to_claim > 0, ErrorCode::NoRewardsToClaim);

    // Transfer tokens from treasury to owner
    token::transfer(
        CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            token::Transfer {
                from: ctx.accounts.treasury.to_account_info(),
                to: ctx.accounts.owner_token_account.to_account_info(),
                authority: ctx.accounts.treasury_authority.to_account_info(),
            },
        ),
        amount_to_claim,
    )?;

    // Reset accumulated points
    device_rewards.accumulated_points = 0;

    msg!(
        "Claimed {} AIR tokens for device: {}",
        amount_to_claim,
        device_id
    );

    Ok(())
}

/// Check accumulated rewards for a device
pub fn get_device_rewards(ctx: Context<GetDeviceRewards>) -> Result<u64> {
    Ok(ctx.accounts.device_rewards.accumulated_points)
}

#[derive(Accounts)]
pub struct InitializeRewardConfig<'info> {
    #[account(
        init,
        payer = authority,
        space = 8 + RewardConfig::INIT_SPACE,
        seeds = [b"reward_config"],
        bump
    )]
    pub reward_config: Account<'info, RewardConfig>,

    #[account(mut)]
    pub authority: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(device_id: String)]
pub struct GetDeviceRewards<'info> {
    /// Device rewards account
    #[account(
        seeds = [b"device_rewards", device_id.as_bytes()],
        bump
    )]
    pub device_rewards: Account<'info, DeviceRewards>,

    /// Device registry to verify ownership
    #[account(
        seeds = [b"device", device_id.as_bytes()],
        bump
    )]
    pub device: Account<'info, DeviceRegistry>,
}

#[derive(Accounts)]
#[instruction(device_id: String)]
pub struct ClaimRewards<'info> {
    /// Device that has accumulated rewards
    #[account(
        seeds = [b"device", device_id.as_bytes()],
        bump,
        has_one = owner @ ErrorCode::Unauthorized
    )]
    pub device: Account<'info, DeviceRegistry>,

    /// Device rewards account
    #[account(
        mut,
        seeds = [b"device_rewards", device_id.as_bytes()],
        bump
    )]
    pub device_rewards: Account<'info, DeviceRewards>,

    /// Treasury that holds the tokens
    #[account(mut)]
    pub treasury: Account<'info, TokenAccount>,

    /// Owner's token account to receive rewards
    #[account(mut)]
    pub owner_token_account: Account<'info, TokenAccount>,

    /// Treasury authority that signs the transfer
    pub treasury_authority: Signer<'info>,

    /// Device owner (must be signer to claim)
    pub owner: Signer<'info>,

    pub token_program: Program<'info, Token>,
}
