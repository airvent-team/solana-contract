use anchor_lang::prelude::*;

/// Device Registry Account
/// Stores information about a registered IoT device
#[account]
#[derive(InitSpace)]
pub struct DeviceRegistry {
    /// Unique device identifier (e.g., serial number)
    #[max_len(32)]
    pub device_id: String,

    /// Owner's wallet address
    pub owner: Pubkey,

    /// Timestamp when device was registered
    pub registered_at: i64,

    /// Whether the device is currently active
    pub is_active: bool,
}
