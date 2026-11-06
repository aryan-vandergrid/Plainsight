import { parseAbiItem, parseUnits, type Address, type PublicClient } from "viem";
import { getLogsChunkedRaw } from "./logs";

export const Q96 = 1n << 96n;
export const USDC_DECIMALS = 6;
export const BLOCK_SECONDS = 12;
export const MIN_DURATION_BLOCKS = 10;
export const MAX_DURATION_BLOCKS = 50_400;

export function q96ToUsdcUnits(q: bigint, tokenDecimals: number): bigint {
  return (q * 10n ** BigInt(tokenDecimals)) / Q96;
}

export function q96ToUsd(q: bigint, tokenDecimals: number): number {
  return Number(q96ToUsdcUnits(q, tokenDecimals)) / 1e6;
}

export function usdToBidQ96(usd: string, tokenDecimals: number, floorQ96: bigint, tickQ96: bigint): bigint | null {
  if (!/^\d*\.?\d+$/.test(usd.trim()) || Number(usd) <= 0) return null;
  const raw = (parseUnits(usd.trim(), USDC_DECIMALS) * Q96) / 10n ** BigInt(tokenDecimals);
  if (raw < floorQ96) return raw - (raw % tickQ96);
  return floorQ96 + ((raw - floorQ96) / tickQ96) * tickQ96;
}

export function fmtPrice(usd: number): string {
  return `$${usd.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: usd < 1 ? 4 : 3 })}`;
}

export function fmtUsdCompact(usd: number): string {
  if (Math.abs(usd) < 10_000) return `$${usd.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
  return `$${new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 2 }).format(usd)}`;
}

export function fmtTokensCompact(n: number): string {
  return n < 10_000 ? n.toLocaleString("en-US", { maximumFractionDigits: 2 }) : new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 2 }).format(n);
}

export function blocksToDuration(blocks: number): string {
  const s = Math.max(0, blocks) * BLOCK_SECONDS;
  if (s < 90) return `about ${Math.max(1, Math.round(s / 60))} min`;
  if (s < 5400) return `about ${Math.round(s / 60)} min`;
  if (s < 172_800) return `about ${Math.round(s / 3600)} h`;
  return `about ${Math.round(s / 86_400)} days`;
}

export function timeLeft(secs: number): string {
  if (secs <= 0) return "ended";
  if (secs >= 2 * 86_400) return `${Math.ceil(secs / 86_400)} days`;
  if (secs >= 2 * 3600) return `${Math.ceil(secs / 3600)} h`;
  if (secs >= 60) return `${Math.ceil(secs / 60)} min`;
  return "under a minute";
}

export function countdown(blocks: number): string {
  return clock(Math.max(0, blocks) * BLOCK_SECONDS);
}

export function clock(secs: number): string {
  const s = Math.max(0, secs);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = String(m).padStart(2, "0");
  const ss = String(sec).padStart(2, "0");
  return h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

export type Phase = "unverified" | "ready" | "upcoming" | "live" | "ended";

export function auctionPhase(o: { launched: boolean; verified: boolean; block?: bigint; startBlock: bigint; endBlock: bigint }): Phase {
  if (!o.launched) return o.verified ? "ready" : "unverified";
  if (o.block === undefined || o.block < o.startBlock) return "upcoming";
  return o.block < o.endBlock ? "live" : "ended";
}

export const bidSubmittedEvent = parseAbiItem("event BidSubmitted(uint256 indexed id, address indexed owner, uint256 priceQ96, uint128 amount)");
export const checkpointEvent = parseAbiItem("event CheckpointUpdated(uint256 blockNumber, uint256 clearingPriceQ96, uint24 cumulativeMps)");
export const bidExitedEvent = parseAbiItem("event BidExited(uint256 indexed bidId, address indexed owner, uint256 tokensFilled, uint256 currencyRefunded)");

export async function getLogsChunked<E extends typeof bidSubmittedEvent | typeof checkpointEvent | typeof bidExitedEvent>(
  pc: PublicClient,
  address: Address,
  event: E,
  fromBlock: bigint,
  toBlock: bigint,
  args?: Record<string, unknown>,
) {
  return (await getLogsChunkedRaw(pc, address, event, fromBlock, toBlock, args)) as unknown as Awaited<ReturnType<typeof pc.getLogs<E>>>;
}

export type CheckpointPoint = { block: bigint; priceQ96: bigint; cumulativeMps: number };

export function exitHints(points: CheckpointPoint[], maxPriceQ96: bigint, finalQ96: bigint): { lastFull: bigint; outbid: bigint } | null {
  let lastFull = 0n;
  let outbid = 0n;
  for (const p of points) {
    if (p.priceQ96 < maxPriceQ96) lastFull = p.block;
    if (outbid === 0n && p.priceQ96 > maxPriceQ96) outbid = p.block;
  }
  if (lastFull === 0n) return null;
  if (finalQ96 === maxPriceQ96) return { lastFull, outbid: 0n };
  return outbid === 0n ? null : { lastFull, outbid };
}

export type BidRow = {
  id: bigint;
  owner: Address;
  maxPriceQ96: bigint;
  amount: bigint;
  block: bigint;
  tx: `0x${string}`;
};

export type BidStanding = "winning" | "at-price" | "outbid";

export function standing(maxPriceQ96: bigint, clearingQ96: bigint): BidStanding {
  if (maxPriceQ96 > clearingQ96) return "winning";
  return maxPriceQ96 === clearingQ96 ? "at-price" : "outbid";
}

export function coverage(totalBidUsdc: bigint, supply: bigint, priceQ96: bigint): number | null {
  const value = (supply * priceQ96) / Q96;
  if (value === 0n) return null;
  return Number((totalBidUsdc * 1000n) / value) / 1000;
}
