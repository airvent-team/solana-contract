# Scripts Usage Guide

This document provides instructions for using utility scripts in the AIR Token project.

## Table of Contents

- [Device Registration](#device-registration)
- [Ownership Transfer](#ownership-transfer)
- [Managing Multiple Wallets](#managing-multiple-wallets)

---

## Device Registration

**Script**: `scripts/register-device.ts`

Register a new IoT device on the blockchain.

### Usage

```bash
# Register with random device_id (e.g., DEV-abc123de)
yarn ts-node scripts/register-device.ts

# Register with specific device_id
yarn ts-node scripts/register-device.ts SENSOR001

# Register with custom device_id (max 32 characters)
yarn ts-node scripts/register-device.ts AQ-20251026-8478
```

### Features

- ✅ Accepts device_id as parameter (max 32 characters)
- ✅ Generates random ID if no parameter provided
- ✅ Checks for duplicate registration
- ✅ Verifies SOL balance
- ✅ Displays device info after registration
- ✅ Provides Solscan link

### Example Output

```
╔═══════════════════════════════════════════════════════╗
║            Register Device                            ║
╚═══════════════════════════════════════════════════════╝

📋 Configuration:
   Program ID:  7HjcqvBdLaj6JzH5x3shJcSjaig4SXqwMJGQCbDLyVVB
   Network:     https://api.devnet.solana.com
   Owner:       EyPBJ8urskTHLEdp2ob6bEdzSn1hefTiUojf9XSBnco6
   Device ID:   "AQ-20251026-8478"
   Device PDA:  L9SJfdD56aXpzuLaiMZDhbAEmZr4HFdwypbJpavsXxM
   Rewards PDA: 5ZZ1b8M3gZFMyQKstwy7UL3QVnjt8U2YTta7xayhWZYN

✅ Device registered successfully!
```

### Important Notes

- device_id can be up to 32 characters
- Registration requires ~0.01 SOL for rent
- Duplicate device_id cannot be registered

---

## Ownership Transfer

**Script**: `scripts/transfer-ownership.ts`

Transfer ownership of a registered device to another wallet.

### Usage

```bash
# Basic usage
yarn ts-node scripts/transfer-ownership.ts <device_id> <new_owner_pubkey>

# Example
yarn ts-node scripts/transfer-ownership.ts AQ-20251026-8478 F47u5hNqRjJ3A8baEbH6KXZGNMq3YMUVDbWVy3yYV2No
```

### Features

- ✅ Verifies current owner
- ✅ Checks device existence
- ✅ Executes ownership transfer transaction
- ✅ Displays updated device info
- ✅ Provides Solscan link

### Example Output

```
╔═══════════════════════════════════════════════════════╗
║        Transfer Device Ownership                      ║
╚═══════════════════════════════════════════════════════╝

📋 Transfer Details:
   Device ID:    "AQ-20251026-8478"
   Current Owner: EyPBJ8urskTHLEdp2ob6bEdzSn1hefTiUojf9XSBnco6
   New Owner:     F47u5hNqRjJ3A8baEbH6KXZGNMq3YMUVDbWVy3yYV2No

✅ Ownership transferred successfully!

📱 Updated Device Info:
   Device ID:     AQ-20251026-8478
   New Owner:     F47u5hNqRjJ3A8baEbH6KXZGNMq3YMUVDbWVy3yYV2No
   Active:        true
```

### Important Notes

- **Can only be executed with the current owner's wallet (`~/.config/solana/id.json`)**
- Rewards after transfer will be automatically sent to the new owner
- Ownership transfer is irreversible, proceed with caution

---

## Managing Multiple Wallets

You can create and manage multiple wallets using Solana CLI.

### Creating Wallets

```bash
# Create new wallets
solana-keygen new -o ~/.config/solana/user1.json --no-bip39-passphrase
solana-keygen new -o ~/.config/solana/user2.json --no-bip39-passphrase
solana-keygen new -o ~/.config/solana/treasury.json --no-bip39-passphrase
```

### Switching Wallets

```bash
# Check currently active wallet
solana config get

# Switch wallet
solana config set --keypair ~/.config/solana/user1.json
solana config set --keypair ~/.config/solana/user2.json
solana config set --keypair ~/.config/solana/id.json  # Return to default
```

### Checking Wallet Addresses

```bash
# Current wallet address
solana address

# Check address of specific wallet file
solana-keygen pubkey ~/.config/solana/user1.json
solana-keygen pubkey ~/.config/solana/user2.json
```

### Using Specific Wallet in Scripts

Switch wallet before running script to execute transaction with that wallet:

```bash
# Register device with user1 wallet
solana config set --keypair ~/.config/solana/user1.json
yarn ts-node scripts/register-device.ts MY-DEVICE-001

# Return to default wallet
solana config set --keypair ~/.config/solana/id.json
```

### Getting SOL on Devnet

```bash
# Airdrop SOL to current wallet
solana airdrop 2 --url devnet

# Airdrop SOL to specific address
solana airdrop 2 <ADDRESS> --url devnet
```

---

## Troubleshooting

### "Insufficient balance" Error

```bash
# Get SOL on devnet
solana airdrop 2 --url devnet

# Check balance
solana balance --url devnet
```

### "You are not the owner" Error

The currently configured wallet is not the device owner. Switch to the correct wallet:

```bash
# Check current wallet
solana address

# Switch to correct wallet
solana config set --keypair ~/.config/solana/owner-wallet.json
```

### "Device not found" Error

The device is not registered. Register it first using `register-device.ts`:

```bash
yarn ts-node scripts/register-device.ts YOUR-DEVICE-ID
```
