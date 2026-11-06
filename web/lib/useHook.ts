"use client";

import { useQuery } from "@tanstack/react-query";
import { keccak256, parseAbiItem, toBytes, type Hex } from "viem";
import { usePublicClient, useReadContract, useReadContracts } from "wagmi";
import { sepolia } from "wagmi/chains";
import { addresses } from "./addresses";
import { greenshoeVaultAbi, plainsightHookAbi } from "./abis";
import { getLogsChunkedRaw } from "./logs";
import { POLL_MS } from "./useAuction";

const roundTripEvent = parseAbiItem("event RoundTripFlagged(bytes32 indexed id, address indexed trader, uint256 volumeUsdc, uint256 penalty, bool penaltyInUsdc)");
const insiderEvent = parseAbiItem("event InsiderFeeCharged(bytes32 indexed id, address indexed trader, uint256 volumeUsdc, uint24 feePips)");
const pausedEvent = parseAbiItem("event Paused(bytes32 indexed id, bytes32 indexed reasonCode, string note)");
const unpausedEvent = parseAbiItem("event Unpaused(bytes32 indexed id)");
const rungEvent = parseAbiItem("event RungPlaced(bytes32 indexed id, uint8 index, int24 tickLower, int24 tickUpper, uint128 liquidity, uint256 usdc)");
const openedEvent = parseAbiItem("event PoolOpened(bytes32 indexed id, bytes32 indexed poolId, uint256 clearingPriceQ96, uint160 sqrtPriceX96, int24 tick)");
const settledEvent = parseAbiItem("event Settled(bytes32 indexed id, uint256 burned, uint256 returned)");
const flaggedEvent = parseAbiItem("event Flagged(bytes32 indexed tokenId, address indexed wallet, bytes32 reasonHash, address indexed via)");
const reportEvent = parseAbiItem("event ReportPublished(bytes32 indexed tokenId, uint16 indexed day, bytes32 reportHash, string uri, address via)");

export const FLAG_REASONS: Record<string, string> = {
  [keccak256(toBytes("funded-fresh-wallet"))]: "funded by a disclosed wallet",
  [keccak256(toBytes("cross-tx-round-trip"))]: "cross-transaction round trip",
  [keccak256(toBytes("funded-contract"))]: "contract funded by a disclosed wallet",
};

export type Activity =
  | { kind: "roundTrip"; block: bigint; tx: Hex; trader: Hex; volume: bigint; penalty: bigint; inUsdc: boolean }
  | { kind: "insider"; block: bigint; tx: Hex; trader: Hex; volume: bigint; feePips: number }
  | { kind: "paused"; block: bigint; tx: Hex; reason: Hex; note: string }
  | { kind: "unpaused"; block: bigint; tx: Hex }
  | { kind: "rung"; block: bigint; tx: Hex; usdc: bigint; index: number }
  | { kind: "opened"; block: bigint; tx: Hex }
  | { kind: "settled"; block: bigint; tx: Hex; burned: bigint; returned: bigint }
  | { kind: "flagged"; block: bigint; tx: Hex; wallet: Hex; reason: Hex }
  | { kind: "report"; block: bigint; tx: Hex; day: number; hash: Hex };

export function useHook(id: Hex, poolId: Hex | undefined, fromBlock: bigint | undefined, block: bigint | undefined) {
  const pc = usePublicClient({ chainId: sepolia.id });
  const hook = addresses.plainsightHook;
  const cfg = useReadContract({ address: hook, abi: plainsightHookAbi, functionName: "pool", args: [poolId ?? "0x"], query: { enabled: !!poolId, refetchInterval: POLL_MS } });
  const stats = useReadContract({ address: hook, abi: plainsightHookAbi, functionName: "stats", args: [poolId ?? "0x"], query: { enabled: !!poolId, refetchInterval: POLL_MS } });
  const halt = useReadContracts({
    allowFailure: false,
    contracts: [
      { address: hook, abi: plainsightHookAbi, functionName: "paused", args: [poolId ?? "0x"] },
      { address: hook, abi: plainsightHookAbi, functionName: "pausedUntil", args: [poolId ?? "0x"] },
    ],
    query: { enabled: !!poolId, refetchInterval: POLL_MS },
  });
  const day = useReadContract({ address: hook, abi: plainsightHookAbi, functionName: "currentDay", args: [poolId ?? "0x"], query: { enabled: !!poolId, refetchInterval: POLL_MS } }).data;

  const days = day === undefined ? [] : Array.from({ length: Math.min(Number(day), 29) + 1 }, (_, i) => BigInt(i));
  const perDay = useReadContracts({
    allowFailure: false,
    contracts: days.flatMap((d) => [
      { address: hook, abi: plainsightHookAbi, functionName: "realVolume", args: [poolId!, d] } as const,
      { address: hook, abi: plainsightHookAbi, functionName: "fakeVolume", args: [poolId!, d] } as const,
    ]),
    query: { enabled: !!poolId && days.length > 0, refetchInterval: POLL_MS },
  });
  const daily = days.map((d, i) => ({ day: Number(d), real: (perDay.data?.[2 * i] as bigint) ?? 0n, fake: (perDay.data?.[2 * i + 1] as bigint) ?? 0n }));

  const activity = useQuery({
    queryKey: ["activity", id, poolId, block?.toString()],
    enabled: !!pc && !!poolId && fromBlock !== undefined && block !== undefined,
    placeholderData: (p) => p,
    queryFn: async (): Promise<Activity[]> => {
      const get = (address: Hex, event: Parameters<typeof getLogsChunkedRaw>[2], args: Record<string, unknown>) =>
        getLogsChunkedRaw(pc!, address, event, fromBlock!, block!, args) as unknown as Promise<{ blockNumber: bigint; transactionHash: Hex; logIndex: number; args: Record<string, unknown> }[]>;
      const flagsAt = addresses.flagRegistry;
      const [rt, ins, pa, un, ru, op, se, fl, rp] = await Promise.all([
        get(hook, roundTripEvent, { id: poolId }),
        get(hook, insiderEvent, { id: poolId }),
        get(hook, pausedEvent, { id: poolId }),
        get(hook, unpausedEvent, { id: poolId }),
        get(addresses.greenshoeVault, rungEvent, { id }),
        get(addresses.greenshoeVault, openedEvent, { id }),
        get(addresses.greenshoeVault, settledEvent, { id }),
        flagsAt ? get(flagsAt, flaggedEvent, { tokenId: id }) : Promise.resolve([]),
        flagsAt ? get(flagsAt, reportEvent, { tokenId: id }) : Promise.resolve([]),
      ]);
      const base = (l: { blockNumber: bigint; transactionHash: Hex }) => ({ block: l.blockNumber, tx: l.transactionHash });
      const out: (Activity & { li: number })[] = [
        ...rt.map((l) => ({ kind: "roundTrip" as const, ...base(l), li: l.logIndex, trader: l.args.trader as Hex, volume: l.args.volumeUsdc as bigint, penalty: l.args.penalty as bigint, inUsdc: l.args.penaltyInUsdc as boolean })),
        ...ins.map((l) => ({ kind: "insider" as const, ...base(l), li: l.logIndex, trader: l.args.trader as Hex, volume: l.args.volumeUsdc as bigint, feePips: Number(l.args.feePips) })),
        ...pa.map((l) => ({ kind: "paused" as const, ...base(l), li: l.logIndex, reason: l.args.reasonCode as Hex, note: l.args.note as string })),
        ...un.map((l) => ({ kind: "unpaused" as const, ...base(l), li: l.logIndex })),
        ...ru.map((l) => ({ kind: "rung" as const, ...base(l), li: l.logIndex, usdc: l.args.usdc as bigint, index: Number(l.args.index) })),
        ...op.map((l) => ({ kind: "opened" as const, ...base(l), li: l.logIndex })),
        ...se.map((l) => ({ kind: "settled" as const, ...base(l), li: l.logIndex, burned: l.args.burned as bigint, returned: l.args.returned as bigint })),
        ...fl.map((l) => ({ kind: "flagged" as const, ...base(l), li: l.logIndex, wallet: l.args.wallet as Hex, reason: l.args.reasonHash as Hex })),
        ...rp.map((l) => ({ kind: "report" as const, ...base(l), li: l.logIndex, day: Number(l.args.day), hash: l.args.reportHash as Hex })),
      ];
      return out.sort((a, b) => (a.block === b.block ? b.li - a.li : a.block > b.block ? -1 : 1));
    },
  });

  return {
    config: cfg.data,
    paused: halt.data?.[0] ?? false,
    pausedUntil: halt.data ? Number(halt.data[1]) : 0,
    stats: stats.data,
    daily,
    activity: activity.data ?? [],
    refetch: () => Promise.all([cfg.refetch(), halt.refetch(), stats.refetch(), perDay.refetch(), activity.refetch()]),
  };
}

export type HookView = ReturnType<typeof useHook>;
