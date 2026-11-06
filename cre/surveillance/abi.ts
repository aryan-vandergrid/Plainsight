import { parseAbi } from "viem";

export const VAULT_ABI = parseAbi([
  "function poolKey(bytes32 id) view returns ((address currency0, address currency1, uint24 fee, int24 tickSpacing, address hooks))",
  "function status(bytes32 id) view returns ((uint256 usdcInWall, uint256 usdcUnplaced, uint256 tokensBought, uint64 lockedUntil, uint64 nextRungAt, uint8 rungsPlaced, uint8 rungCount))",
]);

export const HOOK_ABI = parseAbi([
  "function stats(bytes32 id) view returns ((uint256 realVolume, uint256 fakeVolume, uint256 roundTrips, uint256 penaltyUsdc, uint256 penaltyToken, uint256 insiderSells, uint256 insiderFeeVolume))",
  "function paused(bytes32 id) view returns (bool)",
  "function currentDay(bytes32 id) view returns (uint256)",
]);

export const FLAGS_ABI = parseAbi([
  "function isFlagged(bytes32 tokenId, address wallet) view returns (bool)",
  "function reportsOf(bytes32 tokenId) view returns ((uint16 day, bytes32 hash, string uri, uint64 at)[])",
]);

export const POOL_KEY = [
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
