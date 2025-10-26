/**
 * Submit Data Script
 *
 * Usage:
 *   yarn ts-node scripts/submit-data.ts <device_id> <pm25> <pm10> <temp> <humidity>
 *
 * Example:
 *   yarn ts-node scripts/submit-data.ts test2 352 501 253 655
 */

import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { AirventContract } from "../target/types/airvent_contract";
import { TOKEN_PROGRAM_ID, getAssociatedTokenAddress, createAssociatedTokenAccount } from "@solana/spl-token";
import { loadSolanaConfig, getNetworkName } from "./utils/config";

async function main() {
  // Check arguments
  if (process.argv.length < 7) {
    console.error("Usage: yarn ts-node scripts/submit-data.ts <device_id> <pm25> <pm10> <temp> <humidity>");
    console.error("\nExample:");
    console.error("  yarn ts-node scripts/submit-data.ts test2 352 501 253 655");
    console.error("  (PM2.5: 35.2 μg/m³, PM10: 50.1 μg/m³, Temp: 25.3°C, Humidity: 65.5%)");
    process.exit(1);
  }

  const deviceId = process.argv[2];
  const pm25 = parseInt(process.argv[3]);
  const pm10 = parseInt(process.argv[4]);
  const temperature = parseInt(process.argv[5]);
  const humidity = parseInt(process.argv[6]);

  // Load Solana CLI configuration (uses same network/wallet as CLI)
  const config = loadSolanaConfig();

  const provider = new anchor.AnchorProvider(config.connection, config.wallet, {
    commitment: "confirmed",
  });
  anchor.setProvider(provider);

  const programId = new anchor.web3.PublicKey(
    "B4m1ENS6SWV3H6mZkJ2VFkBKawqYe7atH4AjXoc4NZzR"
  );
  const idl = require("../target/idl/airvent_contract.json");
  const program = new Program(idl, provider) as Program<AirventContract>;

  console.log("\n╔═══════════════════════════════════════════════════════╗");
  console.log("║            Submit Data                                ║");
  console.log("╚═══════════════════════════════════════════════════════╝\n");

  // Derive PDAs
  const [devicePda] = anchor.web3.PublicKey.findProgramAddressSync(
    [Buffer.from("device"), Buffer.from(deviceId)],
    program.programId
  );

  const [deviceRewardsPda] = anchor.web3.PublicKey.findProgramAddressSync(
    [Buffer.from("device_rewards"), Buffer.from(deviceId)],
    program.programId
  );

  const [rewardConfigPda] = anchor.web3.PublicKey.findProgramAddressSync(
    [Buffer.from("reward_config")],
    program.programId
  );

  // Fetch device info
  let device, rewardConfig;
  try {
    device = await program.account.deviceRegistry.fetch(devicePda);
    rewardConfig = await program.account.rewardConfig.fetch(rewardConfigPda);
  } catch (err) {
    console.error("❌ Error: Device not found or RewardConfig not initialized!");
    console.error(`   Make sure device "${deviceId}" is registered.`);
    process.exit(1);
  }

  console.log("📋 Data Submission:");
  console.log(`   Device ID:    "${deviceId}"`);
  console.log(`   Owner:        ${device.owner.toString()}`);
  console.log(`   PM2.5:        ${pm25 / 10} μg/m³`);
  console.log(`   PM10:         ${pm10 / 10} μg/m³`);
  console.log(`   Temperature:  ${temperature / 10}°C`);
  console.log(`   Humidity:     ${humidity / 10}%\n`);

  // Get mint from reward config
  const mint = rewardConfig.mint;

  // Derive treasury PDA
  const [treasury] = anchor.web3.PublicKey.findProgramAddressSync(
    [Buffer.from("treasury")],
    program.programId
  );

  // Get owner token account
  const ownerTokenAccount = await getAssociatedTokenAddress(mint, device.owner);

  // Check if owner token account exists, if not create it
  const ownerTokenAccountInfo = await config.connection.getAccountInfo(ownerTokenAccount);

  if (!ownerTokenAccountInfo) {
    console.log("🔧 Creating owner token account...");
    await createAssociatedTokenAccount(
      config.connection,
      config.wallet.payer,
      mint,
      device.owner
    );
    console.log("   ✓ Owner token account created\n");
  }

  console.log("🚀 Submitting data...\n");

  try {
    const tx = await program.methods
      .submitData(deviceId, pm25, pm10, temperature, humidity)
      .accountsPartial({
        device: devicePda,
        deviceRewards: deviceRewardsPda,
        rewardConfig: rewardConfigPda,
        treasury: treasury,
        ownerTokenAccount: ownerTokenAccount,
      })
      .rpc();

    console.log("✅ Data submitted successfully!\n");
    console.log(`   Transaction: ${tx}`);
    console.log(`   Explorer: https://solscan.io/tx/${tx}?cluster=devnet\n`);

    // Fetch updated stats
    const deviceRewards = await program.account.deviceRewards.fetch(deviceRewardsPda);
    const ownerBalance = await config.connection.getTokenAccountBalance(ownerTokenAccount);

    console.log("📊 Updated Stats:");
    console.log(`   Total Submissions: ${deviceRewards.totalDataSubmitted.toString()}`);
    console.log(`   Owner AIR Balance: ${ownerBalance.value.uiAmount} AIR\n`);

  } catch (error: any) {
    console.error("❌ Submission failed!");

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
