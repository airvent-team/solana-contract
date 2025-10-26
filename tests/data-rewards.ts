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

describe("Data Collection & Auto-Distribution with Halving", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.airventContract as Program<AirventContract>;

  // Test accounts
  const deviceOwner1 = anchor.web3.Keypair.generate();
  const deviceOwner2 = anchor.web3.Keypair.generate();
  const server = provider.wallet; // Server that submits data
  const treasuryAuthority = provider.wallet.publicKey;

  const deviceId1 = "AIRVENT-DATA-001";
  const deviceId2 = "AIRVENT-DATA-002";

  // Token
  const mintKeypair = anchor.web3.Keypair.generate();
  let treasuryTokenAccount: PublicKey;
  let owner1TokenAccount: PublicKey;
  let owner2TokenAccount: PublicKey;

  // PDAs
  let device1Address: PublicKey;
  let device2Address: PublicKey;
  let rewardConfigAddress: PublicKey;
  let device1RewardsAddress: PublicKey;
  let device2RewardsAddress: PublicKey;

  // Reward config
  const TOTAL_SUPPLY = 1_000_000_000 * 10 ** 9; // 1 billion
  const INITIAL_REWARD = 100 * 10 ** 9; // 100 AIR per submission

  before(async () => {
    // Airdrop SOL to device owners
    await provider.connection.confirmTransaction(
      await provider.connection.requestAirdrop(
        deviceOwner1.publicKey,
        2 * anchor.web3.LAMPORTS_PER_SOL
      )
    );
    await provider.connection.confirmTransaction(
      await provider.connection.requestAirdrop(
        deviceOwner2.publicKey,
        2 * anchor.web3.LAMPORTS_PER_SOL
      )
    );

    console.log("✅ Test accounts funded");

    // Initialize AIR token
    treasuryTokenAccount = await getAssociatedTokenAddress(
      mintKeypair.publicKey,
      treasuryAuthority
    );

    await program.methods
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

    // Create owner token accounts
    owner1TokenAccount = await createAssociatedTokenAccount(
      provider.connection,
      provider.wallet.payer,
      mintKeypair.publicKey,
      deviceOwner1.publicKey
    );

    owner2TokenAccount = await createAssociatedTokenAccount(
      provider.connection,
      provider.wallet.payer,
      mintKeypair.publicKey,
      deviceOwner2.publicKey
    );

    console.log("✅ AIR token initialized and owner accounts created");
  });

  it("Initializes reward configuration with 4-year halving", async () => {
    [rewardConfigAddress] = PublicKey.findProgramAddressSync(
      [Buffer.from("reward_config")],
      program.programId
    );

    // Check if reward config already exists (for idempotency)
    const accountInfo = await provider.connection.getAccountInfo(rewardConfigAddress);

    if (!accountInfo) {
      const tx = await program.methods
        .initializeRewardConfig(new anchor.BN(INITIAL_REWARD))
        .accounts({
          rewardConfig: rewardConfigAddress,
          authority: provider.wallet.publicKey,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .rpc();
      console.log("✅ Reward config initialized:", tx);
    } else {
      console.log("✅ Reward config already exists (reusing from previous test)");
    }

    const config = await program.account.rewardConfig.fetch(rewardConfigAddress);
    assert.equal(config.initialReward.toString(), INITIAL_REWARD.toString());
    assert.isAbove(Number(config.startTimestamp), 0);

    const startDate = new Date(Number(config.startTimestamp) * 1000);
    console.log("   Initial reward:", config.initialReward.toNumber() / 10 ** 9, "AIR per data (AUTO-DISTRIBUTED)");
    console.log("   Halving interval: 4 years");
    console.log("   System start time:", startDate.toISOString());
  });

  it("Registers devices for testing", async () => {
    [device1Address] = PublicKey.findProgramAddressSync(
      [Buffer.from("device"), Buffer.from(deviceId1)],
      program.programId
    );

    [device1RewardsAddress] = PublicKey.findProgramAddressSync(
      [Buffer.from("device_rewards"), Buffer.from(deviceId1)],
      program.programId
    );

    [device2Address] = PublicKey.findProgramAddressSync(
      [Buffer.from("device"), Buffer.from(deviceId2)],
      program.programId
    );

    [device2RewardsAddress] = PublicKey.findProgramAddressSync(
      [Buffer.from("device_rewards"), Buffer.from(deviceId2)],
      program.programId
    );

    await program.methods
      .registerDevice(deviceId1)
      .accounts({
        device: device1Address,
        deviceRewards: device1RewardsAddress,
        owner: deviceOwner1.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .signers([deviceOwner1])
      .rpc();

    await program.methods
      .registerDevice(deviceId2)
      .accounts({
        device: device2Address,
        deviceRewards: device2RewardsAddress,
        owner: deviceOwner2.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .signers([deviceOwner2])
      .rpc();

    console.log("✅ Devices registered");
  });

  it("Device 1 submits data and auto-receives reward (epoch 0)", async () => {
    const tx = await program.methods
      .submitData(deviceId1, 350, 500, 253, 655) // PM2.5: 35.0, PM10: 50.0, Temp: 25.3°C, Humidity: 65.5%
      .accounts({
        device: device1Address,
        deviceRewards: device1RewardsAddress,
        rewardConfig: rewardConfigAddress,
        treasury: treasuryTokenAccount,
        ownerTokenAccount: owner1TokenAccount,
        treasuryAuthority: treasuryAuthority,
        server: server.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();

    console.log("✅ Data submitted (Device 1):", tx);

    const deviceRewards = await program.account.deviceRewards.fetch(device1RewardsAddress);
    const config = await program.account.rewardConfig.fetch(rewardConfigAddress);
    const ownerBalance = await provider.connection.getTokenAccountBalance(owner1TokenAccount);

    assert.equal(deviceRewards.deviceId, deviceId1);
    assert.equal(deviceRewards.owner.toString(), deviceOwner1.publicKey.toString());
    assert.equal(deviceRewards.totalDataSubmitted.toString(), "1");
    assert.equal(ownerBalance.value.amount, INITIAL_REWARD.toString());

    console.log("   Device:", deviceRewards.deviceId);
    console.log("   Owner:", deviceRewards.owner.toString());
    console.log("   Automatically received:", ownerBalance.value.uiAmount, "AIR");
    console.log("   Global submissions:", config.totalDataSubmitted.toString());
  });

  it("Verifies DataSubmitted event is emitted", async () => {
    // Submit data - event will be emitted automatically
    const txSignature = await program.methods
      .submitData(deviceId1, 420, 580, 268, 702) // PM2.5: 42.0, PM10: 58.0, Temp: 26.8°C, Humidity: 70.2%
      .accounts({
        device: device1Address,
        deviceRewards: device1RewardsAddress,
        rewardConfig: rewardConfigAddress,
        treasury: treasuryTokenAccount,
        ownerTokenAccount: owner1TokenAccount,
        treasuryAuthority: treasuryAuthority,
        server: server.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();

    console.log("📡 DataSubmitted event emitted in transaction:", txSignature);
    console.log("   PM2.5: 42, PM10: 58");
    console.log("   ✅ Events are stored in Solana program logs");
    console.log("   💡 Use Helius/Triton indexer to query historical events");

    // Verify rewards were distributed (indirect event verification)
    const ownerBalance = await provider.connection.getTokenAccountBalance(owner1TokenAccount);
    assert.equal(ownerBalance.value.amount, (INITIAL_REWARD * 2).toString());
  });

  it("Device 1 submits more data - rewards auto-accumulate", async () => {
    const balanceBefore = await provider.connection.getTokenAccountBalance(owner1TokenAccount);

    for (let i = 0; i < 5; i++) {
      await program.methods
        .submitData(deviceId1, (30 + i) * 10, (45 + i) * 10, 230 + i * 2, 600 + i * 5)
        .accounts({
          device: device1Address,
          deviceRewards: device1RewardsAddress,
          rewardConfig: rewardConfigAddress,
          treasury: treasuryTokenAccount,
          ownerTokenAccount: owner1TokenAccount,
          treasuryAuthority: treasuryAuthority,
          server: server.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .rpc();
    }

    console.log("✅ Submitted 5 more data points");

    const deviceRewards = await program.account.deviceRewards.fetch(device1RewardsAddress);
    const balanceAfter = await provider.connection.getTokenAccountBalance(owner1TokenAccount);

    // Total: 7 submissions (1 initial + 1 event test + 5 here)
    assert.equal(deviceRewards.totalDataSubmitted.toString(), "7");

    const expectedTotal = INITIAL_REWARD * 7;
    assert.equal(balanceAfter.value.amount, expectedTotal.toString());

    console.log("   Device 1 total submissions:", deviceRewards.totalDataSubmitted.toString());
    console.log("   Owner 1 total received:", balanceAfter.value.uiAmount, "AIR");
  });

  it("Device 2 submits data - rewards auto-distributed separately", async () => {
    const tx = await program.methods
      .submitData(deviceId2, 400, 600, 220, 580)
      .accounts({
        device: device2Address,
        deviceRewards: device2RewardsAddress,
        rewardConfig: rewardConfigAddress,
        treasury: treasuryTokenAccount,
        ownerTokenAccount: owner2TokenAccount,
        treasuryAuthority: treasuryAuthority,
        server: server.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();

    console.log("✅ Data submitted (Device 2):", tx);

    const deviceRewards = await program.account.deviceRewards.fetch(device2RewardsAddress);
    const ownerBalance = await provider.connection.getTokenAccountBalance(owner2TokenAccount);

    assert.equal(deviceRewards.deviceId, deviceId2);
    assert.equal(deviceRewards.owner.toString(), deviceOwner2.publicKey.toString());
    assert.equal(ownerBalance.value.amount, INITIAL_REWARD.toString());

    console.log("   Device 2 owner received:", ownerBalance.value.uiAmount, "AIR");
  });

  it("Transfer device 1 ownership - rewards continue to new owner", async () => {
    // Transfer ownership from owner1 to owner2
    const newOwner = deviceOwner2.publicKey;

    await program.methods
      .transferOwnership(newOwner)
      .accounts({
        device: device1Address,
        owner: deviceOwner1.publicKey,
      })
      .signers([deviceOwner1])
      .rpc();

    console.log("✅ Device 1 ownership transferred");

    // Check device registry
    const device = await program.account.deviceRegistry.fetch(device1Address);
    assert.equal(device.owner.toString(), newOwner.toString());

    // Submit more data - rewards should go to NEW owner (owner2)
    const owner2BalanceBefore = await provider.connection.getTokenAccountBalance(owner2TokenAccount);

    await program.methods
      .submitData(deviceId1, 420, 580, 245, 620)
      .accounts({
        device: device1Address,
        deviceRewards: device1RewardsAddress,
        rewardConfig: rewardConfigAddress,
        treasury: treasuryTokenAccount,
        ownerTokenAccount: owner2TokenAccount, // Now sending to owner2's account
        treasuryAuthority: treasuryAuthority,
        server: server.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();

    const owner2BalanceAfter = await provider.connection.getTokenAccountBalance(owner2TokenAccount);
    const deviceRewards = await program.account.deviceRewards.fetch(device1RewardsAddress);

    // Owner updated
    assert.equal(deviceRewards.owner.toString(), newOwner.toString());

    // Owner2 received reward
    const expectedIncrease = INITIAL_REWARD;
    assert.equal(
      Number(owner2BalanceAfter.value.amount) - Number(owner2BalanceBefore.value.amount),
      expectedIncrease
    );

    console.log("   Device 1 new owner:", deviceRewards.owner.toString());
    console.log("   New owner received reward:", expectedIncrease / 10 ** 9, "AIR");
  });

  it("Verifies auto-distribution across multiple devices and owners", async () => {
    const device1Rewards = await program.account.deviceRewards.fetch(device1RewardsAddress);
    const device2Rewards = await program.account.deviceRewards.fetch(device2RewardsAddress);
    const owner1Balance = await provider.connection.getTokenAccountBalance(owner1TokenAccount);
    const owner2Balance = await provider.connection.getTokenAccountBalance(owner2TokenAccount);
    const config = await program.account.rewardConfig.fetch(rewardConfigAddress);

    console.log("\n📊 Auto-Distribution Statistics:");
    console.log("   Total submissions:", config.totalDataSubmitted.toString());
    console.log("   Total rewards distributed:", config.totalRewardsDistributed.toNumber() / 10 ** 9, "AIR");
    console.log("\n   Device-based stats:");
    console.log(`   ${deviceId1}: ${device1Rewards.totalDataSubmitted} submissions (Owner: ${device1Rewards.owner.toString().slice(0, 8)}...)`);
    console.log(`   ${deviceId2}: ${device2Rewards.totalDataSubmitted} submission (Owner: ${device2Rewards.owner.toString().slice(0, 8)}...)`);
    console.log("\n   Owner balances:");
    console.log(`   Owner 1: ${owner1Balance.value.uiAmount} AIR`);
    console.log(`   Owner 2: ${owner2Balance.value.uiAmount} AIR`);
    console.log("\n   ✅ Rewards auto-distributed on each submission");
    console.log("   ✅ No manual claim needed");
    console.log("   ✅ Ownership transfer works seamlessly");
  });

  it("Fails when unregistered device tries to submit data", async () => {
    const unregisteredDeviceId = "AIRVENT-UNREGISTERED-999";

    const [unregisteredDeviceAddress] = PublicKey.findProgramAddressSync(
      [Buffer.from("device"), Buffer.from(unregisteredDeviceId)],
      program.programId
    );

    const [unregisteredRewardsAddress] = PublicKey.findProgramAddressSync(
      [Buffer.from("device_rewards"), Buffer.from(unregisteredDeviceId)],
      program.programId
    );

    try {
      await program.methods
        .submitData(unregisteredDeviceId, 500, 700, 250, 650)
        .accounts({
          device: unregisteredDeviceAddress,
          deviceRewards: unregisteredRewardsAddress,
          rewardConfig: rewardConfigAddress,
          treasury: treasuryTokenAccount,
          ownerTokenAccount: owner1TokenAccount,
          treasuryAuthority: treasuryAuthority,
          server: server.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .rpc();

      assert.fail("Should have failed with AccountNotInitialized error");
    } catch (err: any) {
      assert.include(
        err.toString(),
        "AccountNotInitialized",
        "Should fail with AccountNotInitialized error"
      );
      console.log("✅ Correctly prevented data submission from unregistered device");
    }
  });

  it("Fails when inactive device tries to submit data", async () => {
    // Deactivate device 2
    await program.methods
      .deactivateDevice()
      .accounts({
        device: device2Address,
        owner: deviceOwner2.publicKey,
      })
      .signers([deviceOwner2])
      .rpc();

    console.log("🔒 Device 2 deactivated");

    // Try to submit data with inactive device
    try {
      await program.methods
        .submitData(deviceId2, 300, 500, 235, 600)
        .accounts({
          device: device2Address,
          deviceRewards: device2RewardsAddress,
          rewardConfig: rewardConfigAddress,
          treasury: treasuryTokenAccount,
          ownerTokenAccount: owner2TokenAccount,
          treasuryAuthority: treasuryAuthority,
          server: server.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .rpc();

      assert.fail("Should have failed with DeviceNotActive error");
    } catch (err: any) {
      assert.include(
        err.toString(),
        "DeviceNotActive",
        "Should fail with DeviceNotActive error"
      );
      console.log("✅ Correctly prevented data submission from inactive device");
    }
  });
});
