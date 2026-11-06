import "server-only";
import { parseAbiItem } from "viem";
import { addresses } from "../addresses";
import { getLogsChunkedRaw } from "../logs";
import { buildFeed, type Feed } from "./feed";
import { chain } from "./chain";

const manifestPostedEvent = parseAbiItem("event ManifestPosted(bytes32 indexed id, address indexed issuer, address indexed token, string ensLabel, address tokenRegistry)");

export type LaunchStatus = "upcoming" | "live" | "trading" | "settled" | "refunded" | "blocked";

export type LaunchSummary = {
  label: string;
  ens: string;
  name: string;
  symbol: string;
  status: LaunchStatus;
  poolPending: boolean;
  postedBlock: number;
  checks: { passed: number; total: number; failed: string | null };
  score: Feed["score"];
  auction: {
    supplyTokens: number;
    floorPriceUsd: number | null;
    clearingPriceUsd: number;
    raisedUsd: number;
    minRaiseUsd: number;
    coverage: number | null;
    bidders: number;
    blocksToStart: number;
    blocksToEnd: number;
  } | null;
  trading: {
    priceUsd: number;
    openPriceUsd: number;
    bandFloorUsd: number;
    realUsd: number;
    fakeUsd: number;
    wallUsedPct: number;
    secsLeft: number;
    paused: boolean;
    tokensBoughtBack: number;
    tokensBurned: number;
    usdcReturned: number;
    activeFlags: number;
  } | null;
};

export type Launches = { block: number; launches: LaunchSummary[]; totals: { launches: number; raisedUsd: number; fakeUsd: number; blocked: number } };

const TTL_MS = 15_000;
let cache: { at: number; value: Promise<Launches> } | undefined;

let last: Launches | undefined;

export function listLaunches(): Promise<Launches> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.value;
  const value = build();
  cache = { at: Date.now(), value };
  value.then(
    (v) => (last = v),
    () => {
      if (cache?.value === value) cache = undefined;
    },
  );
  return last ? Promise.resolve(last) : value;
}

async function build(): Promise<Launches> {
  const pc = chain();
  const block = await pc.getBlockNumber();
  const logs = (await getLogsChunkedRaw(pc, addresses.launcher, manifestPostedEvent, BigInt(addresses.deployBlock), block)) as unknown as {
    blockNumber: bigint;
    args: { ensLabel: string };
  }[];
  const posted = new Map<string, number>();
  for (const l of logs) if (!posted.has(l.args.ensLabel)) posted.set(l.args.ensLabel, Number(l.blockNumber));

  const launches: LaunchSummary[] = [];
  const labels = [...posted.keys()];
  for (let i = 0; i < labels.length; i += 3) {
    const feeds = await Promise.all(labels.slice(i, i + 3).map((label) => buildFeed(label).catch(() => null)));
    feeds.forEach((f, j) => {
      if (f) launches.push(summarise(labels[i + j], f, posted.get(labels[i + j])!));
    });
  }
  launches.sort((a, b) => ORDER[a.status] - ORDER[b.status] || b.postedBlock - a.postedBlock);

  return {
    block: Number(block),
    launches,
    totals: {
      launches: launches.length,
      raisedUsd: launches.reduce((t, l) => t + (l.auction && l.status !== "refunded" && l.status !== "live" && l.status !== "upcoming" ? l.auction.raisedUsd : 0), 0),
      fakeUsd: launches.reduce((t, l) => t + (l.trading?.fakeUsd ?? 0), 0),
      blocked: launches.filter((l) => l.status === "blocked").length,
    },
  };
}

const ORDER: Record<LaunchStatus, number> = { live: 0, upcoming: 1, trading: 2, settled: 3, refunded: 4, blocked: 5 };

function summarise(label: string, f: Feed, postedBlock: number): LaunchSummary {
  const a = f.auction;
  const v = f.vault as
    | { reserve: { usd: number }; usdcInWall?: { usd: number }; usdcUnplaced?: { usd: number }; tokensBoughtBack?: { tokens: number }; tokensBurned: { tokens: number }; usdcReturned: { usd: number }; lockedUntil: number; settled: boolean }
    | null;
  const failed = f.checks.list.find((c) => !c.passed);

  let status: LaunchStatus;
  if (!a) status = f.checks.passed === f.checks.total ? "upcoming" : "blocked";
  else if (a.status === "upcoming" || a.status === "live" || a.status === "refunded") status = a.status;
  else status = v?.settled ? "settled" : "trading";

  const reserve = v?.reserve.usd ?? 0;
  const left = (v?.usdcInWall?.usd ?? 0) + (v?.usdcUnplaced?.usd ?? 0);
  return {
    label,
    ens: f.ens,
    name: f.token.name,
    symbol: f.token.symbol,
    status,
    poolPending: status === "trading" && !f.pool,
    postedBlock,
    checks: { passed: f.checks.passed, total: f.checks.total, failed: a ? null : (failed?.check ?? null) },
    score: f.score,
    auction: a && {
      supplyTokens: a.supply.tokens,
      floorPriceUsd: a.floorPriceUsd,
      clearingPriceUsd: a.clearingPriceUsd,
      raisedUsd: a.raised.usd,
      minRaiseUsd: a.minRaise.usd,
      coverage: a.coverage,
      bidders: a.bidders,
      blocksToStart: a.startBlock - f.block,
      blocksToEnd: a.endBlock - f.block,
    },
    trading:
      f.pool && f.volume && v
        ? {
            priceUsd: f.pool.priceUsd,
            openPriceUsd: f.pool.openPriceUsd,
            bandFloorUsd: f.pool.bandFloorUsd,
            realUsd: f.volume.real.usd,
            fakeUsd: f.volume.fake.usd,
            wallUsedPct: reserve > 0 && !v.settled ? Math.min(100, Math.max(0, ((reserve - left) / reserve) * 100)) : 0,
            secsLeft: Math.max(0, v.lockedUntil - Math.floor(Date.now() / 1000)),
            paused: f.pool.paused,
            tokensBoughtBack: v.tokensBoughtBack?.tokens ?? 0,
            tokensBurned: v.tokensBurned.tokens,
            usdcReturned: v.usdcReturned.usd,
            activeFlags: f.flags.filter((x) => x.active).length,
          }
        : null,
  };
}
