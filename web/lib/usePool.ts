"use client";

import { useQuery } from "@tanstack/react-query";
import { useRef } from "react";
import { encodeAbiParameters, keccak256, type Address, type Hex } from "viem";
import { usePublicClient, useReadContract } from "wagmi";
import { sepolia } from "wagmi/chains";
import { addresses } from "./addresses";
import { greenshoeVaultAbi, stateViewAbi } from "./abis";
import { getLogsChunkedRaw } from "./logs";
import { poolKeyAbi, poolOpenedEvent, sqrtToUsd, swapEvent, type Compare, type PricePoint } from "./pool";
import compareRaw from "./compare.json";
import { POLL_MS } from "./useAuction";

const compare = compareRaw as Compare;

export function usePool(id: Hex, label: string, token: Address | undefined, opened: boolean, decimals: number, fromBlock: bigint | undefined, block: bigint | undefined) {
  const pc = usePublicClient({ chainId: sepolia.id });
  const keyRead = useReadContract({ address: addresses.greenshoeVault, abi: greenshoeVaultAbi, functionName: "poolKey", args: [id], query: { staleTime: opened ? Infinity : 0 } }).data;
  const key = opened ? keyRead : undefined;
  const poolId = key ? (keccak256(encodeAbiParameters(poolKeyAbi, [key])) as Hex) : undefined;
  const tokenIs0 = !!key && !!token && key.currency0.toLowerCase() === token.toLowerCase();

  const slot0 = useReadContract({ address: addresses.v4.stateView, abi: stateViewAbi, functionName: "getSlot0", args: [poolId ?? "0x"], query: { enabled: !!poolId, refetchInterval: POLL_MS } });
  const status = useReadContract({ address: addresses.greenshoeVault, abi: greenshoeVaultAbi, functionName: "status", args: [id], query: { refetchInterval: POLL_MS } });
  const rungs = useReadContract({ address: addresses.greenshoeVault, abi: greenshoeVaultAbi, functionName: "rungsOf", args: [id], query: { refetchInterval: POLL_MS } });

  const plain = compare.label === label && compare.poolId && compare.token ? { poolId: compare.poolId, tokenIs0: compare.token.toLowerCase() < addresses.usdc.toLowerCase() } : undefined;
  const plainSlot0 = useReadContract({ address: addresses.v4.stateView, abi: stateViewAbi, functionName: "getSlot0", args: [plain?.poolId ?? "0x"], query: { enabled: !!plain, refetchInterval: POLL_MS } });

  const openBlock = useQuery({
    queryKey: ["pool-open-block", id, fromBlock?.toString()],
    enabled: !!pc && opened && fromBlock !== undefined && block !== undefined,
    staleTime: Infinity,
    queryFn: async () => {
      const logs = await getLogsChunkedRaw(pc!, addresses.greenshoeVault, poolOpenedEvent, fromBlock!, block!, { id });
      return logs[0]?.blockNumber ?? fromBlock!;
    },
  });

  const history = useSwapHistory(pc, poolId, openBlock.data, block, tokenIs0, decimals, slot0.data?.[0]);
  const plainHistory = useSwapHistory(pc, plain?.poolId, openBlock.data, block, plain?.tokenIs0 ?? false, 18, plainSlot0.data?.[0]);

  const sqrtP = slot0.data?.[0];
  return {
    key,
    poolId,
    tokenIs0,
    priceUsd: sqrtP !== undefined ? sqrtToUsd(sqrtP, tokenIs0, decimals) : undefined,
    status: status.data,
    rungs: rungs.data ?? [],
    openBlock: openBlock.data,
    history: history.data ?? [],
    historyReady: history.data !== undefined,
    plain: plain
      ? { priceUsd: plainSlot0.data ? sqrtToUsd(plainSlot0.data[0], plain.tokenIs0, 18) : undefined, history: plainHistory.data ?? [] }
      : undefined,
    refetch: () => Promise.all([status.refetch(), rungs.refetch(), slot0.refetch()]),
  };
}

export type PoolView = ReturnType<typeof usePool>;

function useSwapHistory(pc: ReturnType<typeof usePublicClient>, poolId: Hex | undefined, from: bigint | undefined, block: bigint | undefined, tokenIs0: boolean, decimals: number, liveSqrt?: bigint) {
  const cache = useRef<{ poolId?: Hex; to: bigint; pts: Map<string, PricePoint> }>({ to: 0n, pts: new Map() });
  return useQuery({
    queryKey: ["swaps", poolId, block?.toString(), liveSqrt?.toString()],
    enabled: !!pc && !!poolId && from !== undefined && block !== undefined,
    placeholderData: (p) => p,
    queryFn: async () => {
      const c = cache.current;
      if (c.poolId !== poolId) Object.assign(c, { poolId, to: from! - 1n, pts: new Map() });
      if (c.to < block!) {
        const logs = (await getLogsChunkedRaw(pc!, addresses.v4.poolManager, swapEvent, c.to + 1n, block!, { id: poolId })) as unknown as {
          blockNumber: bigint;
          logIndex: number;
          transactionHash: `0x${string}`;
          args: { sqrtPriceX96: bigint; amount0: bigint; amount1: bigint };
        }[];
        for (const l of logs) {
          const usdc = tokenIs0 ? l.args.amount1 : l.args.amount0;
          c.pts.set(`${l.blockNumber}-${l.logIndex}`, { block: l.blockNumber, usd: sqrtToUsd(l.args.sqrtPriceX96, tokenIs0, decimals), volume: usdc < 0n ? -usdc : usdc, tx: l.transactionHash });
        }
        c.to = block!;
      }
      return [...c.pts.values()].sort((a, b) => (a.block < b.block ? -1 : a.block > b.block ? 1 : 0));
    },
  });
}
