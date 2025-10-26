/**
 * Transfer Device Ownership Script
 *
 * Usage:
 *   yarn ts-node scripts/transfer-ownership.ts <device_id> <new_owner_pubkey>
 *
 * Example:
 *   yarn ts-node scripts/transfer-ownership.ts AQ-20251026-8478 F47u5hNqRjJ3A8baEbH6KXZGNMq3YMUVDbWVy3yYV2No
 */

import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { AirventContract } from "../target/types/airvent_contract";
import * as fs from "fs";
import * as os from "os";

async function main() {
  // Check arguments
  if (process.argv.length < 4) {
    console.error("Usage: yarn ts-node scripts/transfer-ownership.ts <device_id> <new_owner_pubkey>");
    console.error("\nExample:");
    console.error("  yarn ts-node scripts/transfer-ownership.ts AQ-20251026-8478 F47u5hNqRjJ3A8baEbH6KXZGNMq3YMUVDbWVy3yYV2No");
    process.exit(1);
  }

  const deviceId = process.argv[2];
  const newOwnerStr = process.argv[3];

  // Validate new owner pubkey
  let newOwner: anchor.web3.PublicKey;
  try {
    newOwner = new anchor.web3.PublicKey(newOwnerStr);
  } catch (err) {
    console.error(`❌ Invalid public key: ${newOwnerStr}`);
    process.exit(1);
  }

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
  const currentOwner = provider.wallet.publicKey;

  console.log("\n╔═══════════════════════════════════════════════════════╗");
  console.log("║        Transfer Device Ownership                      ║");
  console.log("╚═══════════════════════════════════════════════════════╝\n");

  // Derive device PDA
  const [devicePda] = anchor.web3.PublicKey.findProgramAddressSync(
    [Buffer.from("device"), Buffer.from(deviceId)],
    program.programId
  );

  console.log("📋 Transfer Details:");
  console.log(`   Device ID:    "${deviceId}"`);
  console.log(`   Device PDA:   ${devicePda.toString()}`);
  console.log(`   Current Owner: ${currentOwner.toString()}`);
  console.log(`   New Owner:     ${newOwner.toString()}\n`);

  // Check if device exists and verify current owner
  try {
    const device = await program.account.deviceRegistry.fetch(devicePda);

    if (!device.owner.equals(currentOwner)) {
      console.error("❌ Error: You are not the owner of this device!");
      console.error(`   Current Owner: ${device.owner.toString()}`);
      console.error(`   Your Wallet:   ${currentOwner.toString()}\n`);
      process.exit(1);
    }

    console.log("✅ Device found. Current owner verified.\n");
  } catch (err) {
    console.error("❌ Error: Device not found!");
    console.error(`   Make sure device "${deviceId}" is registered.\n`);
    process.exit(1);
  }

  // Transfer ownership
  console.log("🚀 Transferring ownership...\n");

  try {
    const tx = await program.methods
      .transferOwnership(newOwner)
      .accountsPartial({
        device: devicePda,
        owner: currentOwner,
      })
      .rpc();

    console.log("✅ Ownership transferred successfully!\n");
    console.log(`   Transaction: ${tx}`);
    console.log(`   Explorer: https://solscan.io/tx/${tx}?cluster=devnet\n`);

    // Fetch and display updated device info
    const device = await program.account.deviceRegistry.fetch(devicePda);

    console.log("📱 Updated Device Info:");
    console.log(`   Device ID:     ${device.deviceId}`);
    console.log(`   New Owner:     ${device.owner.toString()}`);
    console.log(`   Registered:    ${new Date(device.registeredAt.toNumber() * 1000).toISOString()}`);
    console.log(`   Active:        ${device.isActive}\n`);

  } catch (error: any) {
    console.error("❌ Transfer failed!");

    if (error.logs) {
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
