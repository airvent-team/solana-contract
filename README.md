# Airvent Contract - IoT Reward System

A Solana smart contract that **automatically distributes AIR token rewards** when collecting air quality data from IoT devices.

## Related Projects

This contract is part of the Airvent ecosystem. Check out the other components:

- **[SolanaDataLibrary](https://github.com/airvent-team/SolanaDataLibrary)** - .NET library for IoT device data management using the Solana blockchain. Provides functionality to securely store sensor data on-chain and manage device registration.

- **[SolanaDeviceRegistrationWPF](https://github.com/airvent-team/SolanaDeviceRegistrationWPF)** - Desktop application for IoT device management. Collects real-time data from air quality sensors (PM2008) and records it on Solana DevNet, enabling transparent and tamper-proof data management.


## Key Features

- **Fixed Supply**: 1 billion AIR tokens (Mint Authority permanently removed)
- **Automatic Instant Distribution**: Rewards automatically transferred upon data submission (no manual claiming required)
- **4-Year Halving**: Bitcoin-like time-based halving mechanism
- **Treasury Distribution**: Pre-minted tokens distributed from Treasury
- **Multi-Sensor Data**: Collects PM2.5, PM10, temperature, and humidity data
- **Event Logging**: IoT data permanently stored on-chain (queryable via Helius/Triton indexers)

## Deployed Contract Information

### Devnet Deployment

#### 🔑 Fixed Addresses (Immutable)
These addresses remain constant for the lifetime of the program:

- **Program ID**: [`B4m1ENS6SWV3H6mZkJ2VFkBKawqYe7atH4AjXoc4NZzR`](https://solscan.io/account/B4m1ENS6SWV3H6mZkJ2VFkBKawqYe7atH4AjXoc4NZzR?cluster=devnet)
- **Treasury PDA**: [`B4YbNirNnbayYmhxbhEpFvHPBFukVLCnxHHxmaeuu3u`](https://solscan.io/account/B4YbNirNnbayYmhxbhEpFvHPBFukVLCnxHHxmaeuu3u?cluster=devnet)
- **RewardConfig**: [`CFkj9K4gmtAnSBAETivan76gnuhv5oohytCKd7PqPvSy`](https://solscan.io/account/CFkj9K4gmtAnSBAETivan76gnuhv5oohytCKd7PqPvSy?cluster=devnet)

#### 🪙 Token Information

- **Mint Address**: [`BXV4ewBjMB1qmXjU3bc14SfXHQbseFhRy5xE4RtHtvsL`](https://solscan.io/token/BXV4ewBjMB1qmXjU3bc14SfXHQbseFhRy5xE4RtHtvsL?cluster=devnet)
- **Total Supply**: 1,000,000,000 AIR
- **Decimals**: 9
- **Initial Reward**: 0.1 AIR per submission
- **Halving Period**: Every 4 years
- **Network**: Devnet

#### 📊 Contract Status

- ✅ Treasury PDA holds all 1B AIR tokens
- ✅ Mint authority permanently revoked (no additional minting possible)
- ✅ Rewards automatically distributed on data submission
- ✅ Treasury controlled by program (PDA signer)

## Architecture

### Module Structure

```
programs/airvent-contract/src/
├── lib.rs                    # Main entry point
├── constants.rs              # Constants definition
├── errors.rs                 # Error definitions
├── state/
│   ├── device.rs            # DeviceRegistry
│   ├── reward.rs            # RewardConfig, DeviceRewards
│   └── events.rs            # DataSubmitted (Event definition)
└── instructions/
    ├── token.rs             # Token initialization
    ├── device.rs            # Device management
    ├── data.rs              # Data submission + automatic reward transfer
    └── reward.rs            # Reward configuration management
```

### Main Account Structures

- **DeviceRegistry**: Device information (device_id, owner, registered_at, is_active)
- **RewardConfig**: Global reward settings (initial_reward, start_timestamp, total_rewards_distributed)
- **DeviceRewards**: Per-device statistics (device_id, owner, total_data_submitted, last_submission)

### Events

- **DataSubmitted**: IoT data submission event
  - Fields: device_id, pm25, pm10, temperature, humidity, reward_amount, halving_epoch, owner, timestamp
  - Permanently stored in Solana program logs
  - Queryable via indexers like Helius/Triton

## Deployment Guide

### Quick Start (Localnet)

```bash
anchor localnet # Start localnet

anchor build
anchor deploy
anchor migrate
```

### Using Deployed Scripts

All scripts automatically detect and use your Solana CLI configuration:

```bash
# Set network (scripts will auto-detect this)
solana config set --url devnet

# Register a device
yarn ts-node scripts/register-device.ts my-device-001

# Submit sensor data (auto-distributes rewards)
yarn ts-node scripts/submit-data.ts my-device-001 352 501 253 655
# PM2.5: 35.2 μg/m³, PM10: 50.1 μg/m³, Temp: 25.3°C, Humidity: 65.5%

# Transfer device ownership
yarn ts-node scripts/transfer-ownership.ts my-device-001 <new_owner_pubkey>
```

**Network Auto-Detection:**
- Scripts automatically read `~/.config/solana/cli/config.yml`
- No need to specify `--url` - just use `solana config set --url <network>`
- Supports: localnet, devnet, testnet, mainnet-beta

**Detailed Guides:**
- **[DEPLOYMENT.md](./docs/DEPLOYMENT.md)** - Network switching, Anchor commands, full deployment process, troubleshooting
- **[SCRIPTS.md](./docs/SCRIPTS.md)** - Utility scripts usage (device registration, ownership transfer, etc.)

## User Flow

### Device Owner

1. **Register Device** (`register_device`)
   - Register device to wallet with device_id
   - Create DeviceRegistry and DeviceRewards accounts via PDA

2. **Automatic Reward Reception**
   - AIR tokens **automatically transferred instantly** when IoT device submits data
   - No separate claim transaction required
   - Optimized user experience

3. **Transfer Ownership** (`transfer_ownership`)
   - Transfer device to another wallet
   - Both DeviceRegistry and DeviceRewards owners are updated atomically
   - Subsequent rewards automatically transferred to new owner

4. **Deactivate Device** (`deactivate_device`)
   - Set device to inactive state
   - Inactive devices cannot submit data

### Server (Backend)

**Data Collection and Automatic Rewards** (`submit_data`)
- IoT devices send PM2.5, PM10, temperature, humidity data
- **Automatically transfer AIR tokens instantly** (Treasury → Owner Token Account)
- Calculate rewards based on 4-year halving
- Emit DataSubmitted event (permanently stored on-chain)
- **Security**: Unregistered devices cannot submit data
- **Security**: Inactive (is_active=false) devices cannot submit data

## Reward Mechanism

### Time-Based 4-Year Halving

- **Epoch 0** (0-4 years): 0.1 AIR per data (automatic instant distribution)
- **Epoch 1** (4-8 years): 0.05 AIR per data (automatic instant distribution)
- **Epoch 2** (8-12 years): 0.025 AIR per data (automatic instant distribution)
- ...

Halving timing is calculated based on `reward_config.start_timestamp`.

### Automatic Instant Distribution System

- Rewards **automatically transferred instantly** upon data submission
- No separate claim transaction required
- Instantly transferred from **Treasury PDA** → Owner Token Account
- Treasury is a Program Derived Address (PDA) - fully controlled by the smart contract
- No manual signatures required for distribution
- Optimized user experience and gas savings
- Only 6 accounts needed for data submission (simplified from 9)

## Testing

### Run All Tests

```bash
anchor test
```

### Test Structure (Total 27 Tests)

- `tests/airvent-contract.ts` - Token initialization basic tests (1)
- `tests/device-registry.ts` - Device registration/transfer/deactivation (10)
- `tests/data-rewards.ts` - Data collection, automatic rewards, events, security tests (9)
  - Verify **automatic instant reward transfer** upon data submission
  - Verify reward recipient change after device ownership transfer
  - **DataSubmitted event emission verification** (including PM2.5, PM10, temperature, humidity)
  - **Block unregistered devices**
  - **Block inactive device data submission**
  - **Ownership constraint verification (has_one)**
- `tests/e2e.ts` - Full flow integration tests (7)
  - Token initialization → Device registration → Data submission → Automatic reward transfer verification

All tests guarantee idempotency and independence (order-independent execution).

## Tech Stack

- Solana (Blockchain)
- Anchor 0.32.1 (Framework)
- SPL Token (Token Standard)
- TypeScript (Testing)

## Security Considerations

### Token Security
- Mint Authority is permanently removed upon initialization (no additional minting possible)
- **Treasury PDA**: All tokens stored in program-controlled PDA (seeds: `[b"treasury"]`)
- Treasury is fully controlled by the smart contract - no external signatures needed
- Authority account for admin functions should use secure wallet/Multisig

### Device Management Security
- **Registration Verification**: DeviceRewards only created in register_device (removed init_if_needed)
- **Ownership Verification**: Only owners can transfer via has_one constraint
- **Active Status Verification**: Inactive (is_active=false) devices cannot submit data
- **Registration Status Verification**: Unregistered devices cannot submit data (AccountNotInitialized error)

### Data Integrity
- All IoT data permanently stored on-chain via DataSubmitted events
- Events stored in program logs, immutable
- Full history queryable via Helius/Triton indexers

## Development Tools

### Check Balance with Solana CLI

How to check balances when testing on localnet:

```bash
# Check SOL balance
solana balance --url localhost

# Check SOL balance of specific address
solana balance <ADDRESS> --url localhost

# Check AIR token balance
spl-token balance <MINT_ADDRESS> --url localhost

# Check all token accounts
spl-token accounts --url localhost

# Check token accounts of specific owner
spl-token accounts --url localhost --owner <ADDRESS>
```

### Account Query (Free)

Reward statistics can be queried for free via RPC calls:

```typescript
// Query DeviceRewards account (no gas fee)
const deviceRewards = await program.account.deviceRewards.fetch(deviceRewardsAddress);
console.log("Total submissions:", deviceRewards.totalDataSubmitted.toString());
console.log("Last submission:", new Date(deviceRewards.lastSubmission.toNumber() * 1000));

// Query RewardConfig (no gas fee)
const config = await program.account.rewardConfig.fetch(rewardConfigAddress);
console.log("Total distributed:", config.totalRewardsDistributed.toString());
```

### Event Data Access

DataSubmitted events are stored in program logs and can be queried via:

**1. Parse directly from transaction result (Real-time)**
```typescript
const tx = await program.methods.submitData(...).rpc();
const txDetails = await provider.connection.getTransaction(tx, {
  maxSupportedTransactionVersion: 0
});
// Parse event from logs
```

**2. WebSocket subscription (Real-time)**
```typescript
program.addEventListener('DataSubmitted', (event, slot) => {
  console.log('New data:', event.pm25, event.pm10, event.temperature, event.humidity);
  console.log('Reward distributed:', event.rewardAmount);
});
```

**3. Use Indexers (Recommended)**
- [Helius](https://helius.dev): Enhanced WebSocket and history queries
- [Triton](https://triton.one): Geyser plugin-based indexing

**4. Self-Indexing**
- Stream program logs via Geyser plugin
- Store in database like PostgreSQL
