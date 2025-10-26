/**
 * Register Device Script
 *
 * Usage:
 *   yarn ts-node scripts/register-device.ts [device_id]
 *
 * Examples:
 *   yarn ts-node scripts/register-device.ts                    # Random device ID
 *   yarn ts-node scripts/register-device.ts SENSOR001          # Specific device ID
 *   yarn ts-node scripts/register-device.ts my-test-device-123 # Custom ID
 */

import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { AirventContract } from "../target/types/airvent_contract";
import * as fs from "fs";
import * as os from "os";

const MAX_DEVICE_ID_LEN = 32;

async function main() {
  // Initialize provider and program
  const connection = new anchor.web3.Connection(
    "https://api.devnet.solana.com",
    "confirmed"
  );

  // Load wallet from ~/.config/solana/id.json
  const walletPath = `${os.homedir()}/.config/solana/id.json`;
  const walletKeypair = anchor.web3.Keypair.fromSecretKey(
    new Uint8Array(JSON.parse(fs.readFileSync(walletPath, "utf-8")))
  );
  const wallet = new anchor.Wallet(walletKeypair);

  const provider = new anchor.AnchorProvider(connection, wallet, {
    commitment: "confirmed",
  });
  anchor.setProvider(provider);

  const programId = new anchor.web3.PublicKey(
    "7HjcqvBdLaj6JzH5x3shJcSjaig4SXqwMJGQCbDLyVVB"
  );
  const idl = require("../target/idl/airvent_contract.json");
  const program = new Program(idl, provider) as Program<AirventContract>;
  const owner = provider.wallet.publicKey;

  // Get device_id from command line or generate random one
  let deviceId = process.argv[2];

  if (!deviceId) {
    // Generate random device ID (e.g., "DEV-abc123de")
    const randomStr = Math.random().toString(36).substring(2, 10);
    deviceId = `DEV-${randomStr}`;
    console.log(`📝 No device_id provided. Generated random ID: ${deviceId}\n`);
  } else {
    console.log(`📝 Using device_id: ${deviceId}\n`);
  }

  // Validate device_id length
  if (deviceId.length > MAX_DEVICE_ID_LEN) {
    console.error(`❌ Error: device_id too long (max ${MAX_DEVICE_ID_LEN} characters)`);
    console.error(`   Provided: ${deviceId.length} characters`);
    process.exit(1);
  }

  if (deviceId.length === 0) {
    console.error(`❌ Error: device_id cannot be empty`);
    process.exit(1);
  }

  console.log("╔═══════════════════════════════════════════════════════╗");
  console.log("║            Register Device                            ║");
  console.log("╚═══════════════════════════════════════════════════════╝\n");

  // Derive PDA addresses
  const [devicePda] = anchor.web3.PublicKey.findProgramAddressSync(
    [Buffer.from("device"), Buffer.from(deviceId)],
    program.programId
  );

  const [deviceRewardsPda] = anchor.web3.PublicKey.findProgramAddressSync(
    [Buffer.from("device_rewards"), Buffer.from(deviceId)],
    program.programId
  );

  console.log("📋 Configuration:");
  console.log(`   Program ID:  ${program.programId.toString()}`);
  console.log(`   Network:     ${provider.connection.rpcEndpoint}`);
  console.log(`   Owner:       ${owner.toString()}`);
  console.log(`   Device ID:   "${deviceId}"`);
  console.log(`   Device PDA:  ${devicePda.toString()}`);
  console.log(`   Rewards PDA: ${deviceRewardsPda.toString()}\n`);

  // Check if device already exists
  try {
    const existingDevice = await program.account.deviceRegistry.fetch(devicePda);
    console.log("⚠️  Device already registered!");
    console.log(`   Owner: ${existingDevice.owner.toString()}`);
    console.log(`   Registered: ${new Date(existingDevice.registeredAt.toNumber() * 1000).toISOString()}`);
    console.log(`   Active: ${existingDevice.isActive}\n`);
    process.exit(0);
  } catch (err) {
    // Device doesn't exist yet - continue with registration
  }

  // Check SOL balance
  const balance = await provider.connection.getBalance(owner);
  console.log(`💰 SOL Balance: ${balance / anchor.web3.LAMPORTS_PER_SOL} SOL`);
  if (balance < 0.01 * anchor.web3.LAMPORTS_PER_SOL) {
    console.log("⚠️  Warning: Low SOL balance. Need ~0.01 SOL for account creation\n");
  } else {
    console.log("   ✓ Sufficient balance\n");
  }

  // Register device
  console.log("🚀 Registering device...\n");

  try {
    const tx = await program.methods
      .registerDevice(deviceId)
      .accountsPartial({
        device: devicePda,
        deviceRewards: deviceRewardsPda,
        owner: owner,
      })
      .rpc();

    console.log("✅ Device registered successfully!\n");
    console.log(`   Transaction: ${tx}`);
    console.log(`   Explorer: https://solscan.io/tx/${tx}?cluster=devnet\n`);

    // Fetch and display device info
    const device = await program.account.deviceRegistry.fetch(devicePda);
    const rewards = await program.account.deviceRewards.fetch(deviceRewardsPda);

    console.log("📱 Device Info:");
    console.log(`   Device ID:         ${device.deviceId}`);
    console.log(`   Owner:             ${device.owner.toString()}`);
    console.log(`   Registered:        ${new Date(device.registeredAt.toNumber() * 1000).toISOString()}`);
    console.log(`   Active:            ${device.isActive}`);
    console.log(`   Device PDA:        ${devicePda.toString()}\n`);

    console.log("🎁 Rewards Info:");
    console.log(`   Total Submissions: ${rewards.totalDataSubmitted.toString()}`);
    console.log(`   Last Submission:   ${rewards.lastSubmission.toNumber() === 0 ? 'Never' : new Date(rewards.lastSubmission.toNumber() * 1000).toISOString()}`);
    console.log(`   Rewards PDA:       ${deviceRewardsPda.toString()}\n`);

    console.log("✨ Next steps:");
    console.log("   1. Submit sensor data using this device_id");
    console.log("   2. Claim rewards after data submissions\n");

  } catch (error: any) {
    console.error("❌ Registration failed!");

    if (error.message?.includes("custom program error: 0x0")) {
      console.error("   Error: Account already exists\n");
    } else if (error.logs) {
      console.error("\n   Program Logs:");
      error.logs.forEach((log: string) => console.error(`   ${log}`));
    } else {
      console.error(`   ${error.message}\n`);
    }

    process.exit(1);
  }
}

main().then(
  () => process.exit(0),
  (err) => {
    console.error(err);
    process.exit(1);
  }
);
