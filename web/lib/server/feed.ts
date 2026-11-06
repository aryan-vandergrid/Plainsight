import "server-only";
import { encodeAbiParameters, formatUnits, isAddressEqual, keccak256, parseAbiItem, zeroAddress, type Address, type Hex } from "viem";
import { addresses } from "../addresses";
import { ccaAbi, greenshoeVaultAbi, launcherAbi, manifestRegistryAbi, mockTokenAbi, plainsightHookAbi, stateViewAbi } from "../abis";
import { bidSubmittedEvent, coverage, q96ToUsd } from "../auction";
import { CHECKS, CheckStatus } from "../checks";
import { getLogsChunkedRaw } from "../logs";
import { fullName, manifestId } from "../manifest";
import { poolKeyAbi, sqrtToUsd } from "../pool";
import { bytes32ToText } from "../trade";
import { chain } from "./chain";

const flagRegistryAbi = [
  { type: "function", name: "flagCount", stateMutability: "view", inputs: [{ name: "", type: "bytes32" }], outputs: [{ type: "uint256" }] },
  {
    type: "function",
    name: "reportsOf",
    stateMutability: "view",
    inputs: [{ name: "tokenId", type: "bytes32" }],
    outputs: [{ type: "tuple[]", components: [{ name: "day", type: "uint16" }, { name: "hash", type: "bytes32" }, { name: "uri", type: "string" }, { name: "at", type: "uint64" }] }],
  },
] as const;
const flaggedEvent = parseAbiItem("event Flagged(bytes32 indexed tokenId, address indexed wallet, bytes32 reasonHash, address indexed via)");
const unflaggedEvent = parseAbiItem("event Unflagged(bytes32 indexed tokenId, address indexed wallet, address indexed via)");
const pausedEvent = parseAbiItem("event Paused(bytes32 indexed id, bytes32 indexed reasonCode, string note)");
const unpausedEvent = parseAbiItem("event Unpaused(bytes32 indexed id)");

const usdc = (v: bigint) => ({ raw: v.toString(), usd: Number(formatUnits(v, 6)) });

export async function buildFeed(label: string) {
  const pc = chain();
  const id = manifestId(label);
  const status = await pc.readContract({ address: addresses.manifestRegistry, abi: manifestRegistryAbi, functionName: "status", args: [id] });
  if (Number(status) === 0) return null;

  const block = await pc.getBlockNumber();
  const from = BigInt(addresses.deployBlock);
  const [m, checks, info, sale] = await Promise.all([
    pc.readContract({ address: addresses.manifestRegistry, abi: manifestRegistryAbi, functionName: "get", args: [id] }),
    pc.readContract({ address: addresses.launcher, abi: launcherAbi, functionName: "checks", args: [id] }),
    pc.readContract({ address: addresses.launcher, abi: launcherAbi, functionName: "auctionInfo", args: [id] }),
    pc.readContract({ address: addresses.greenshoeVault, abi: greenshoeVaultAbi, functionName: "sale", args: [id] }),
  ]);
  const [name, symbol, decimals] = await Promise.all([
    pc.readContract({ address: m.token, abi: mockTokenAbi, functionName: "name" }),
    pc.readContract({ address: m.token, abi: mockTokenAbi, functionName: "symbol" }),
    pc.readContract({ address: m.token, abi: mockTokenAbi, functionName: "decimals" }),
  ]);
  const tokens = (v: bigint) => ({ raw: v.toString(), tokens: Number(formatUnits(v, decimals)) });
  const passed = checks.slice(0, CHECKS.length).filter((s) => s === CheckStatus.Passed).length;

  let auction = null;
  const launched = info.auction !== zeroAddress;
  if (launched) {
    const a = info.auction as Address;
    const [clearing, raised, graduated, end] = await Promise.all([
      pc.readContract({ address: a, abi: ccaAbi, functionName: "clearingPrice" }),
      pc.readContract({ address: a, abi: ccaAbi, functionName: "currencyRaised" }),
      pc.readContract({ address: a, abi: ccaAbi, functionName: "isGraduated" }),
      pc.readContract({ address: a, abi: ccaAbi, functionName: "endBlock" }),
    ]);
    const bids = (await getLogsChunkedRaw(pc, a, bidSubmittedEvent, info.startBlock - 1n, block)) as unknown as { args: { owner: Address; amount: bigint } }[];
    const committed = bids.reduce((t, b) => t + b.args.amount, 0n);
    auction = {
      address: a,
      status: block < info.startBlock ? "upcoming" : block < end ? "live" : graduated ? "graduated" : "refunded",
      supply: tokens(info.supply),
      floorPriceUsd: info.terms.floorPriceUsdc ? Number(info.terms.floorPriceUsdc) / 1e6 : null,
      clearingPriceUsd: q96ToUsd(clearing, decimals),
      raised: usdc(raised),
      minRaise: usdc(m.minRaise),
      graduated,
      bids: bids.length,
      bidders: new Set(bids.map((b) => b.args.owner.toLowerCase())).size,
      committed: usdc(committed),
      coverage: coverage(committed, info.supply, clearing),
      startBlock: Number(info.startBlock),
      endBlock: Number(end),
    };
  }

  let pool = null;
  let vault = null;
  let volume = null;
  const halts: { block: number; tx: Hex; action: "paused" | "unpaused"; reason?: string; note?: string }[] = [];
  if (sale.collected) {
    vault = {
      received: usdc(sale.received),
      toIssuer: usdc(sale.toIssuer),
      reserve: usdc(sale.reserve),
      unsoldTokens: tokens(sale.unsoldTokens),
      lockedUntil: Number(sale.collectedAt) + Number(sale.windowSecs),
      settled: sale.settled,
      tokensBurned: tokens(sale.tokensBurned),
      usdcReturned: usdc(sale.usdcReturned),
    } as Record<string, unknown>;
  }
  if (sale.poolOpened) {
    const key = await pc.readContract({ address: addresses.greenshoeVault, abi: greenshoeVaultAbi, functionName: "poolKey", args: [id] });
    const poolId = keccak256(encodeAbiParameters(poolKeyAbi, [key]));
    const tokenIs0 = isAddressEqual(key.currency0, m.token);
    const [slot0, st, stats, cfg, paused, pausedUntil] = await Promise.all([
      pc.readContract({ address: addresses.v4.stateView, abi: stateViewAbi, functionName: "getSlot0", args: [poolId] }),
      pc.readContract({ address: addresses.greenshoeVault, abi: greenshoeVaultAbi, functionName: "status", args: [id] }),
      pc.readContract({ address: addresses.plainsightHook, abi: plainsightHookAbi, functionName: "stats", args: [poolId] }),
      pc.readContract({ address: addresses.plainsightHook, abi: plainsightHookAbi, functionName: "pool", args: [poolId] }),
      pc.readContract({ address: addresses.plainsightHook, abi: plainsightHookAbi, functionName: "paused", args: [poolId] }),
      pc.readContract({ address: addresses.plainsightHook, abi: plainsightHookAbi, functionName: "pausedUntil", args: [poolId] }),
    ]);
    pool = {
      poolId,
      hook: addresses.plainsightHook,
      priceUsd: sqrtToUsd(slot0[0], tokenIs0, decimals),
      openPriceUsd: q96ToUsd(sale.clearingPriceQ96, decimals),
      bandFloorUsd: q96ToUsd(sale.clearingPriceQ96, decimals) * (1 - m.rangeDepthBps / 10_000),
      paused,
      pauseReason: paused ? bytes32ToText(cfg.pauseReason) : null,
      pausedUntil: paused ? Number(pausedUntil) : null,
    };
    Object.assign(vault!, { usdcInWall: usdc(st.usdcInWall), usdcUnplaced: usdc(st.usdcUnplaced), tokensBoughtBack: tokens(st.tokensBought), rungsPlaced: st.rungsPlaced, rungCount: st.rungCount });
    volume = {
      real: usdc(stats.realVolume),
      fake: usdc(stats.fakeVolume),
      roundTrips: Number(stats.roundTrips),
      penalties: { usdc: usdc(stats.penaltyUsdc), tokens: tokens(stats.penaltyToken) },
      insiderSells: Number(stats.insiderSells),
      insiderSellVolume: usdc(stats.insiderFeeVolume),
    };
    const [p, u] = await Promise.all([
      getLogsChunkedRaw(pc, addresses.plainsightHook, pausedEvent, from, block, { id: poolId }),
      getLogsChunkedRaw(pc, addresses.plainsightHook, unpausedEvent, from, block, { id: poolId }),
    ]);
    for (const l of p as unknown as { blockNumber: bigint; transactionHash: Hex; args: { reasonCode: Hex; note: string } }[]) {
      halts.push({ block: Number(l.blockNumber), tx: l.transactionHash, action: "paused", reason: bytes32ToText(l.args.reasonCode), note: l.args.note });
    }
    for (const l of u as unknown as { blockNumber: bigint; transactionHash: Hex }[]) halts.push({ block: Number(l.blockNumber), tx: l.transactionHash, action: "unpaused" });
    halts.sort((x, y) => x.block - y.block);
  }

  const flags: { wallet: Address; reasonHash: Hex; block: number; tx: Hex; via: Address; active: boolean }[] = [];
  let reports: { day: number; hash: Hex; uri: string; at: number }[] = [];
  if (addresses.flagRegistry) {
    const [f, uf, reps] = await Promise.all([
      getLogsChunkedRaw(pc, addresses.flagRegistry, flaggedEvent, from, block, { tokenId: id }),
      getLogsChunkedRaw(pc, addresses.flagRegistry, unflaggedEvent, from, block, { tokenId: id }),
      pc.readContract({ address: addresses.flagRegistry, abi: flagRegistryAbi, functionName: "reportsOf", args: [id] }),
    ]);
    const cleared = new Set((uf as unknown as { args: { wallet: Address } }[]).map((l) => l.args.wallet.toLowerCase()));
    for (const l of f as unknown as { blockNumber: bigint; transactionHash: Hex; args: { wallet: Address; reasonHash: Hex; via: Address } }[]) {
      flags.push({ wallet: l.args.wallet, reasonHash: l.args.reasonHash, block: Number(l.blockNumber), tx: l.transactionHash, via: l.args.via, active: !cleared.has(l.args.wallet.toLowerCase()) });
    }
    reports = reps.map((r) => ({ day: r.day, hash: r.hash, uri: r.uri, at: Number(r.at) }));
  }

  const score = {
    disclosed: passed === CHECKS.length,
    fairAuction: auction?.graduated === true,
    greenshoe: sale.poolOpened && (sale.settled || Date.now() / 1000 < Number(sale.collectedAt) + Number(sale.windowSecs)),
    volumeVerified: sale.poolOpened,
  };

  return {
    version: 1,
    ens: fullName(label),
    id,
    block: Number(block),
    token: { address: m.token, name, symbol, decimals },
    manifest: { hash: m.manifestHash, issuer: m.issuer, agent: m.agent, agentOperator: m.agentOperator, treasury: m.treasury, greenshoeBps: m.greenshoeBps, rangeDepthBps: m.rangeDepthBps, insiderFeeBps: m.insiderFeeBps, windowSecs: m.windowSecs },
    checks: { passed, total: CHECKS.length, list: CHECKS.map((c, i) => ({ check: c.title, passed: checks[i] === CheckStatus.Passed })) },
    score: { ...score, total: Object.values(score).filter(Boolean).length, of: 4 },
    auction,
    vault,
    pool,
    volume,
    halts,
    flags,
    reports,
  };
}

export type Feed = NonNullable<Awaited<ReturnType<typeof buildFeed>>>;
