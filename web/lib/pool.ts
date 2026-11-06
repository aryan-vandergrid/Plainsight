import { parseAbiItem, type Address, type Hex } from "viem";

export const Q192 = 1n << 192n;

export const swapEvent = parseAbiItem(
  "event Swap(bytes32 indexed id, address indexed sender, int128 amount0, int128 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick, uint24 fee)",
);
export const poolOpenedEvent = parseAbiItem("event PoolOpened(bytes32 indexed id, bytes32 indexed poolId, uint256 clearingPriceQ96, uint160 sqrtPriceX96, int24 tick)");

export function sqrtToUsd(sqrtP: bigint, tokenIs0: boolean, tokenDecimals: number): number {
  if (sqrtP === 0n) return 0;
  const scale = 10n ** BigInt(tokenDecimals);
  const units = tokenIs0 ? (sqrtP * sqrtP * scale) / Q192 : (Q192 * scale) / (sqrtP * sqrtP);
  return Number(units) / 1e6;
}

export type PricePoint = { block: bigint; usd: number; volume: bigint; tx?: `0x${string}` };

export type PoolKeyT = { currency0: Address; currency1: Address; fee: number; tickSpacing: number; hooks: Address };

export { keccak256, encodeAbiParameters } from "viem";
export const poolKeyAbi = [
  {
    type: "tuple",
    components: [
      { name: "currency0", type: "address" },
      { name: "currency1", type: "address" },
      { name: "fee", type: "uint24" },
      { name: "tickSpacing", type: "int24" },
      { name: "hooks", type: "address" },
    ],
  },
] as const;

export type Compare = { label?: string; token?: Address; poolId?: Hex };
