use anchor_lang::prelude::*;

/// Global reward configuration with halving mechanism
#[account]
#[derive(InitSpace)]
pub struct RewardConfig {
    /// Authority that can modify config
    pub authority: Pubkey,

    /// Initial reward per data submission (in smallest units)
    pub initial_reward: u64,

    /// Timestamp when reward system started (for time-based halving)
    pub start_timestamp: i64,

    /// Total data submissions across all devices (statistics)
    pub total_data_submitted: u64,

    /// Total rewards distributed (in points, not claimed tokens)
    pub total_rewards_distributed: u64,
}

/// Device's accumulated rewards
/// Rewards are tied to device, not user
/// When device ownership changes, rewards go with the device
#[account]
#[derive(InitSpace)]
pub struct DeviceRewards {
    /// Device ID this reward account belongs to
    #[max_len(32)]
    pub device_id: String,

    /// Current owner of the device (updated on ownership transfer)
    pub owner: Pubkey,

    /// Accumulated reward points (not yet claimed)
    pub accumulated_points: u64,

    /// Total data submissions by this device
    pub total_data_submitted: u64,

    /// Last submission timestamp
    pub last_submission: i64,
}
