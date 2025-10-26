use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount};
use crate::{
    constants::HALVING_INTERVAL_SECONDS,
    errors::ErrorCode,
    state::{DeviceRegistry, DeviceRewards, RewardConfig, DataSubmitted},
};

/// Submit IoT data and automatically distribute rewards
/// Server calls this when device sends data
pub fn submit_data(
    ctx: Context<SubmitData>,
    device_id: String,
    pm25: u32,        // μg/m³ × 10 (e.g., 35.2 μg/m³ = 352)
    pm10: u32,        // μg/m³ × 10 (e.g., 50.1 μg/m³ = 501)
    temperature: i32, // Celsius × 10 (e.g., 25.3°C = 253)
    humidity: u32,    // Percentage × 10 (e.g., 65.5% = 655)
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

    // Transfer tokens immediately to owner (automatic distribution)
    // Use PDA signer
    let seeds = &[b"treasury".as_ref(), &[ctx.bumps.treasury]];
    let signer_seeds = &[&seeds[..]];

    token::transfer(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            token::Transfer {
                from: ctx.accounts.treasury.to_account_info(),
                to: ctx.accounts.owner_token_account.to_account_info(),
                authority: ctx.accounts.treasury.to_account_info(),
            },
            signer_seeds,
        ),
        current_reward,
    )?;

    // Update device stats
    device_rewards.total_data_submitted += 1;
    device_rewards.last_submission = current_time;
    device_rewards.owner = device.owner; // Update owner in case of transfer

    // Update global stats
    config.total_data_submitted += 1;
    config.total_rewards_distributed += current_reward;

    msg!(
        "Data submitted - Device: {}, PM2.5: {:.1} μg/m³, PM10: {:.1} μg/m³, Temp: {:.1}°C, Humidity: {:.1}%, Reward: {} AIR (halving epoch: {}) - AUTO-DISTRIBUTED",
        device_id,
        pm25 as f64 / 10.0,
        pm10 as f64 / 10.0,
        temperature as f64 / 10.0,
        humidity as f64 / 10.0,
        current_reward,
        halving_count
    );

    // Emit event for permanent on-chain storage
    emit!(DataSubmitted {
        device_id: device_id.clone(),
        timestamp: current_time,
        pm25,
        pm10,
        temperature,
        humidity,
        reward_amount: current_reward,
        halving_epoch: halving_count as u64,
        owner: device.owner,
    });

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
        bump,
    )]
    pub reward_config: Account<'info, RewardConfig>,

    /// Treasury PDA that holds the tokens
    #[account(
        mut,
        seeds = [b"treasury"],
        bump,
    )]
    pub treasury: Account<'info, TokenAccount>,

    /// Owner's token account to receive rewards (auto-distributed)
    #[account(
        mut,
        constraint = owner_token_account.mint == treasury.mint @ ErrorCode::InvalidMint,
        constraint = owner_token_account.owner == device.owner @ ErrorCode::InvalidOwner,
    )]
    pub owner_token_account: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
}
