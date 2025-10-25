use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token::{self, Mint, Token, TokenAccount, MintTo, Transfer},
};

declare_id!("DaWa9EjUZc92NuAGeDd4sKZGFttGptREoAWGwxRtxoXi");

/// Total supply: 1 billion AIR tokens (with 9 decimals)
pub const TOTAL_SUPPLY: u64 = 1_000_000_000 * 1_000_000_000;

/// Maximum device ID length (32 bytes for hash-like IDs)
pub const MAX_DEVICE_ID_LEN: usize = 32;

/// Halving interval: 4 years in seconds (like Bitcoin)
pub const HALVING_INTERVAL_SECONDS: i64 = 4 * 365 * 24 * 60 * 60; // ~126M seconds

#[program]
pub mod airvent_contract {
    use super::*;

    /// Initialize AIR token and mint total supply to treasury
    /// This can only be called once
    pub fn initialize_token(ctx: Context<InitializeToken>) -> Result<()> {
        // Mint total supply to treasury
        token::mint_to(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                MintTo {
                    mint: ctx.accounts.mint.to_account_info(),
                    to: ctx.accounts.treasury.to_account_info(),
                    authority: ctx.accounts.mint_authority.to_account_info(),
                },
            ),
            TOTAL_SUPPLY,
        )?;

        // Remove mint authority to prevent further minting
        token::set_authority(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                token::SetAuthority {
                    current_authority: ctx.accounts.mint_authority.to_account_info(),
                    account_or_mint: ctx.accounts.mint.to_account_info(),
                },
            ),
            token::spl_token::instruction::AuthorityType::MintTokens,
            None,
        )?;

        msg!("AIR Token initialized: {} total supply minted to treasury", TOTAL_SUPPLY);
        msg!("Mint authority removed - no more tokens can be minted");
        Ok(())
    }

    /// Transfer AIR tokens from treasury or user accounts
    /// Used for reward distribution when users claim
    pub fn transfer_tokens(ctx: Context<TransferTokens>, amount: u64) -> Result<()> {
        token::transfer(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.from.to_account_info(),
                    to: ctx.accounts.to.to_account_info(),
                    authority: ctx.accounts.authority.to_account_info(),
                },
            ),
            amount,
        )?;
        msg!("Transferred {} AIR tokens", amount);
        Ok(())
    }

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

        msg!(
            "Device {} ownership transferred: {} -> {}",
            device.device_id,
            device.owner,
            new_owner
        );

        device.owner = new_owner;
        Ok(())
    }

    /// Deactivate a device (only owner can deactivate)
    pub fn deactivate_device(ctx: Context<DeactivateDevice>) -> Result<()> {
        let device = &mut ctx.accounts.device;
        device.is_active = false;

        msg!("Device {} deactivated", device.device_id);
        Ok(())
    }

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
            "Reward config initialized: {} AIR per data, halving every 4 years",
            initial_reward
        );
        Ok(())
    }

    /// Submit IoT data and accumulate rewards
    /// Server calls this when device sends data
    pub fn submit_data(
        ctx: Context<SubmitData>,
        device_id: String,
        pm25: u16,
        pm10: u16,
    ) -> Result<()> {
        let device = &ctx.accounts.device;
        let config = &mut ctx.accounts.reward_config;
        let device_rewards = &mut ctx.accounts.device_rewards;
        let current_time = Clock::get()?.unix_timestamp;

        // Verify device is active
        require!(device.is_active, ErrorCode::DeviceNotActive);

        // Initialize device rewards if this is first submission
        if device_rewards.device_id.is_empty() {
            device_rewards.device_id = device_id.clone();
            device_rewards.owner = device.owner;
            device_rewards.accumulated_points = 0;
            device_rewards.total_data_submitted = 0;
            device_rewards.last_submission = 0;
        }

        // Calculate current reward based on time-based halving (4 years)
        let time_elapsed = current_time - config.start_timestamp;
        let halving_count = time_elapsed / HALVING_INTERVAL_SECONDS;
        let current_reward = config.initial_reward / (2_u64.pow(halving_count as u32));

        // Accumulate rewards for device
        device_rewards.accumulated_points += current_reward;
        device_rewards.total_data_submitted += 1;
        device_rewards.last_submission = current_time;
        device_rewards.owner = device.owner; // Update owner in case of transfer

        // Update global stats
        config.total_data_submitted += 1;
        config.total_rewards_distributed += current_reward;

        msg!(
            "Data submitted - Device: {}, PM2.5: {}, PM10: {}, Reward: {} AIR (halving epoch: {})",
            device_id,
            pm25,
            pm10,
            current_reward,
            halving_count
        );

        Ok(())
    }

    /// Check accumulated rewards for a device
    pub fn get_device_rewards(ctx: Context<GetDeviceRewards>) -> Result<u64> {
        Ok(ctx.accounts.device_rewards.accumulated_points)
    }
}

#[derive(Accounts)]
pub struct InitializeToken<'info> {
    /// The AIR token mint account
    #[account(
        init,
        payer = payer,
        mint::decimals = 9,
        mint::authority = mint_authority,
    )]
    pub mint: Account<'info, Mint>,

    /// Treasury token account that will hold the total supply
    /// Created as an Associated Token Account
    #[account(
        init,
        payer = payer,
        associated_token::mint = mint,
        associated_token::authority = treasury_authority,
    )]
    pub treasury: Account<'info, TokenAccount>,

    /// CHECK: Treasury authority (wallet that controls the treasury)
    pub treasury_authority: AccountInfo<'info>,

    /// Mint authority (will be revoked after initial mint)
    pub mint_authority: Signer<'info>,

    #[account(mut)]
    pub payer: Signer<'info>,

    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
pub struct TransferTokens<'info> {
    /// Source token account (treasury or user wallet)
    #[account(mut)]
    pub from: Account<'info, TokenAccount>,

    /// Destination token account (user wallet)
    #[account(mut)]
    pub to: Account<'info, TokenAccount>,

    /// Authority of the source account
    pub authority: Signer<'info>,

    pub token_program: Program<'info, Token>,
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

    /// Owner of the device
    #[account(mut)]
    pub owner: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct TransferOwnership<'info> {
    /// Device account
    #[account(
        mut,
        has_one = owner @ ErrorCode::Unauthorized
    )]
    pub device: Account<'info, DeviceRegistry>,

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

#[derive(Accounts)]
#[instruction(device_id: String)]
pub struct SubmitData<'info> {
    /// Device that is submitting data
    #[account(
        seeds = [b"device", device_id.as_bytes()],
        bump
    )]
    pub device: Account<'info, DeviceRegistry>,

    /// Device rewards account - rewards tied to device, not user
    #[account(
        init_if_needed,
        payer = server,
        space = 8 + DeviceRewards::INIT_SPACE,
        seeds = [b"device_rewards", device_id.as_bytes()],
        bump
    )]
    pub device_rewards: Account<'info, DeviceRewards>,

    /// Global reward config
    #[account(
        mut,
        seeds = [b"reward_config"],
        bump
    )]
    pub reward_config: Account<'info, RewardConfig>,

    /// Server that submits data (pays for account creation)
    #[account(mut)]
    pub server: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(device_id: String)]
pub struct GetDeviceRewards<'info> {
    /// Device rewards account
    #[account(
        seeds = [b"device_rewards", device_id.as_bytes()],
        bump
    )]
    pub device_rewards: Account<'info, DeviceRewards>,

    /// Device registry to verify ownership
    #[account(
        seeds = [b"device", device_id.as_bytes()],
        bump
    )]
    pub device: Account<'info, DeviceRegistry>,
}

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
