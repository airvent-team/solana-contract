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

describe("E2E: IoT Reward System", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.airventContract as Program<AirventContract>;

  // Accounts
  const treasuryAuthority = provider.wallet.publicKey;
  const server = provider.wallet;
  const deviceOwner = anchor.web3.Keypair.generate();

  const deviceId = "AIRVENT-FULL-001";
  const mintKeypair = anchor.web3.Keypair.generate();

  let treasuryTokenAccount: PublicKey;
  let ownerTokenAccount: PublicKey;
  let deviceAddress: PublicKey;
  let deviceRewardsAddress: PublicKey;
  let rewardConfigAddress: PublicKey;

  const TOTAL_SUPPLY = 1_000_000_000 * 10 ** 9; // 1 billion
  const INITIAL_REWARD = 100 * 10 ** 9; // 100 AIR per data

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

  it("1. Initializes AIR token with treasury", async () => {
    treasuryTokenAccount = await getAssociatedTokenAddress(
      mintKeypair.publicKey,
      treasuryAuthority
    );

    const tx = await program.methods
      .initializeToken()
      .accounts({
        mint: mintKeypair.publicKey,
        treasury: treasuryTokenAccount,
        treasuryAuthority: treasuryAuthority,
        mintAuthority: treasuryAuthority,
        payer: treasuryAuthority,
        systemProgram: anchor.web3.SystemProgram.programId,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: anchor.utils.token.ASSOCIATED_PROGRAM_ID,
        rent: anchor.web3.SYSVAR_RENT_PUBKEY,
      })
      .signers([mintKeypair])
      .rpc();

    console.log("✅ Token initialized");

    const balance = await provider.connection.getTokenAccountBalance(treasuryTokenAccount);
    assert.equal(balance.value.amount, TOTAL_SUPPLY.toString());
    console.log("   Treasury:", balance.value.uiAmount?.toLocaleString(), "AIR");
  });

  it("2. Initializes reward configuration", async () => {
    [rewardConfigAddress] = PublicKey.findProgramAddressSync(
      [Buffer.from("reward_config")],
      program.programId
    );

    // Check if reward config already exists (from other test suites)
    const accountInfo = await provider.connection.getAccountInfo(rewardConfigAddress);

    if (!accountInfo) {
      // Only initialize if it doesn't exist
      await program.methods
        .initializeRewardConfig(new anchor.BN(INITIAL_REWARD))
        .accounts({
          rewardConfig: rewardConfigAddress,
          authority: provider.wallet.publicKey,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .rpc();
      console.log("✅ Reward config initialized");
    } else {
      console.log("✅ Reward config already exists (reusing from previous test)");
    }

    console.log("   Initial reward:", INITIAL_REWARD / 10 ** 9, "AIR per data");
  });

  it("3. Registers IoT device", async () => {
    [deviceAddress] = PublicKey.findProgramAddressSync(
      [Buffer.from("device"), Buffer.from(deviceId)],
      program.programId
    );

    await program.methods
      .registerDevice(deviceId)
      .accounts({
        device: deviceAddress,
        owner: deviceOwner.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .signers([deviceOwner])
      .rpc();

    console.log("✅ Device registered");
    console.log("   Device ID:", deviceId);
    console.log("   Owner:", deviceOwner.publicKey.toString());
  });

  it("4. Device submits data and accumulates rewards", async () => {
    [deviceRewardsAddress] = PublicKey.findProgramAddressSync(
      [Buffer.from("device_rewards"), Buffer.from(deviceId)],
      program.programId
    );

    // Submit 5 data points
    for (let i = 0; i < 5; i++) {
      await program.methods
        .submitData(deviceId, 25 + i, 40 + i)
        .accounts({
          device: deviceAddress,
          deviceRewards: deviceRewardsAddress,
          rewardConfig: rewardConfigAddress,
          server: server.publicKey,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .rpc();
    }

    console.log("✅ Submitted 5 data points");

    const deviceRewards = await program.account.deviceRewards.fetch(deviceRewardsAddress);
    const expectedRewards = INITIAL_REWARD * 5;

    assert.equal(deviceRewards.accumulatedPoints.toString(), expectedRewards.toString());
    console.log("   Accumulated rewards:", deviceRewards.accumulatedPoints.toNumber() / 10 ** 9, "AIR");
  });

  it("5. Owner creates token account", async () => {
    ownerTokenAccount = await createAssociatedTokenAccount(
      provider.connection,
      provider.wallet.payer,
      mintKeypair.publicKey,
      deviceOwner.publicKey
    );

    console.log("✅ Owner token account created");
    console.log("   Account:", ownerTokenAccount.toString());
  });

  it("6. Owner claims rewards and receives AIR tokens", async () => {
    const deviceRewardsBefore = await program.account.deviceRewards.fetch(deviceRewardsAddress);
    const amountToClaim = deviceRewardsBefore.accumulatedPoints.toNumber();

    const tx = await program.methods
      .claimRewards(deviceId)
      .accounts({
        device: deviceAddress,
        deviceRewards: deviceRewardsAddress,
        treasury: treasuryTokenAccount,
        ownerTokenAccount: ownerTokenAccount,
        treasuryAuthority: treasuryAuthority,
        owner: deviceOwner.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([deviceOwner])
      .rpc();

    console.log("✅ Rewards claimed:", tx);

    // Verify owner received tokens
    const ownerBalance = await provider.connection.getTokenAccountBalance(ownerTokenAccount);
    assert.equal(ownerBalance.value.amount, amountToClaim.toString());
    console.log("   Owner received:", ownerBalance.value.uiAmount, "AIR");

    // Verify device rewards reset to 0
    const deviceRewardsAfter = await program.account.deviceRewards.fetch(deviceRewardsAddress);
    assert.equal(deviceRewardsAfter.accumulatedPoints.toString(), "0");
    console.log("   Device points reset to:", deviceRewardsAfter.accumulatedPoints.toString());

    // Verify treasury balance decreased
    const treasuryBalance = await provider.connection.getTokenAccountBalance(treasuryTokenAccount);
    const expectedTreasuryBalance = TOTAL_SUPPLY - amountToClaim;
    assert.equal(treasuryBalance.value.amount, expectedTreasuryBalance.toString());
    console.log("   Treasury balance:", treasuryBalance.value.uiAmount?.toLocaleString(), "AIR");
  });

  it("7. Device submits more data after claim", async () => {
    // Submit 3 more data points
    for (let i = 0; i < 3; i++) {
      await program.methods
        .submitData(deviceId, 30 + i, 50 + i)
        .accounts({
          device: deviceAddress,
          deviceRewards: deviceRewardsAddress,
          rewardConfig: rewardConfigAddress,
          server: server.publicKey,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .rpc();
    }

    console.log("✅ Submitted 3 more data points");

    const deviceRewards = await program.account.deviceRewards.fetch(deviceRewardsAddress);
    const expectedNewRewards = INITIAL_REWARD * 3;

    assert.equal(deviceRewards.accumulatedPoints.toString(), expectedNewRewards.toString());
    console.log("   New accumulated rewards:", deviceRewards.accumulatedPoints.toNumber() / 10 ** 9, "AIR");
  });

  it("8. Owner claims again", async () => {
    const ownerBalanceBefore = await provider.connection.getTokenAccountBalance(ownerTokenAccount);
    const deviceRewardsBefore = await program.account.deviceRewards.fetch(deviceRewardsAddress);

    await program.methods
      .claimRewards(deviceId)
      .accounts({
        device: deviceAddress,
        deviceRewards: deviceRewardsAddress,
        treasury: treasuryTokenAccount,
        ownerTokenAccount: ownerTokenAccount,
        treasuryAuthority: treasuryAuthority,
        owner: deviceOwner.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([deviceOwner])
      .rpc();

    console.log("✅ Second claim successful");

    const ownerBalanceAfter = await provider.connection.getTokenAccountBalance(ownerTokenAccount);
    const totalReceived =
      Number(ownerBalanceBefore.value.amount) + Number(deviceRewardsBefore.accumulatedPoints);

    assert.equal(ownerBalanceAfter.value.amount, totalReceived.toString());
    console.log("   Total owner balance:", ownerBalanceAfter.value.uiAmount, "AIR");
  });

  it("9. Verifies complete flow statistics", async () => {
    const deviceRewards = await program.account.deviceRewards.fetch(deviceRewardsAddress);
    const ownerBalance = await provider.connection.getTokenAccountBalance(ownerTokenAccount);
    const treasuryBalance = await provider.connection.getTokenAccountBalance(treasuryTokenAccount);

    console.log("\n📊 E2E Test Results:");
    console.log("   Device total submissions:", deviceRewards.totalDataSubmitted.toString());
    console.log("   Device pending rewards:", deviceRewards.accumulatedPoints.toNumber() / 10 ** 9, "AIR");
    console.log("   Owner claimed balance:", ownerBalance.value.uiAmount, "AIR");
    console.log("   Treasury remaining:", treasuryBalance.value.uiAmount?.toLocaleString(), "AIR");

    // Verify this device submitted 8 times (5 + 3) and owner received 800 AIR
    assert.equal(deviceRewards.totalDataSubmitted.toString(), "8", "Device should have 8 submissions");
    assert.equal(deviceRewards.accumulatedPoints.toString(), "0", "Device should have 0 pending rewards after claims");
    assert.equal(ownerBalance.value.amount, (800 * 10 ** 9).toString(), "Owner should have received 800 AIR");

    // Verify treasury decreased by 800 AIR
    const expectedTreasuryBalance = TOTAL_SUPPLY - (800 * 10 ** 9);
    assert.equal(treasuryBalance.value.amount, expectedTreasuryBalance.toString(), "Treasury should have distributed 800 AIR");

    console.log("\n✅ Complete E2E flow verified!");
    console.log("   1. Token created with 1B supply");
    console.log("   2. Device registered to owner");
    console.log("   3. Data submitted → Rewards accumulated");
    console.log("   4. Owner claimed → AIR tokens received");
    console.log("   5. Rewards reset → Can accumulate again");
  });
});
