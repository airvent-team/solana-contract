use anchor_lang::prelude::*;

/// Global reward configuration with halving mechanism
#[account]
#[derive(InitSpace)]
pub struct RewardConfig {
    /// Authority that can modify config (treasury authority)
    pub authority: Pubkey,

    /// Official AIR token mint (fixed)
    pub mint: Pubkey,

    /// Treasury token account (fixed)
    pub treasury: Pubkey,

    /// Initial reward per data submission (in smallest units)
    pub initial_reward: u64,

    /// Timestamp when reward system started (for time-based halving)
    pub start_timestamp: i64,

    /// Total data submissions across all devices (statistics)
    pub total_data_submitted: u64,

    /// Total rewards distributed (in tokens, automatically)
    pub total_rewards_distributed: u64,
}

/// Device's reward statistics
/// Rewards are automatically distributed on each data submission
#[account]
#[derive(InitSpace)]
pub struct DeviceRewards {
    /// Device ID this reward account belongs to
    #[max_len(32)]
    pub device_id: String,

    /// Current owner of the device (updated on ownership transfer)
    pub owner: Pubkey,

    /// Total data submissions by this device
    pub total_data_submitted: u64,

    /// Last submission timestamp
    pub last_submission: i64,
}
