import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { AirventContract } from "../target/types/airvent_contract";
import {
  TOKEN_PROGRAM_ID,
  getAssociatedTokenAddress,
  createAssociatedTokenAccount,
} from "@solana/spl-token";
import { PublicKey } from "@solana/web3.js";
import { assert } from "chai";

describe("E2E: IoT Reward System with Auto-Distribution", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.airventContract as Program<AirventContract>;

  // Accounts
  const deviceOwner = anchor.web3.Keypair.generate();

  const deviceId = "AIRVENT-FULL-001";
  const mintKeypair = anchor.web3.Keypair.generate();

  let treasuryPda: PublicKey;
  let ownerTokenAccount: PublicKey;
  let deviceAddress: PublicKey;
  let deviceRewardsAddress: PublicKey;
  let rewardConfigAddress: PublicKey;

  const TOTAL_SUPPLY = 1_000_000_000 * 10 ** 9; // 1 billion
  const INITIAL_REWARD = 0.1 * 10 ** 9; // 0.1 AIR per data

  before(async () => {
    // Fund device owner
    await provider.connection.confirmTransaction(
      await provider.connection.requestAirdrop(
        deviceOwner.publicKey,
        3 * anchor.web3.LAMPORTS_PER_SOL
      )
    );
    console.log("✅ Device owner funded");
  });

  it("1. Initializes AIR token with treasury PDA", async () => {
    // Derive treasury PDA
    [treasuryPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("treasury")],
      program.programId
    );

    // Derive reward config address (for later)
    [rewardConfigAddress] = PublicKey.findProgramAddressSync(
      [Buffer.from("reward_config")],
      program.programId
    );

    // Check if treasury already exists (from previous test suite)
    const treasuryInfo = await provider.connection.getAccountInfo(treasuryPda);

    if (treasuryInfo) {
      // Reuse existing treasury PDA from previous test
      console.log("✅ Reusing existing mint and treasury PDA from previous test");
      console.log("   Treasury PDA:", treasuryPda.toString());

      const balance = await provider.connection.getTokenAccountBalance(treasuryPda);
      console.log("   Treasury balance:", balance.value.uiAmount?.toLocaleString(), "AIR");
    } else {
      // Create new token
      const tx = await program.methods
        .initializeToken()
        .accounts({
          mint: mintKeypair.publicKey,
          treasury: treasuryPda,
          mintAuthority: provider.wallet.publicKey,
          payer: provider.wallet.publicKey,
          systemProgram: anchor.web3.SystemProgram.programId,
          tokenProgram: TOKEN_PROGRAM_ID,
          rent: anchor.web3.SYSVAR_RENT_PUBKEY,
        })
        .signers([mintKeypair])
        .rpc();

      console.log("✅ Token initialized");

      const balance = await provider.connection.getTokenAccountBalance(treasuryPda);
      assert.equal(balance.value.amount, TOTAL_SUPPLY.toString());
      console.log("   Treasury PDA:", balance.value.uiAmount?.toLocaleString(), "AIR");
    }
  });

  it("2. Initializes reward configuration", async () => {
    // Check if reward config already exists (from other test suites)
    const accountInfo = await provider.connection.getAccountInfo(rewardConfigAddress);

    if (!accountInfo) {
      // Only initialize if it doesn't exist
      await program.methods
        .initializeRewardConfig(new anchor.BN(INITIAL_REWARD))
        .accounts({
          rewardConfig: rewardConfigAddress,
          treasury: treasuryPda,
          authority: provider.wallet.publicKey,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .rpc();
      console.log("✅ Reward config initialized");
    } else {
      console.log("✅ Reward config already exists (reusing from previous test)");
    }

    console.log("   Initial reward:", INITIAL_REWARD / 10 ** 9, "AIR per data (AUTO-DISTRIBUTED)");
  });

  it("3. Registers IoT device", async () => {
    [deviceAddress] = PublicKey.findProgramAddressSync(
      [Buffer.from("device"), Buffer.from(deviceId)],
      program.programId
    );

    [deviceRewardsAddress] = PublicKey.findProgramAddressSync(
      [Buffer.from("device_rewards"), Buffer.from(deviceId)],
      program.programId
    );

    await program.methods
      .registerDevice(deviceId)
      .accounts({
        device: deviceAddress,
        deviceRewards: deviceRewardsAddress,
        owner: deviceOwner.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .signers([deviceOwner])
      .rpc();

    console.log("✅ Device registered");
    console.log("   Device ID:", deviceId);
    console.log("   Owner:", deviceOwner.publicKey.toString());
  });

  it("4. Creates owner token account", async () => {
    // Get mint from reward config
    const config = await program.account.rewardConfig.fetch(rewardConfigAddress);

    ownerTokenAccount = await createAssociatedTokenAccount(
      provider.connection,
      provider.wallet.payer,
      config.mint,
      deviceOwner.publicKey
    );

    console.log("✅ Owner token account created");
    console.log("   Account:", ownerTokenAccount.toString());
  });

  it("5. Device submits data and auto-receives rewards", async () => {
    // Submit 5 data points - rewards distributed automatically on each submission
    for (let i = 0; i < 5; i++) {
      await program.methods
        .submitData(deviceId, (25 + i) * 10, (40 + i) * 10, 250 + i * 3, 650 + i * 10) // Varying PM/temp/humidity
        .accounts({
          device: deviceAddress,
          deviceRewards: deviceRewardsAddress,
          rewardConfig: rewardConfigAddress,
          treasury: treasuryPda,
          ownerTokenAccount: ownerTokenAccount,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .rpc();
    }

    console.log("✅ Submitted 5 data points");

    // Verify rewards were automatically distributed
    const ownerBalance = await provider.connection.getTokenAccountBalance(ownerTokenAccount);
    const expectedRewards = INITIAL_REWARD * 5;

    assert.equal(ownerBalance.value.amount, expectedRewards.toString());
    console.log("   Automatically received:", ownerBalance.value.uiAmount, "AIR");

    // Verify device stats (no accumulated points, just stats)
    const deviceRewards = await program.account.deviceRewards.fetch(deviceRewardsAddress);
    assert.equal(deviceRewards.totalDataSubmitted.toString(), "5");
    console.log("   Device submissions:", deviceRewards.totalDataSubmitted.toString());
  });

  it("6. Device submits more data - rewards continue auto-distributing", async () => {
    const ownerBalanceBefore = await provider.connection.getTokenAccountBalance(ownerTokenAccount);

    // Submit 3 more data points
    for (let i = 0; i < 3; i++) {
      await program.methods
        .submitData(deviceId, (30 + i) * 10, (50 + i) * 10, 270 + i * 2, 680 + i * 5) // Varying PM/temp/humidity
        .accounts({
          device: deviceAddress,
          deviceRewards: deviceRewardsAddress,
          rewardConfig: rewardConfigAddress,
          treasury: treasuryPda,
          ownerTokenAccount: ownerTokenAccount,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .rpc();
    }

    console.log("✅ Submitted 3 more data points");

    // Verify rewards were added automatically
    const ownerBalanceAfter = await provider.connection.getTokenAccountBalance(ownerTokenAccount);
    const expectedNewRewards = INITIAL_REWARD * 3;
    const totalReceived = Number(ownerBalanceBefore.value.amount) + expectedNewRewards;

    assert.equal(ownerBalanceAfter.value.amount, totalReceived.toString());
    console.log("   Total owner balance:", ownerBalanceAfter.value.uiAmount, "AIR");
  });

  it("7. Verifies complete E2E flow with automatic distribution", async () => {
    const deviceRewards = await program.account.deviceRewards.fetch(deviceRewardsAddress);
    const ownerBalance = await provider.connection.getTokenAccountBalance(ownerTokenAccount);
    const treasuryBalance = await provider.connection.getTokenAccountBalance(treasuryPda);

    console.log("\n📊 E2E Test Results:");
    console.log("   Device total submissions:", deviceRewards.totalDataSubmitted.toString());
    console.log("   Owner auto-received balance:", ownerBalance.value.uiAmount, "AIR");
    console.log("   Treasury remaining:", treasuryBalance.value.uiAmount?.toLocaleString(), "AIR");

    // Verify this device submitted 8 times (5 + 3) and owner received 0.8 AIR automatically
    assert.equal(deviceRewards.totalDataSubmitted.toString(), "8", "Device should have 8 submissions");
    assert.equal(ownerBalance.value.amount, (0.8 * 10 ** 9).toString(), "Owner should have received 0.8 AIR");

    // Note: Treasury balance verification skipped since this test suite shares treasury with other tests

    console.log("\n✅ Complete E2E flow with automatic distribution verified!");
    console.log("   1. Token created with 1B supply");
    console.log("   2. Device registered to owner");
    console.log("   3. Data submitted → Rewards automatically distributed");
    console.log("   4. No manual claim needed → Instant AIR tokens");
    console.log("   5. Seamless user experience");
  });
});
