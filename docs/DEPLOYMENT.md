# AIR Token Deployment Guide

---

## Quick Reference

### Command Summary

| Task | Command |
|------|--------|
| Build | `anchor build` |
| Deploy (Localnet) | `anchor deploy` |
| Deploy (Devnet) | `anchor deploy --provider.cluster devnet` |
| Deploy (Mainnet) | `anchor deploy --provider.cluster mainnet-beta` |
| Initialize | `anchor migrate` |
| Test | `anchor test` |


---

## Localnet Deployment

### Step 1: Start Local Validator

```bash
anchor localnet
```

### Step 2: Build and Deploy

```bash
anchor build
anchor deploy
```

Check the output Program ID:
```
Program Id: 7HjcqvBdLaj6JzH5x3shJcSjaig4SXqwMJGQCbDLyVVB
```

### Step 3: Update Program ID

`programs/airvent-contract/src/lib.rs`:
```rust
declare_id!("7HjcqvBdLaj6JzH5x3shJcSjaig4SXqwMJGQCbDLyVVB");
```

`Anchor.toml`:
```toml
[programs.localnet]
airvent_contract = "7HjcqvBdLaj6JzH5x3shJcSjaig4SXqwMJGQCbDLyVVB"
```

### Step 4: Rebuild and Initialize

```bash
anchor build
anchor migrate
```

**Initialization includes:**
- Create AIR Token (1B supply)
- Remove Mint Authority
- Configure Reward Config
- Save Mint keypair (`.keys/mint-keypair.json`)

### Step 5: Test

```bash
anchor test
```

---

## Devnet Deployment

### Step 1: SOL Airdrop

```bash
solana config set --url devnet
solana airdrop 2
solana balance  # Minimum 2 SOL recommended
```

### Step 2: Build and Deploy

```bash
anchor build
anchor deploy --provider.cluster devnet
```

### Step 3: Update Program ID and Initialize

Update `lib.rs` and `Anchor.toml` with the output Program ID, then:

```bash
anchor build
anchor migrate --provider.cluster devnet
```

### Step 4: Verify on Explorer

```
https://explorer.solana.com/address/<PROGRAM_ID>?cluster=devnet
```

---

## Mainnet Deployment

⚠️ **Warning:** Real SOL costs incurred, irreversible

### Pre-deployment Checklist

- [ ] All tests passing
- [ ] Code audit completed
- [ ] Sufficient SOL balance (10+ SOL recommended)
- [ ] Multisig wallet prepared

### Step 1: Prepare Mainnet Wallet

```bash
solana-keygen new --outfile ~/.config/solana/mainnet-wallet.json
solana config set --url mainnet-beta
solana config set --keypair ~/.config/solana/mainnet-wallet.json
solana balance
```

### Step 2: Build and Deploy

```bash
anchor build --verifiable
anchor deploy --provider.cluster mainnet-beta
```

### Step 3: Update Program ID and Initialize

```bash
# After updating lib.rs and Anchor.toml
anchor build --verifiable
anchor migrate --provider.cluster mainnet-beta
```

### Step 4: Verify Deployment

```bash
solana program show <PROGRAM_ID>

# Verify mint supply
spl-token supply <MINT_ADDRESS>  # Expected: 1000000000

# Verify Mint Authority removed
spl-token display <MINT_ADDRESS> | grep "Mint authority"  # Expected: (not set)
```

---

## Network Switching

### Modify Anchor.toml (Recommended)

```toml
[provider]
cluster = "devnet"  # localnet, devnet, mainnet-beta
wallet = "~/.config/solana/id.json"
```

### Use CLI Options

```bash
anchor deploy --provider.cluster devnet
anchor migrate --provider.cluster devnet
```

### Network RPC URLs

| Network | RPC URL |
|---------|---------|
| localnet | http://localhost:8899 |
| devnet | https://api.devnet.solana.com |
| mainnet-beta | https://api.mainnet-beta.solana.com |

---

## Anchor Commands

### anchor build

```bash
anchor build              # Normal build
anchor build --verifiable # Verifiable build (Mainnet)
```

### anchor deploy

```bash
anchor deploy                                    # Use Anchor.toml cluster
anchor deploy --provider.cluster devnet          # Devnet
anchor deploy --provider.cluster mainnet-beta    # Mainnet
```

### anchor migrate

⚠️ **Important:** `anchor migrate` does not deploy. It only runs the `migrations/deploy.ts` script.

```bash
anchor migrate                                   # Initialize
anchor migrate --provider.cluster devnet         # Devnet initialization
```

**Actions performed:**
- Initialize AIR Token (1B supply, remove Mint Authority)
- Initialize Reward Config (100 AIR/data, 4-year halving)

### anchor upgrade

```bash
anchor upgrade target/deploy/airvent_contract.so --provider.cluster devnet
```

### anchor test

```bash
anchor test                         # Run all tests
anchor test -- --grep "Device"      # Run specific tests
```

---

## Program ID Management

### Keypair Backup

```bash
# Backup Mainnet keypair (Required!)
cp target/deploy/airvent_contract-keypair.json \
   backup/airvent_contract-mainnet-$(date +%Y%m%d).json
```

### When to Change Program ID

1. First deployment after localnet restart
2. First deployment to new network (Devnet → Mainnet)
3. Deployment after keypair deletion

### Change Procedure

1. Check Program ID after deployment
2. Update `lib.rs` → `declare_id!()`
3. Update `Anchor.toml` → `[programs.<cluster>]`
4. Rebuild

---

## Troubleshooting

### Program ID Mismatch

**Error:**
```
Error Code: DeclaredProgramIdMismatch
```

**Solution:**
```bash
solana address -k target/deploy/airvent_contract-keypair.json
# Update declare_id!() in lib.rs
anchor build
```

### Authority Error

**Error:**
```
Program's authority does not match
```

**Solution (Localnet):**
```bash
rm -f target/deploy/airvent_contract-keypair.json
anchor build
anchor deploy
```

**Solution (Devnet/Mainnet):**
```bash
solana program show <PROGRAM_ID>  # Check authority
solana config set --keypair <correct_wallet>
```

### Insufficient Balance

```bash
# Localnet/Devnet
solana airdrop 10

# Mainnet
# Transfer SOL from exchange
```

### RPC Connection Failed

```bash
solana config get
solana config set --url https://api.devnet.solana.com
```

### Migration Error

```bash
# No IDL
anchor build

# No wallet
solana-keygen new --outfile ~/.config/solana/id.json
```

---

## Prerequisites

### Install Tools

```bash
# Solana CLI
sh -c "$(curl -sSfL https://release.solana.com/stable/install)"

# Anchor CLI
cargo install --git https://github.com/coral-xyz/anchor anchor-cli --locked

# Check versions
solana --version  # v1.18+
anchor --version  # 0.32.1
```

### Create Wallet

```bash
solana-keygen new --outfile ~/.config/solana/id.json
solana address
```

---

## References

- [Solana Documentation](https://docs.solana.com/)
- [Anchor Documentation](https://www.anchor-lang.com/)
- [Solana Explorer](https://explorer.solana.com/)
