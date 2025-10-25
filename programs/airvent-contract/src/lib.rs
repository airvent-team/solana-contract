use anchor_lang::prelude::*;

pub mod constants;
pub mod errors;
pub mod state;
pub mod instructions;

use instructions::*;

declare_id!("DaWa9EjUZc92NuAGeDd4sKZGFttGptREoAWGwxRtxoXi");

#[program]
pub mod airvent_contract {
    use super::*;

    pub fn initialize_token(ctx: Context<InitializeToken>) -> Result<()> {
        instructions::token::initialize_token(ctx)
    }

    pub fn register_device(ctx: Context<RegisterDevice>, device_id: String) -> Result<()> {
        instructions::device::register_device(ctx, device_id)
    }

    pub fn transfer_ownership(
        ctx: Context<TransferOwnership>,
        new_owner: Pubkey,
    ) -> Result<()> {
        instructions::device::transfer_ownership(ctx, new_owner)
    }

    pub fn deactivate_device(ctx: Context<DeactivateDevice>) -> Result<()> {
        instructions::device::deactivate_device(ctx)
    }

    pub fn initialize_reward_config(
        ctx: Context<InitializeRewardConfig>,
        initial_reward: u64,
    ) -> Result<()> {
        instructions::reward::initialize_reward_config(ctx, initial_reward)
    }

    pub fn submit_data(
        ctx: Context<SubmitData>,
        device_id: String,
        pm25: u16,
        pm10: u16,
    ) -> Result<()> {
        instructions::reward::submit_data(ctx, device_id, pm25, pm10)
    }

    pub fn get_device_rewards(ctx: Context<GetDeviceRewards>) -> Result<u64> {
        instructions::reward::get_device_rewards(ctx)
    }

    pub fn claim_rewards(ctx: Context<ClaimRewards>, device_id: String) -> Result<()> {
        instructions::reward::claim_rewards(ctx, device_id)
    }
}
