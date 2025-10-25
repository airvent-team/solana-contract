use anchor_lang::prelude::*;

/// Event emitted when IoT device submits data
#[event]
pub struct DataSubmitted {
    /// Device identifier
    pub device_id: String,

    /// Timestamp of submission
    pub timestamp: i64,

    /// PM2.5 air quality measurement
    pub pm25: u16,

    /// PM10 air quality measurement
    pub pm10: u16,

    /// Reward amount earned for this submission
    pub reward_amount: u64,

    /// Current halving epoch (0, 1, 2, ...)
    pub halving_epoch: u64,

    /// Device owner at time of submission
    pub owner: Pubkey,
}
