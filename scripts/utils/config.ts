/**
 * Solana CLI Configuration Utilities
 *
 * Reads configuration from ~/.config/solana/cli/config.yml
 * to automatically use the same network and keypair as Solana CLI
 */

import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import * as anchor from "@coral-xyz/anchor";
import { Connection } from "@solana/web3.js";

export interface SolanaConfig {
  rpcUrl: string;
  keypairPath: string;
  wallet: anchor.Wallet;
  connection: Connection;
}

/**
 * Load Solana CLI configuration
 * Reads ~/.config/solana/cli/config.yml and creates configured connection + wallet
 */
export function loadSolanaConfig(): SolanaConfig {
  const configPath = path.join(os.homedir(), ".config/solana/cli/config.yml");

  if (!fs.existsSync(configPath)) {
    throw new Error(
      `Solana CLI config not found at ${configPath}\n` +
      `Run 'solana config get' to check your configuration.`
    );
  }

  const configContent = fs.readFileSync(configPath, "utf-8");

  // Parse RPC URL
  const rpcUrlMatch = configContent.match(/json_rpc_url: (.+)/);
  const rpcUrl = rpcUrlMatch
    ? rpcUrlMatch[1].trim()
    : "http://localhost:8899";

  // Parse keypair path
  const keypairMatch = configContent.match(/keypair_path: (.+)/);
  const keypairPath = keypairMatch
    ? keypairMatch[1].trim()
    : path.join(os.homedir(), ".config/solana/id.json");

  if (!fs.existsSync(keypairPath)) {
    throw new Error(
      `Keypair not found at ${keypairPath}\n` +
      `Generate a keypair with 'solana-keygen new'`
    );
  }

  // Load keypair
  const walletKeypair = anchor.web3.Keypair.fromSecretKey(
    new Uint8Array(JSON.parse(fs.readFileSync(keypairPath, "utf-8")))
  );

  const wallet = new anchor.Wallet(walletKeypair);
  const connection = new Connection(rpcUrl, "confirmed");

  return {
    rpcUrl,
    keypairPath,
    wallet,
    connection,
  };
}

/**
 * Get network name from RPC URL for display purposes
 */
export function getNetworkName(rpcUrl: string): string {
  if (rpcUrl.includes("localhost") || rpcUrl.includes("127.0.0.1")) {
    return "Localnet";
  } else if (rpcUrl.includes("devnet")) {
    return "Devnet";
  } else if (rpcUrl.includes("testnet")) {
    return "Testnet";
  } else if (rpcUrl.includes("mainnet")) {
    return "Mainnet-Beta";
  } else {
    return "Custom";
  }
}
