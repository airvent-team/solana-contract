use anchor_lang::prelude::*;

/// Event emitted when IoT device submits data
#[event]
pub struct DataSubmitted {
    /// Device identifier
    pub device_id: String,

    /// Timestamp of submission
    pub timestamp: i64,

    /// PM2.5 air quality measurement in μg/m³ × 10
    /// Example: 35.2 μg/m³ = 352
    /// Precision: 1 decimal place
    pub pm25: u32,

    /// PM10 air quality measurement in μg/m³ × 10
    /// Example: 50.1 μg/m³ = 501
    /// Precision: 1 decimal place
    pub pm10: u32,

    /// Temperature in Celsius × 10
    /// Example: 25.3°C = 253
    /// Precision: 1 decimal place
    pub temperature: i32,

    /// Humidity percentage × 10
    /// Example: 65.5% = 655
    /// Precision: 1 decimal place
    pub humidity: u32,

    /// Reward amount earned for this submission
    pub reward_amount: u64,

    /// Current halving epoch (0, 1, 2, ...)
    pub halving_epoch: u64,

    /// Device owner at time of submission
    pub owner: Pubkey,
}
