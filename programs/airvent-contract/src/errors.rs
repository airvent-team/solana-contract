use anchor_lang::prelude::*;

#[error_code]
pub enum ErrorCode {
    #[msg("Device ID is too long (max 32 characters)")]
    DeviceIdTooLong,

    #[msg("Device ID cannot be empty")]
    DeviceIdEmpty,

    #[msg("Unauthorized: You are not the owner of this device")]
    Unauthorized,

    #[msg("Device is not active")]
    DeviceNotActive,
}
