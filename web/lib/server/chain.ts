import "server-only";
import { createPublicClient, http, type PublicClient } from "viem";
import { sepolia } from "viem/chains";

const url = process.env.SEPOLIA_RPC_URL || process.env.NEXT_PUBLIC_SEPOLIA_RPC_URL || "https://sepolia.gateway.tenderly.co";

let client: PublicClient | undefined;
export function chain(): PublicClient {
  client ??= createPublicClient({ chain: sepolia, batch: { multicall: true }, transport: http(url, { retryCount: 4 }) }) as PublicClient;
  return client;
}
