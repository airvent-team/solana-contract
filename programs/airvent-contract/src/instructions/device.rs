use anchor_lang::prelude::*;
use crate::{constants::MAX_DEVICE_ID_LEN, errors::ErrorCode, state::{DeviceRegistry, DeviceRewards}};

/// Register a new IoT device with an owner
/// device_id: Unique identifier for the device (e.g., serial number)
pub fn register_device(ctx: Context<RegisterDevice>, device_id: String) -> Result<()> {
    require!(
        device_id.len() <= MAX_DEVICE_ID_LEN,
        ErrorCode::DeviceIdTooLong
    );
    require!(!device_id.is_empty(), ErrorCode::DeviceIdEmpty);

    let device = &mut ctx.accounts.device;
    device.device_id = device_id.clone();
    device.owner = ctx.accounts.owner.key();
    device.registered_at = Clock::get()?.unix_timestamp;
    device.is_active = true;

    // Initialize device rewards account
    let device_rewards = &mut ctx.accounts.device_rewards;
    device_rewards.device_id = device_id.clone();
    device_rewards.owner = ctx.accounts.owner.key();
    device_rewards.total_data_submitted = 0;
    device_rewards.last_submission = 0;

    msg!("Device registered: {} -> {}", device_id, ctx.accounts.owner.key());
    Ok(())
}

/// Transfer device ownership to a new owner
/// Only the current owner can transfer ownership
pub fn transfer_ownership(
    ctx: Context<TransferOwnership>,
    new_owner: Pubkey,
) -> Result<()> {
    let device = &mut ctx.accounts.device;
    let device_rewards = &mut ctx.accounts.device_rewards;

    msg!(
        "Device {} ownership transferred: {} -> {}",
        device.device_id,
        device.owner,
        new_owner
    );

    device.owner = new_owner;
    device_rewards.owner = new_owner;
    Ok(())
}

/// Deactivate a device (only owner can deactivate)
pub fn deactivate_device(ctx: Context<DeactivateDevice>) -> Result<()> {
    let device = &mut ctx.accounts.device;
    device.is_active = false;

    msg!("Device {} deactivated", device.device_id);
    Ok(())
}

#[derive(Accounts)]
#[instruction(device_id: String)]
pub struct RegisterDevice<'info> {
    /// Device account to be created
    /// PDA seeded with device_id
    #[account(
        init,
        payer = owner,
        space = 8 + DeviceRegistry::INIT_SPACE,
        seeds = [b"device", device_id.as_bytes()],
        bump
    )]
    pub device: Account<'info, DeviceRegistry>,

    /// Device rewards account - created together with device
    #[account(
        init,
        payer = owner,
        space = 8 + DeviceRewards::INIT_SPACE,
        seeds = [b"device_rewards", device_id.as_bytes()],
        bump
    )]
    pub device_rewards: Account<'info, DeviceRewards>,

    /// Owner of the device
    #[account(mut)]
    pub owner: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(new_owner: Pubkey)]
pub struct TransferOwnership<'info> {
    /// Device account
    #[account(
        mut,
        has_one = owner @ ErrorCode::Unauthorized
    )]
    pub device: Account<'info, DeviceRegistry>,

    /// Device rewards account
    #[account(
        mut,
        seeds = [b"device_rewards", device.device_id.as_bytes()],
        bump
    )]
    pub device_rewards: Account<'info, DeviceRewards>,

    /// Current owner (must sign)
    pub owner: Signer<'info>,
}

#[derive(Accounts)]
pub struct DeactivateDevice<'info> {
    /// Device account
    #[account(
        mut,
        has_one = owner @ ErrorCode::Unauthorized
    )]
    pub device: Account<'info, DeviceRegistry>,

    /// Current owner (must sign)
    pub owner: Signer<'info>,
}
