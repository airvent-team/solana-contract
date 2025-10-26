/**
 * Check Device Script
 *
 * Query device registration status and statistics
 *
 * Usage:
 *   yarn ts-node scripts/check-device.ts <device_id>
 *
 * Example:
 *   yarn ts-node scripts/check-device.ts AQ-20251026-8478
 */

import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { AirventContract } from "../target/types/airvent_contract";
import * as fs from "fs";
import * as os from "os";

async function main() {
  // Check arguments
  if (process.argv.length < 3) {
    console.error("Usage: yarn ts-node scripts/check-device.ts <device_id>");
    console.error("\nExample:");
    console.error("  yarn ts-node scripts/check-device.ts AQ-20251026-8478");
    process.exit(1);
  }

  const deviceId = process.argv[2];

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
    "B4m1ENS6SWV3H6mZkJ2VFkBKawqYe7atH4AjXoc4NZzR"
  );
  const idl = require("../target/idl/airvent_contract.json");
  const program = new Program(idl, provider) as Program<AirventContract>;

  console.log("\n╔═══════════════════════════════════════════════════════╗");
  console.log("║              Check Device Status                      ║");
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

  console.log("📋 Query Info:");
  console.log(`   Device ID:    "${deviceId}"`);
  console.log(`   Device PDA:   ${devicePda.toString()}`);
  console.log(`   Rewards PDA:  ${deviceRewardsPda.toString()}`);
  console.log(`   Network:      ${provider.connection.rpcEndpoint}\n`);

  // Try to fetch device account
  try {
    const device = await program.account.deviceRegistry.fetch(devicePda);

    console.log("✅ Device Found!\n");

    console.log("📱 Device Registry:");
    console.log(`   Device ID:      ${device.deviceId}`);
    console.log(`   Owner:          ${device.owner.toString()}`);
    console.log(`   Registered At:  ${new Date(device.registeredAt.toNumber() * 1000).toISOString()}`);
    console.log(`   Active:         ${device.isActive ? '✅ Yes' : '❌ No'}\n`);

    // Fetch device rewards
    try {
      const rewards = await program.account.deviceRewards.fetch(deviceRewardsPda);

      console.log("🎁 Device Rewards:");
      console.log(`   Total Data Submitted:  ${rewards.totalDataSubmitted.toString()}`);

      if (rewards.lastSubmission.toNumber() === 0) {
        console.log(`   Last Submission:       Never`);
      } else {
        console.log(`   Last Submission:       ${new Date(rewards.lastSubmission.toNumber() * 1000).toISOString()}`);
      }

      console.log(`   Owner:                 ${rewards.owner.toString()}\n`);

    } catch (rewardsErr) {
      console.log("⚠️  Device Rewards account not found (unexpected)\n");
    }

    // Show explorer links
    console.log("🔗 Explorer Links:");
    console.log(`   Device:  https://solscan.io/account/${devicePda.toString()}?cluster=devnet`);
    console.log(`   Rewards: https://solscan.io/account/${deviceRewardsPda.toString()}?cluster=devnet`);
    console.log(`   Owner:   https://solscan.io/account/${device.owner.toString()}?cluster=devnet\n`);

  } catch (err: any) {
    console.log("❌ Device Not Found\n");
    console.log(`   The device "${deviceId}" is not registered on-chain.`);
    console.log(`   Device PDA: ${devicePda.toString()}\n`);

    console.log("💡 To register this device, run:");
    console.log(`   yarn ts-node scripts/register-device.ts ${deviceId}\n`);
  }
}

main().then(
  () => process.exit(0),
  (err) => {
    console.error(err);
    process.exit(1);
  }
);
