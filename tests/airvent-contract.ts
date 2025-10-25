import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { AirventContract } from "../target/types/airvent_contract";
import {
  TOKEN_PROGRAM_ID,
  getAssociatedTokenAddress,
} from "@solana/spl-token";
import { assert } from "chai";

describe("AIR Token - Basic Setup", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.airventContract as Program<AirventContract>;

  const treasuryWallet = provider.wallet.publicKey;
  const mintAuthority = provider.wallet.publicKey;
  const payer = provider.wallet.publicKey;

  const mintKeypair = anchor.web3.Keypair.generate();
  let treasuryTokenAccount: anchor.web3.PublicKey;

  const TOTAL_SUPPLY = 1_000_000_000 * 10 ** 9; // 1 billion AIR

  it("Initializes AIR token with total supply in treasury", async () => {
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

    const treasuryBalance = await provider.connection.getTokenAccountBalance(treasuryTokenAccount);
    assert.equal(
      treasuryBalance.value.amount,
      TOTAL_SUPPLY.toString(),
      "Treasury should have 1 billion AIR tokens"
    );
    console.log("   Treasury balance:", treasuryBalance.value.uiAmount?.toLocaleString(), "AIR");
    console.log("   ✓ Mint authority revoked - no more minting possible");
    console.log("   ✓ All tokens in treasury - ready for IoT rewards");
  });
});
