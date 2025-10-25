use anchor_lang::prelude::*;
use crate::{
    constants::HALVING_INTERVAL_SECONDS,
    errors::ErrorCode,
    state::{DeviceRegistry, DeviceRewards, RewardConfig},
};

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

#[derive(Accounts)]
#[instruction(device_id: String)]
pub struct SubmitData<'info> {
    /// Device that is submitting data
    #[account(
        seeds = [b"device", device_id.as_bytes()],
        bump
    )]
    pub device: Account<'info, DeviceRegistry>,

    /// Device rewards account - must be already initialized during registration
    #[account(
        mut,
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

    /// Server that submits data
    pub server: Signer<'info>,
}
