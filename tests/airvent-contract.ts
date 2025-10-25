import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { AirventContract } from "../target/types/airvent_contract";
import {
  TOKEN_PROGRAM_ID,
  getAssociatedTokenAddress,
  createAssociatedTokenAccount,
  getMint,
} from "@solana/spl-token";
import { assert } from "chai";

describe("AIR Token - IoT Reward Economy", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.airventContract as Program<AirventContract>;

  // Treasury will hold the total supply
  const treasuryWallet = provider.wallet.publicKey;
  const mintAuthority = provider.wallet.publicKey;
  const payer = provider.wallet.publicKey;

  const mintKeypair = anchor.web3.Keypair.generate();

  let treasuryTokenAccount: anchor.web3.PublicKey;
  let user1TokenAccount: anchor.web3.PublicKey;
  let user2TokenAccount: anchor.web3.PublicKey;

  const user1 = anchor.web3.Keypair.generate();
  const user2 = anchor.web3.Keypair.generate();

  const TOTAL_SUPPLY = 1_000_000_000 * 10 ** 9; // 1 billion AIR

  it("Initializes AIR token with total supply in treasury", async () => {
    // Get the treasury ATA address (will be created by program)
    treasuryTokenAccount = await getAssociatedTokenAddress(
      mintKeypair.publicKey,
      treasuryWallet
    );

    const tx = await program.methods
      .initializeToken()
      .accounts({
        mint: mintKeypair.publicKey,
        treasury: treasuryTokenAccount,
        treasuryAuthority: treasuryWallet,
        mintAuthority: mintAuthority,
        payer: payer,
        systemProgram: anchor.web3.SystemProgram.programId,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: anchor.utils.token.ASSOCIATED_PROGRAM_ID,
        rent: anchor.web3.SYSVAR_RENT_PUBKEY,
      })
      .signers([mintKeypair])
      .rpc();

    console.log("✅ AIR Token initialized:", tx);

    // Verify treasury has total supply
    const treasuryBalance = await provider.connection.getTokenAccountBalance(treasuryTokenAccount);
    assert.equal(
      treasuryBalance.value.amount,
      TOTAL_SUPPLY.toString(),
      "Treasury should have 1 billion AIR tokens"
    );
    console.log("   Treasury balance:", treasuryBalance.value.uiAmount?.toLocaleString(), "AIR");

    // Verify mint authority is removed
    const mintInfo = await getMint(
      provider.connection,
      mintKeypair.publicKey,
      "confirmed",
      TOKEN_PROGRAM_ID
    );
    assert.isNull(mintInfo.mintAuthority, "Mint authority should be revoked");
    console.log("   ✓ Mint authority revoked - no more minting possible");
  });

  it("Creates token accounts for users (device owners)", async () => {
    // Airdrop SOL to users for testing
    await provider.connection.confirmTransaction(
      await provider.connection.requestAirdrop(user1.publicKey, 1 * anchor.web3.LAMPORTS_PER_SOL)
    );
    await provider.connection.confirmTransaction(
      await provider.connection.requestAirdrop(user2.publicKey, 1 * anchor.web3.LAMPORTS_PER_SOL)
    );

    user1TokenAccount = await createAssociatedTokenAccount(
      provider.connection,
      provider.wallet.payer,
      mintKeypair.publicKey,
      user1.publicKey
    );

    user2TokenAccount = await createAssociatedTokenAccount(
      provider.connection,
      provider.wallet.payer,
      mintKeypair.publicKey,
      user2.publicKey
    );

    console.log("✅ User token accounts created");
    console.log("   User1:", user1TokenAccount.toString());
    console.log("   User2:", user2TokenAccount.toString());
  });

  it("Distributes rewards from treasury to user1 (simulating claim)", async () => {
    // Simulate: User1 has accumulated 1000 points → claims 1000 AIR tokens
    const rewardAmount = 1_000 * 10 ** 9;

    const tx = await program.methods
      .transferTokens(new anchor.BN(rewardAmount))
      .accounts({
        from: treasuryTokenAccount,
        to: user1TokenAccount,
        mint: mintKeypair.publicKey,
        authority: treasuryWallet,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .rpc();

    console.log("✅ Reward claimed:", tx);

    const user1Balance = await provider.connection.getTokenAccountBalance(user1TokenAccount);
    assert.equal(
      user1Balance.value.amount,
      rewardAmount.toString(),
      "User1 should have 1,000 AIR tokens"
    );
    console.log("   User1 balance:", user1Balance.value.uiAmount, "AIR");
  });

  it("Distributes rewards to user2 (simulating another claim)", async () => {
    const rewardAmount = 500 * 10 ** 9; // 500 AIR

    const tx = await program.methods
      .transferTokens(new anchor.BN(rewardAmount))
      .accounts({
        from: treasuryTokenAccount,
        to: user2TokenAccount,
        mint: mintKeypair.publicKey,
        authority: treasuryWallet,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .rpc();

    console.log("✅ Reward claimed:", tx);

    const user2Balance = await provider.connection.getTokenAccountBalance(user2TokenAccount);
    assert.equal(
      user2Balance.value.amount,
      rewardAmount.toString(),
      "User2 should have 500 AIR tokens"
    );
    console.log("   User2 balance:", user2Balance.value.uiAmount, "AIR");
  });

  it("User can transfer tokens to another user", async () => {
    const transferAmount = 200 * 10 ** 9; // 200 AIR

    const tx = await program.methods
      .transferTokens(new anchor.BN(transferAmount))
      .accounts({
        from: user1TokenAccount,
        to: user2TokenAccount,
        mint: mintKeypair.publicKey,
        authority: user1.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([user1])
      .rpc();

    console.log("✅ User-to-user transfer:", tx);

    const user1Balance = await provider.connection.getTokenAccountBalance(user1TokenAccount);
    const user2Balance = await provider.connection.getTokenAccountBalance(user2TokenAccount);

    assert.equal(user1Balance.value.amount, (800 * 10 ** 9).toString());
    assert.equal(user2Balance.value.amount, (700 * 10 ** 9).toString());

    console.log("   User1 balance:", user1Balance.value.uiAmount, "AIR");
    console.log("   User2 balance:", user2Balance.value.uiAmount, "AIR");
  });

  it("Verifies final treasury balance", async () => {
    const treasuryBalance = await provider.connection.getTokenAccountBalance(treasuryTokenAccount);

    // Treasury should have: 1B - 1000 - 500 = 999,998,500
    const expectedBalance = TOTAL_SUPPLY - (1_000 * 10 ** 9) - (500 * 10 ** 9);
    assert.equal(treasuryBalance.value.amount, expectedBalance.toString());

    console.log("✅ Treasury balance:", treasuryBalance.value.uiAmount?.toLocaleString(), "AIR");
    console.log("   Total distributed:", ((1_000 + 500)).toLocaleString(), "AIR");
  });
});
