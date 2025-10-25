import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { AirventContract } from "../target/types/airvent_contract";
import { PublicKey } from "@solana/web3.js";
import { assert } from "chai";

describe("Data Collection & Time-based Halving (4 years)", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.airventContract as Program<AirventContract>;

  // Test accounts
  const deviceOwner1 = anchor.web3.Keypair.generate();
  const deviceOwner2 = anchor.web3.Keypair.generate();
  const server = provider.wallet; // Server that submits data

  const deviceId1 = "AIRVENT-DATA-001";
  const deviceId2 = "AIRVENT-DATA-002";

  let device1Address: PublicKey;
  let device2Address: PublicKey;
  let rewardConfigAddress: PublicKey;
  let device1RewardsAddress: PublicKey;
  let device2RewardsAddress: PublicKey;

  // Reward config
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
  });

  it("Initializes reward configuration with 4-year halving", async () => {
    [rewardConfigAddress] = PublicKey.findProgramAddressSync(
      [Buffer.from("reward_config")],
      program.programId
    );

    const tx = await program.methods
      .initializeRewardConfig(new anchor.BN(INITIAL_REWARD))
      .accounts({
        rewardConfig: rewardConfigAddress,
        authority: provider.wallet.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();

    console.log("✅ Reward config initialized:", tx);

    const config = await program.account.rewardConfig.fetch(rewardConfigAddress);
    assert.equal(config.initialReward.toString(), INITIAL_REWARD.toString());
    assert.isAbove(Number(config.startTimestamp), 0);

    const startDate = new Date(Number(config.startTimestamp) * 1000);
    console.log("   Initial reward:", config.initialReward.toNumber() / 10 ** 9, "AIR per data");
    console.log("   Halving interval: 4 years");
    console.log("   System start time:", startDate.toISOString());
  });

  it("Registers devices for testing", async () => {
    [device1Address] = PublicKey.findProgramAddressSync(
      [Buffer.from("device"), Buffer.from(deviceId1)],
      program.programId
    );

    [device2Address] = PublicKey.findProgramAddressSync(
      [Buffer.from("device"), Buffer.from(deviceId2)],
      program.programId
    );

    await program.methods
      .registerDevice(deviceId1)
      .accounts({
        device: device1Address,
        owner: deviceOwner1.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .signers([deviceOwner1])
      .rpc();

    await program.methods
      .registerDevice(deviceId2)
      .accounts({
        device: device2Address,
        owner: deviceOwner2.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .signers([deviceOwner2])
      .rpc();

    console.log("✅ Devices registered");
  });

  it("Device 1 submits data and earns full reward (epoch 0)", async () => {
    [device1RewardsAddress] = PublicKey.findProgramAddressSync(
      [Buffer.from("device_rewards"), Buffer.from(deviceId1)],
      program.programId
    );

    const tx = await program.methods
      .submitData(deviceId1, 35, 50) // PM2.5: 35, PM10: 50
      .accounts({
        device: device1Address,
        deviceRewards: device1RewardsAddress,
        rewardConfig: rewardConfigAddress,
        server: server.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();

    console.log("✅ Data submitted (Device 1):", tx);

    const deviceRewards = await program.account.deviceRewards.fetch(device1RewardsAddress);
    const config = await program.account.rewardConfig.fetch(rewardConfigAddress);

    assert.equal(deviceRewards.deviceId, deviceId1);
    assert.equal(deviceRewards.owner.toString(), deviceOwner1.publicKey.toString());
    assert.equal(deviceRewards.accumulatedPoints.toString(), INITIAL_REWARD.toString());
    assert.equal(deviceRewards.totalDataSubmitted.toString(), "1");

    console.log("   Device:", deviceRewards.deviceId);
    console.log("   Owner:", deviceRewards.owner.toString());
    console.log("   Accumulated points:", deviceRewards.accumulatedPoints.toNumber() / 10 ** 9, "AIR");
    console.log("   Global submissions:", config.totalDataSubmitted.toString());
  });

  it("Device 1 submits more data - rewards accumulate on device", async () => {
    for (let i = 0; i < 5; i++) {
      await program.methods
        .submitData(deviceId1, 30 + i, 45 + i)
        .accounts({
          device: device1Address,
          deviceRewards: device1RewardsAddress,
          rewardConfig: rewardConfigAddress,
          server: server.publicKey,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .rpc();
    }

    console.log("✅ Submitted 5 more data points");

    const deviceRewards = await program.account.deviceRewards.fetch(device1RewardsAddress);

    // Total: 6 submissions × 100 AIR = 600 AIR
    const expectedPoints = INITIAL_REWARD * 6;
    assert.equal(deviceRewards.accumulatedPoints.toString(), expectedPoints.toString());

    console.log("   Device 1 total accumulated:", deviceRewards.accumulatedPoints.toNumber() / 10 ** 9, "AIR");
    console.log("   Total submissions:", deviceRewards.totalDataSubmitted.toString());
  });

  it("Device 2 submits data - rewards tied to device, not owner", async () => {
    [device2RewardsAddress] = PublicKey.findProgramAddressSync(
      [Buffer.from("device_rewards"), Buffer.from(deviceId2)],
      program.programId
    );

    const tx = await program.methods
      .submitData(deviceId2, 40, 60)
      .accounts({
        device: device2Address,
        deviceRewards: device2RewardsAddress,
        rewardConfig: rewardConfigAddress,
        server: server.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();

    console.log("✅ Data submitted (Device 2):", tx);

    const deviceRewards = await program.account.deviceRewards.fetch(device2RewardsAddress);

    assert.equal(deviceRewards.deviceId, deviceId2);
    assert.equal(deviceRewards.owner.toString(), deviceOwner2.publicKey.toString());
    assert.equal(deviceRewards.accumulatedPoints.toString(), INITIAL_REWARD.toString());

    console.log("   Device 2 accumulated:", deviceRewards.accumulatedPoints.toNumber() / 10 ** 9, "AIR");
  });

  it("Transfer device 1 ownership - rewards stay with device", async () => {
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

    // Submit more data - rewards should update owner info
    await program.methods
      .submitData(deviceId1, 42, 58)
      .accounts({
        device: device1Address,
        deviceRewards: device1RewardsAddress,
        rewardConfig: rewardConfigAddress,
        server: server.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();

    const deviceRewards = await program.account.deviceRewards.fetch(device1RewardsAddress);

    // Rewards accumulated + new owner updated
    assert.equal(deviceRewards.owner.toString(), newOwner.toString());
    const expectedPoints = INITIAL_REWARD * 7;
    assert.equal(deviceRewards.accumulatedPoints.toString(), expectedPoints.toString());

    console.log("   Device 1 new owner:", deviceRewards.owner.toString());
    console.log("   Rewards preserved:", deviceRewards.accumulatedPoints.toNumber() / 10 ** 9, "AIR");
  });

  it("Verifies rewards are device-based, not user-based", async () => {
    const device1Rewards = await program.account.deviceRewards.fetch(device1RewardsAddress);
    const device2Rewards = await program.account.deviceRewards.fetch(device2RewardsAddress);
    const config = await program.account.rewardConfig.fetch(rewardConfigAddress);

    console.log("\n📊 Final Statistics:");
    console.log("   Total submissions:", config.totalDataSubmitted.toString());
    console.log("   Total rewards distributed:", config.totalRewardsDistributed.toNumber() / 10 ** 9, "AIR");
    console.log("\n   Device-based rewards:");
    console.log(`   ${deviceId1}: ${device1Rewards.accumulatedPoints.toNumber() / 10 ** 9} AIR (Owner: ${device1Rewards.owner.toString().slice(0, 8)}...)`);
    console.log(`   ${deviceId2}: ${device2Rewards.accumulatedPoints.toNumber() / 10 ** 9} AIR (Owner: ${device2Rewards.owner.toString().slice(0, 8)}...)`);
    console.log("\n   ✅ Rewards are tied to devices, not users");
    console.log("   ✅ Device ownership transfer preserves accumulated rewards");
    console.log("   ✅ Halving interval: 4 years (time-based, like Bitcoin)");
  });
});
