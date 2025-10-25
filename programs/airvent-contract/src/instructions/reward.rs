use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount};
use crate::{
    constants::HALVING_INTERVAL_SECONDS,
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

/// Submit IoT data and accumulate rewards
/// Server calls this when device sends data
pub fn submit_data(
    ctx: Context<SubmitData>,
    device_id: String,
    pm25: u16,
    pm10: u16,
) -> Result<()> {
    let device = &ctx.accounts.device;
    let config = &mut ctx.accounts.reward_config;
    let device_rewards = &mut ctx.accounts.device_rewards;
    let current_time = Clock::get()?.unix_timestamp;

    // Verify device is active
    require!(device.is_active, ErrorCode::DeviceNotActive);

    // Initialize device rewards if this is first submission
    if device_rewards.device_id.is_empty() {
        device_rewards.device_id = device_id.clone();
        device_rewards.owner = device.owner;
        device_rewards.accumulated_points = 0;
        device_rewards.total_data_submitted = 0;
        device_rewards.last_submission = 0;
    }

    // Calculate current reward based on time-based halving (4 years)
    let time_elapsed = current_time - config.start_timestamp;
    let halving_count = time_elapsed / HALVING_INTERVAL_SECONDS;
    let current_reward = config.initial_reward / (2_u64.pow(halving_count as u32));

    // Accumulate rewards for device
    device_rewards.accumulated_points += current_reward;
    device_rewards.total_data_submitted += 1;
    device_rewards.last_submission = current_time;
    device_rewards.owner = device.owner; // Update owner in case of transfer

    // Update global stats
    config.total_data_submitted += 1;
    config.total_rewards_distributed += current_reward;

    msg!(
        "Data submitted - Device: {}, PM2.5: {}, PM10: {}, Reward: {} AIR (halving epoch: {})",
        device_id,
        pm25,
        pm10,
        current_reward,
        halving_count
    );

    Ok(())
}

/// Check accumulated rewards for a device
pub fn get_device_rewards(ctx: Context<GetDeviceRewards>) -> Result<u64> {
    Ok(ctx.accounts.device_rewards.accumulated_points)
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
pub struct SubmitData<'info> {
    /// Device that is submitting data
    #[account(
        seeds = [b"device", device_id.as_bytes()],
        bump
    )]
    pub device: Account<'info, DeviceRegistry>,

    /// Device rewards account - rewards tied to device, not user
    #[account(
        init_if_needed,
        payer = server,
        space = 8 + DeviceRewards::INIT_SPACE,
        seeds = [b"device_rewards", device_id.as_bytes()],
        bump
    )]
    pub device_rewards: Account<'info, DeviceRewards>,

    /// Global reward config
    #[account(
        mut,
        seeds = [b"reward_config"],
        bump
    )]
    pub reward_config: Account<'info, RewardConfig>,

    /// Server that submits data (pays for account creation)
    #[account(mut)]
    pub server: Signer<'info>,

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
