"use client";

import { useQuery } from "@tanstack/react-query";
import { useRef } from "react";
import { zeroAddress, type Address, type Hex } from "viem";
import { useBlock, useBlockNumber, usePublicClient, useReadContract, useReadContracts } from "wagmi";
import { sepolia } from "wagmi/chains";
import { addresses } from "./addresses";
import { ccaAbi, ccaLensAbi, greenshoeVaultAbi, launcherAbi } from "./abis";
import { auctionPhase, bidSubmittedEvent, checkpointEvent, getLogsChunked, type BidRow, type CheckpointPoint } from "./auction";

export const POLL_MS = 6_000;

export function useAuction(id: Hex, verified: boolean) {
  const pc = usePublicClient({ chainId: sepolia.id });
  const { data: block } = useBlockNumber({ chainId: sepolia.id, query: { refetchInterval: POLL_MS } });
  const latest = useBlock({ chainId: sepolia.id, query: { refetchInterval: POLL_MS } }).data;
  const chainTime = latest ? Number(latest.timestamp) : Math.floor(Date.now() / 1000);

  const info = useReadContract({ address: addresses.launcher, abi: launcherAbi, functionName: "auctionInfo", args: [id], query: { refetchInterval: POLL_MS } });
  const auction = info.data && info.data.auction !== zeroAddress ? (info.data.auction as Address) : undefined;

  const fixed = useReadContracts({
    allowFailure: false,
    contracts: auction
      ? [
          { address: auction, abi: ccaAbi, functionName: "floorPrice" },
          { address: auction, abi: ccaAbi, functionName: "tickSpacing" },
          { address: auction, abi: ccaAbi, functionName: "MAX_BID_PRICE" },
          { address: auction, abi: ccaAbi, functionName: "claimBlock" },
        ]
      : [],
    query: { enabled: !!auction, staleTime: Infinity },
  });
  const [floorQ96, tickQ96, maxBidQ96, claimBlock] = (fixed.data ?? []) as [bigint?, bigint?, bigint?, bigint?];

  const live = useReadContract({
    address: addresses.cca.lens,
    abi: ccaLensAbi,
    functionName: "state",
    args: [auction ?? zeroAddress],
    query: { enabled: !!auction && !!info.data && block !== undefined && block >= info.data.startBlock, refetchInterval: POLL_MS, retry: false },
  });

  const sale = useReadContract({ address: addresses.greenshoeVault, abi: greenshoeVaultAbi, functionName: "sale", args: [id], query: { refetchInterval: POLL_MS } });

  const logs = useAuctionLogs(pc, auction, info.data?.startBlock, block);

  const phase = auctionPhase({
    launched: !!auction,
    verified,
    block,
    startBlock: info.data?.startBlock ?? 0n,
    endBlock: info.data?.endBlock ?? 0n,
  });

  const clearingQ96 = live.data?.checkpoint.clearingPrice ?? floorQ96;

  return {
    block,
    chainTime,
    info: info.data,
    isLoading: info.isLoading,
    auction,
    phase,
    floorQ96,
    tickQ96,
    maxBidQ96,
    claimBlock,
    clearingQ96,
    currencyRaised: live.data?.currencyRaised,
    totalCleared: live.data?.totalCleared,
    cumulativeMps: live.data?.checkpoint.cumulativeMps,
    graduated: live.data?.isGraduated,
    sale: sale.data,
    saleReady: sale.data !== undefined,
    bids: logs.data?.bids ?? [],
    checkpoints: logs.data?.checkpoints ?? [],
    logsReady: !!logs.data,
    refetch: () => Promise.all([info.refetch(), live.refetch(), sale.refetch(), logs.refetch()]),
  };
}

export type AuctionView = ReturnType<typeof useAuction>;

function useAuctionLogs(pc: ReturnType<typeof usePublicClient>, auction: Address | undefined, startBlock: bigint | undefined, block: bigint | undefined) {
  const cache = useRef<{ auction?: Address; to: bigint; bids: Map<string, BidRow>; checkpoints: Map<string, CheckpointPoint> }>({ to: 0n, bids: new Map(), checkpoints: new Map() });
  return useQuery({
    queryKey: ["auction-logs", auction, block?.toString()],
    enabled: !!pc && !!auction && startBlock !== undefined && block !== undefined,
    placeholderData: (prev) => prev,
    queryFn: async () => {
      const c = cache.current;
      if (c.auction !== auction) Object.assign(c, { auction, to: startBlock! - 2n, bids: new Map(), checkpoints: new Map() });
      const from = c.to + 1n;
      if (from <= block!) {
        const [bidLogs, cpLogs] = await Promise.all([
          getLogsChunked(pc!, auction!, bidSubmittedEvent, from, block!),
          getLogsChunked(pc!, auction!, checkpointEvent, from, block!),
        ]);
        for (const l of bidLogs as { args: { id: bigint; owner: Address; priceQ96: bigint; amount: bigint }; blockNumber: bigint; transactionHash: `0x${string}` }[]) {
          c.bids.set(l.args.id.toString(), { id: l.args.id, owner: l.args.owner, maxPriceQ96: l.args.priceQ96, amount: l.args.amount, block: l.blockNumber, tx: l.transactionHash });
        }
        for (const l of cpLogs as { args: { blockNumber: bigint; clearingPriceQ96: bigint; cumulativeMps: number } }[]) {
          c.checkpoints.set(l.args.blockNumber.toString(), { block: l.args.blockNumber, priceQ96: l.args.clearingPriceQ96, cumulativeMps: Number(l.args.cumulativeMps) });
        }
        if (block! > c.to) c.to = block!;
      }
      const byBlock = (a: { block: bigint }, b: { block: bigint }) => (a.block < b.block ? -1 : a.block > b.block ? 1 : 0);
      return { bids: [...c.bids.values()].sort((a, b) => (a.id < b.id ? -1 : 1)), checkpoints: [...c.checkpoints.values()].sort(byBlock) };
    },
  });
}
