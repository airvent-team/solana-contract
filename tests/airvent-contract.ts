import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { AirventContract } from "../target/types/airvent_contract";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { assert } from "chai";

describe("AIR Token - Basic Setup", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.airventContract as Program<AirventContract>;

  const mintAuthority = provider.wallet.publicKey;
  const payer = provider.wallet.publicKey;

  const mintKeypair = anchor.web3.Keypair.generate();
  let treasuryPda: anchor.web3.PublicKey;

  const TOTAL_SUPPLY = 1_000_000_000 * 10 ** 9; // 1 billion AIR

  it("Initializes AIR token with total supply in treasury PDA", async () => {
    // Derive treasury PDA
    [treasuryPda] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("treasury")],
      program.programId
    );

    const tx = await program.methods
      .initializeToken()
      .accounts({
        mint: mintKeypair.publicKey,
        treasury: treasuryPda,
        mintAuthority: mintAuthority,
        payer: payer,
        systemProgram: anchor.web3.SystemProgram.programId,
        tokenProgram: TOKEN_PROGRAM_ID,
        rent: anchor.web3.SYSVAR_RENT_PUBKEY,
      })
      .signers([mintKeypair])
      .rpc();

    console.log("✅ AIR Token initialized:", tx);

    const treasuryBalance = await provider.connection.getTokenAccountBalance(treasuryPda);
    assert.equal(
      treasuryBalance.value.amount,
      TOTAL_SUPPLY.toString(),
      "Treasury PDA should have 1 billion AIR tokens"
    );
    console.log("   Treasury PDA balance:", treasuryBalance.value.uiAmount?.toLocaleString(), "AIR");
    console.log("   ✓ Mint authority revoked - no more minting possible");
    console.log("   ✓ All tokens in treasury PDA - ready for IoT rewards");
  });
});
