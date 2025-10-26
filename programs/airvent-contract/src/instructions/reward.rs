use anchor_lang::prelude::*;
use crate::state::RewardConfig;

/// Initialize reward configuration (one-time setup)
pub fn initialize_reward_config(
    ctx: Context<InitializeRewardConfig>,
    initial_reward: u64,
) -> Result<()> {
    let config = &mut ctx.accounts.reward_config;
    config.authority = ctx.accounts.authority.key();
    config.initial_reward = initial_reward;
    config.start_timestamp = Clock::get()?.unix_timestamp;
    config.total_data_submitted = 0;
    config.total_rewards_distributed = 0;

    msg!(
        "Reward config initialized: {} AIR per data, halving every 4 years, AUTO-DISTRIBUTION enabled",
        initial_reward
    );
    Ok(())
}

#[derive(Accounts)]
pub struct InitializeRewardConfig<'info> {
    #[account(
        init,
        payer = authority,
        space = 8 + RewardConfig::INIT_SPACE,
        seeds = [b"reward_config"],
        bump
    )]
    pub reward_config: Account<'info, RewardConfig>,

    #[account(mut)]
    pub authority: Signer<'info>,

    pub system_program: Program<'info, System>,
}
