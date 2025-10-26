/**
 * Anchor Migration Script
 *
 * This script runs after `anchor migrate` to initialize the AIR Token system:
 * 1. Initialize AIR Token (1B supply, revoke mint authority)
 * 2. Initialize Reward Config (100 AIR per data, 4-year halving)
 *
 * Usage:
 *   anchor migrate                                    # Use Anchor.toml cluster
 *   anchor migrate --provider.cluster devnet          # Deploy to devnet
 *   anchor migrate --provider.cluster mainnet-beta    # Deploy to mainnet
 */

import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { AirventContract } from "../target/types/airvent_contract";
import * as fs from "fs";
import * as path from "path";

const TOTAL_SUPPLY = 1_000_000_000 * 10 ** 9; // 1 billion AIR
const INITIAL_REWARD = 0.1 * 10 ** 9; // 0.1 AIR per submission

module.exports = async function (provider: anchor.AnchorProvider) {
  // Configure client to use the provider.
  anchor.setProvider(provider);

  const program = anchor.workspace.airventContract as Program<AirventContract>;
  const payer = provider.wallet.publicKey;

  console.log("\n╔═══════════════════════════════════════════════════════════╗");
  console.log("║           AIR Token - Migration Script                    ║");
  console.log("╚═══════════════════════════════════════════════════════════╝\n");

  console.log("📋 Configuration:");
  console.log(`   Program ID: ${program.programId.toString()}`);
  console.log(`   Deployer: ${payer.toString()}`);
  console.log(`   Network: ${provider.connection.rpcEndpoint}\n`);

  // Check SOL balance
  const balance = await provider.connection.getBalance(payer);
  console.log(`💰 SOL Balance: ${balance / anchor.web3.LAMPORTS_PER_SOL} SOL`);
  if (balance < 0.5 * anchor.web3.LAMPORTS_PER_SOL) {
    console.log(
      "⚠️  Warning: Low SOL balance. Recommended: at least 0.5 SOL\n"
    );
  } else {
    console.log("   ✓ Sufficient balance\n");
  }

  // ============================================================
  // Step 1: Initialize Token
  // ============================================================
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("Step 1: Token Initialization");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

  // Generate or load mint keypair
  const keypairPath = path.join(__dirname, "..", ".keys", "mint-keypair.json");
  let mintKeypair: anchor.web3.Keypair;

  if (fs.existsSync(keypairPath)) {
    console.log(
      "📂 Loading existing mint keypair from .keys/mint-keypair.json"
    );
    const keypairData = JSON.parse(fs.readFileSync(keypairPath, "utf-8"));
    mintKeypair = anchor.web3.Keypair.fromSecretKey(
      new Uint8Array(keypairData)
    );
  } else {
    console.log("🔑 Generating new mint keypair...");
    mintKeypair = anchor.web3.Keypair.generate();

    // Save keypair
    const keysDir = path.join(__dirname, "..", ".keys");
    if (!fs.existsSync(keysDir)) {
      fs.mkdirSync(keysDir, { recursive: true });
    }
    fs.writeFileSync(
      keypairPath,
      JSON.stringify(Array.from(mintKeypair.secretKey))
    );
    console.log("   ✓ Saved to .keys/mint-keypair.json");
  }

  console.log(`   Mint Address: ${mintKeypair.publicKey.toString()}\n`);

  // Derive treasury PDA
  const [treasuryPda] = anchor.web3.PublicKey.findProgramAddressSync(
    [Buffer.from("treasury")],
    program.programId
  );

  console.log(`   Treasury PDA: ${treasuryPda.toString()}\n`);

  // Check if token is already initialized
  const mintInfo = await provider.connection.getAccountInfo(
    mintKeypair.publicKey
  );

  if (mintInfo) {
    console.log("ℹ️  Token already initialized");
    console.log(`   Mint: ${mintKeypair.publicKey.toString()}`);
    console.log(`   Treasury PDA: ${treasuryPda.toString()}\n`);
  } else {
    console.log("🚀 Initializing AIR Token...");

    try {
      const tx = await program.methods
        .initializeToken()
        .accountsPartial({
          mint: mintKeypair.publicKey,
          treasury: treasuryPda,
          mintAuthority: payer,
          payer: payer,
        })
        .signers([mintKeypair])
        .rpc();

      console.log(`   ✓ Transaction: ${tx}`);

      // Verify treasury balance
      const treasuryBalance = await provider.connection.getTokenAccountBalance(
        treasuryPda
      );
      console.log(
        `   ✓ Treasury PDA Balance: ${treasuryBalance.value.uiAmount?.toLocaleString()} AIR`
      );
      console.log(`   ✓ Mint Authority: REVOKED (no more minting possible)`);
    } catch (error: any) {
      console.error("❌ Token initialization failed:", error.message);
      throw error;
    }
  }

  // ============================================================
  // Step 2: Initialize Reward Config
  // ============================================================
  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("Step 2: Reward Config Initialization");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

  const [rewardConfigAddress] = anchor.web3.PublicKey.findProgramAddressSync(
    [Buffer.from("reward_config")],
    program.programId
  );

  // Check if reward config already exists
  const rewardConfigInfo = await provider.connection.getAccountInfo(
    rewardConfigAddress
  );

  if (rewardConfigInfo) {
    console.log("ℹ️  Reward Config already initialized");
    const config = await program.account.rewardConfig.fetch(
      rewardConfigAddress
    );
    console.log(`   Authority: ${config.authority.toString()}`);
    console.log(
      `   Initial Reward: ${
        config.initialReward.toNumber() / 10 ** 9
      } AIR per data`
    );
    console.log(
      `   Start Time: ${new Date(
        Number(config.startTimestamp) * 1000
      ).toISOString()}`
    );
    console.log(`   Halving Interval: 4 years\n`);
  } else {
    console.log("🚀 Initializing Reward Config...");
    console.log(
      `   Initial Reward: ${INITIAL_REWARD / 10 ** 9} AIR per data submission`
    );
    console.log(`   Halving Interval: 4 years (like Bitcoin)\n`);

    try {
      const tx = await program.methods
        .initializeRewardConfig(new anchor.BN(INITIAL_REWARD))
        .accountsPartial({
          treasury: treasuryPda,
          authority: payer,
        })
        .rpc();

      console.log(`   ✓ Transaction: ${tx}`);

      const config = await program.account.rewardConfig.fetch(
        rewardConfigAddress
      );
      console.log(
        `   ✓ Start Timestamp: ${new Date(
          Number(config.startTimestamp) * 1000
        ).toISOString()}`
      );
    } catch (error: any) {
      console.error("❌ Reward config initialization failed:", error.message);
      throw error;
    }
  }

  // ============================================================
  // Summary
  // ============================================================
  console.log("\n╔═══════════════════════════════════════════════════════════╗");
  console.log("║                  Migration Complete! ✅                   ║");
  console.log("╚═══════════════════════════════════════════════════════════╝\n");

  console.log("📝 Important Information (save these!):\n");
  console.log("┌─────────────────────────────────────────────────────────┐");
  console.log("│ BLOCKCHAIN INFO                                         │");
  console.log("├─────────────────────────────────────────────────────────┤");
  console.log(`│ Network:         ${provider.connection.rpcEndpoint.substring(0, 35).padEnd(35)} │`);
  console.log(`│ Program ID:      ${program.programId.toString().padEnd(35)} │`);
  console.log("└─────────────────────────────────────────────────────────┘\n");

  console.log("┌─────────────────────────────────────────────────────────┐");
  console.log("│ TOKEN INFO                                              │");
  console.log("├─────────────────────────────────────────────────────────┤");
  console.log(`│ Mint Address:    ${mintKeypair.publicKey.toString().padEnd(35)} │`);
  console.log(`│ Treasury PDA:    ${treasuryPda.toString().padEnd(35)} │`);
  console.log(`│ Total Supply:    ${(TOTAL_SUPPLY / 10 ** 9).toLocaleString().padEnd(35)} AIR │`);
  console.log("└─────────────────────────────────────────────────────────┘\n");

  console.log("┌─────────────────────────────────────────────────────────┐");
  console.log("│ REWARD CONFIG                                           │");
  console.log("├─────────────────────────────────────────────────────────┤");
  console.log(`│ Config Address:  ${rewardConfigAddress.toString().padEnd(35)} │`);
  console.log(`│ Initial Reward:  ${(INITIAL_REWARD / 10 ** 9).toString().padEnd(35)} AIR/data │`);
  console.log("│ Halving:         Every 4 years                          │");
  console.log("└─────────────────────────────────────────────────────────┘\n");

  console.log("⚠️  SECURITY NOTES:");
  console.log("   • Mint keypair saved at: .keys/mint-keypair.json");
  console.log("   • Add .keys/ to .gitignore (already configured)");
  console.log("   • Treasury is a PDA (Program Derived Address) - fully controlled by the program");
  console.log("   • Rewards are automatically distributed on data submission");
  console.log("   • Consider using Multisig for admin authority in production\n");

  console.log("📋 Next Steps:");
  console.log("   1. Save the addresses above to your .env or config file");
  console.log("   2. Users can now register devices: register_device()");
  console.log("   3. Anyone can submit data: submit_data() - rewards auto-distributed\n");
};
