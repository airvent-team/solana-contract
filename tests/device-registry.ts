import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { AirventContract } from "../target/types/airvent_contract";
import { PublicKey } from "@solana/web3.js";
import { assert } from "chai";

describe("Device Registry - IoT Device Management", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.airventContract as Program<AirventContract>;

  // Test users
  const owner1 = anchor.web3.Keypair.generate();
  const owner2 = anchor.web3.Keypair.generate();
  const newOwner = anchor.web3.Keypair.generate();

  // Test device IDs
  const deviceId1 = "AIRVENT-SN-001";
  const deviceId2 = "AIRVENT-SN-002";
  const deviceId3 = "AIRVENT-SN-003";

  let device1Address: PublicKey;
  let device2Address: PublicKey;
  let device3Address: PublicKey;

  before(async () => {
    // Airdrop SOL to test wallets
    const airdropAmount = 2 * anchor.web3.LAMPORTS_PER_SOL;

    await provider.connection.confirmTransaction(
      await provider.connection.requestAirdrop(owner1.publicKey, airdropAmount)
    );
    await provider.connection.confirmTransaction(
      await provider.connection.requestAirdrop(owner2.publicKey, airdropAmount)
    );
    await provider.connection.confirmTransaction(
      await provider.connection.requestAirdrop(newOwner.publicKey, airdropAmount)
    );

    console.log("✅ Test wallets funded");
    console.log("   Owner1:", owner1.publicKey.toString());
    console.log("   Owner2:", owner2.publicKey.toString());
    console.log("   NewOwner:", newOwner.publicKey.toString());
  });

  it("Registers device 1 with owner 1", async () => {
    // Derive PDA for device account
    [device1Address] = PublicKey.findProgramAddressSync(
      [Buffer.from("device"), Buffer.from(deviceId1)],
      program.programId
    );

    const tx = await program.methods
      .registerDevice(deviceId1)
      .accounts({
        device: device1Address,
        owner: owner1.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .signers([owner1])
      .rpc();

    console.log("✅ Device 1 registered:", tx);

    // Fetch and verify device account
    const deviceAccount = await program.account.deviceRegistry.fetch(device1Address);

    assert.equal(deviceAccount.deviceId, deviceId1);
    assert.equal(deviceAccount.owner.toString(), owner1.publicKey.toString());
    assert.isTrue(deviceAccount.isActive);
    assert.isAbove(Number(deviceAccount.registeredAt), 0);

    console.log("   Device ID:", deviceAccount.deviceId);
    console.log("   Owner:", deviceAccount.owner.toString());
    console.log("   Active:", deviceAccount.isActive);
    console.log("   Registered at:", new Date(deviceAccount.registeredAt * 1000).toISOString());
  });

  it("Registers device 2 with owner 2", async () => {
    [device2Address] = PublicKey.findProgramAddressSync(
      [Buffer.from("device"), Buffer.from(deviceId2)],
      program.programId
    );

    const tx = await program.methods
      .registerDevice(deviceId2)
      .accounts({
        device: device2Address,
        owner: owner2.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .signers([owner2])
      .rpc();

    console.log("✅ Device 2 registered:", tx);

    const deviceAccount = await program.account.deviceRegistry.fetch(device2Address);
    assert.equal(deviceAccount.deviceId, deviceId2);
    assert.equal(deviceAccount.owner.toString(), owner2.publicKey.toString());
  });

  it("Fails to register the same device twice", async () => {
    try {
      await program.methods
        .registerDevice(deviceId1)
        .accounts({
          device: device1Address,
          owner: owner1.publicKey,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .signers([owner1])
        .rpc();

      assert.fail("Should have failed to register duplicate device");
    } catch (error) {
      console.log("✅ Correctly prevented duplicate registration");
      assert.include(error.toString(), "already in use");
    }
  });

  it("Transfers device 1 ownership from owner1 to newOwner", async () => {
    const tx = await program.methods
      .transferOwnership(newOwner.publicKey)
      .accounts({
        device: device1Address,
        owner: owner1.publicKey,
      })
      .signers([owner1])
      .rpc();

    console.log("✅ Ownership transferred:", tx);

    // Verify DeviceRegistry ownership changed
    const deviceAccount = await program.account.deviceRegistry.fetch(device1Address);
    assert.equal(deviceAccount.owner.toString(), newOwner.publicKey.toString());
    console.log("   Old owner:", owner1.publicKey.toString());
    console.log("   New owner:", newOwner.publicKey.toString());

    // Verify DeviceRewards ownership also changed
    const [deviceRewardsAddress] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("device_rewards"), Buffer.from(deviceId1)],
      program.programId
    );
    const deviceRewards = await program.account.deviceRewards.fetch(deviceRewardsAddress);
    assert.equal(deviceRewards.owner.toString(), newOwner.publicKey.toString());
    console.log("   ✅ DeviceRewards owner also updated to:", newOwner.publicKey.toString());
  });

  it("Fails when non-owner tries to transfer ownership", async () => {
    try {
      await program.methods
        .transferOwnership(owner1.publicKey)
        .accounts({
          device: device1Address,
          owner: owner2.publicKey, // Wrong owner!
        })
        .signers([owner2])
        .rpc();

      assert.fail("Should have failed - unauthorized transfer");
    } catch (error) {
      console.log("✅ Correctly prevented unauthorized transfer");
      assert.include(error.toString(), "Unauthorized");
    }
  });

  it("New owner can transfer device back to original owner", async () => {
    const tx = await program.methods
      .transferOwnership(owner1.publicKey)
      .accounts({
        device: device1Address,
        owner: newOwner.publicKey,
      })
      .signers([newOwner])
      .rpc();

    console.log("✅ Ownership transferred back:", tx);

    const deviceAccount = await program.account.deviceRegistry.fetch(device1Address);
    assert.equal(deviceAccount.owner.toString(), owner1.publicKey.toString());
  });

  it("Owner can deactivate their device", async () => {
    const tx = await program.methods
      .deactivateDevice()
      .accounts({
        device: device1Address,
        owner: owner1.publicKey,
      })
      .signers([owner1])
      .rpc();

    console.log("✅ Device deactivated:", tx);

    const deviceAccount = await program.account.deviceRegistry.fetch(device1Address);
    assert.isFalse(deviceAccount.isActive);
    console.log("   Device active status:", deviceAccount.isActive);
  });

  it("Fails when non-owner tries to deactivate device", async () => {
    try {
      await program.methods
        .deactivateDevice()
        .accounts({
          device: device2Address,
          owner: owner1.publicKey, // Wrong owner!
        })
        .signers([owner1])
        .rpc();

      assert.fail("Should have failed - unauthorized deactivation");
    } catch (error) {
      console.log("✅ Correctly prevented unauthorized deactivation");
      assert.include(error.toString(), "Unauthorized");
    }
  });

  it("Registers device 3 and verifies all devices are independent", async () => {
    [device3Address] = PublicKey.findProgramAddressSync(
      [Buffer.from("device"), Buffer.from(deviceId3)],
      program.programId
    );

    await program.methods
      .registerDevice(deviceId3)
      .accounts({
        device: device3Address,
        owner: owner1.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .signers([owner1])
      .rpc();

    console.log("✅ Device 3 registered");

    // Verify all three devices
    const device1 = await program.account.deviceRegistry.fetch(device1Address);
    const device2 = await program.account.deviceRegistry.fetch(device2Address);
    const device3 = await program.account.deviceRegistry.fetch(device3Address);

    console.log("\n📊 All registered devices:");
    console.log(`   Device 1: ${device1.deviceId} | Owner: ${device1.owner.toString().slice(0, 8)}... | Active: ${device1.isActive}`);
    console.log(`   Device 2: ${device2.deviceId} | Owner: ${device2.owner.toString().slice(0, 8)}... | Active: ${device2.isActive}`);
    console.log(`   Device 3: ${device3.deviceId} | Owner: ${device3.owner.toString().slice(0, 8)}... | Active: ${device3.isActive}`);

    assert.equal(device1.deviceId, deviceId1);
    assert.equal(device2.deviceId, deviceId2);
    assert.equal(device3.deviceId, deviceId3);
  });
});
