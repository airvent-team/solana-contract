use anchor_lang::prelude::*;

pub mod constants;
pub mod errors;
pub mod instructions;
pub mod state;

use instructions::*;

declare_id!("7HjcqvBdLaj6JzH5x3shJcSjaig4SXqwMJGQCbDLyVVB");

#[program]
pub mod airvent_contract {
    use super::*;

    pub fn initialize_token(ctx: Context<InitializeToken>) -> Result<()> {
        instructions::token::initialize_token(ctx)
    }

    pub fn initialize_reward_config(
        ctx: Context<InitializeRewardConfig>,
        initial_reward: u64,
    ) -> Result<()> {
        instructions::reward::initialize_reward_config(ctx, initial_reward)
    }

    pub fn register_device(ctx: Context<RegisterDevice>, device_id: String) -> Result<()> {
        instructions::device::register_device(ctx, device_id)
    }

    pub fn transfer_ownership(ctx: Context<TransferOwnership>, new_owner: Pubkey) -> Result<()> {
        instructions::device::transfer_ownership(ctx, new_owner)
    }

    pub fn deactivate_device(ctx: Context<DeactivateDevice>) -> Result<()> {
        instructions::device::deactivate_device(ctx)
    }

    pub fn submit_data(
        ctx: Context<SubmitData>,
        device_id: String,
        pm25: u32,
        pm10: u32,
        temperature: i32,
        humidity: u32,
    ) -> Result<()> {
        instructions::data::submit_data(ctx, device_id, pm25, pm10, temperature, humidity)
    }

    pub fn get_device_rewards(ctx: Context<GetDeviceRewards>) -> Result<u64> {
        instructions::reward::get_device_rewards(ctx)
    }

    pub fn claim_rewards(ctx: Context<ClaimRewards>, device_id: String) -> Result<()> {
        instructions::reward::claim_rewards(ctx, device_id)
    }
}
