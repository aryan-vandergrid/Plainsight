import "server-only";
import { encodeAbiParameters, getAddress, isAddressEqual, keccak256, parseAbiItem, type Address, type Hex } from "viem";
import { addresses } from "../addresses";
import { greenshoeVaultAbi, launcherAbi, manifestRegistryAbi } from "../abis";
import { getLogsChunkedRaw } from "../logs";
import { manifestId } from "../manifest";
import { poolKeyAbi, swapEvent } from "../pool";
import { chain } from "./chain";

const transferEvent = parseAbiItem("event Transfer(address indexed from, address indexed to, uint256 value)");
const ROUND_TRIP_BLOCKS = 50n;
const MAX_SWAPS = 300;

export type Finding = { wallet: Address; reason: "funded-fresh-wallet" | "funded-contract" | "cross-tx-round-trip"; evidence: string };

export async function flowtrack(label: string): Promise<{ label: string; tokenId: Hex; flags: Finding[] }> {
  const pc = chain();
  const id = manifestId(label);
  const m = await pc.readContract({ address: addresses.manifestRegistry, abi: manifestRegistryAbi, functionName: "get", args: [id] });
  const latest = await pc.getBlockNumber();
  const from = BigInt(addresses.deployBlock);

  const disclosed = new Map<string, string>();
  const name = (s: string) => `${s}.${label}.plainsight.eth`;
  for (const a of m.allocations) {
    disclosed.set(a.wallet.toLowerCase(), name(a.label));
    if (a.vesting !== "0x0000000000000000000000000000000000000000") disclosed.set(a.vesting.toLowerCase(), `${name(a.label)} vesting`);
  }
  disclosed.set(m.mm.wallet.toLowerCase(), name("mm"));
  disclosed.set(m.agent.toLowerCase(), name("agent"));
  disclosed.set(m.issuer.toLowerCase(), `issuer of ${label}`);

  const findings = new Map<string, Finding>();

  const transfers = (await getLogsChunkedRaw(pc, m.token, transferEvent, from, latest)) as unknown as { args: { from: Address; to: Address; value: bigint }; transactionHash: Hex }[];
  const funded = transfers.filter((t) => disclosed.has(t.args.from.toLowerCase()) && !disclosed.has(t.args.to.toLowerCase()));
  const codes = await inBatches([...new Set(funded.map((t) => t.args.to.toLowerCase()))], (a) => pc.getCode({ address: a as Address }).then((c) => [a, c] as const));
  const hasCode = new Map(codes.map(([a, c]) => [a, !!c && c !== "0x"]));
  const auction = (await pc.readContract({ address: addresses.launcher, abi: launcherAbi, functionName: "auctionInfo", args: [id] })).auction;
  const infra = new Set(
    [
      addresses.greenshoeVault,
      addresses.launcher,
      addresses.plainsightHook,
      addresses.v4.poolManager,
      addresses.v4.swapRouter,
      addresses.v4.liquidityRouter,
      addresses.v4.universalRouter,
      addresses.cca.permit2,
      addresses.cca.factory,
      auction,
      m.token,
    ].map((a) => a.toLowerCase()),
  );
  for (const t of funded) {
    const to = t.args.to.toLowerCase();
    if (findings.has(to) || infra.has(to)) continue;
    const from = disclosed.get(t.args.from.toLowerCase());
    if (hasCode.get(to)) findings.set(to, { wallet: getAddress(to), reason: "funded-contract", evidence: `contract received tokens from ${from} in ${t.transactionHash}` });
    else findings.set(to, { wallet: getAddress(to), reason: "funded-fresh-wallet", evidence: `received tokens from ${from} in ${t.transactionHash}` });
  }

  const sale = await pc.readContract({ address: addresses.greenshoeVault, abi: greenshoeVaultAbi, functionName: "sale", args: [id] });
  if (sale.poolOpened) {
    const key = await pc.readContract({ address: addresses.greenshoeVault, abi: greenshoeVaultAbi, functionName: "poolKey", args: [id] });
    const poolId = keccak256(encodeAbiParameters(poolKeyAbi, [key]));
    const tokenIs0 = isAddressEqual(key.currency0, m.token);
    const swaps = ((await getLogsChunkedRaw(pc, addresses.v4.poolManager, swapEvent, from, latest, { id: poolId })) as unknown as {
      blockNumber: bigint;
      transactionHash: Hex;
      args: { amount0: bigint; amount1: bigint };
    }[]).slice(-MAX_SWAPS);
    const perTx = new Map<Hex, { block: bigint; tokens: bigint }>();
    for (const s of swaps) {
      const leg = perTx.get(s.transactionHash) ?? { block: s.blockNumber, tokens: 0n };
      leg.tokens -= tokenIs0 ? s.args.amount0 : s.args.amount1;
      perTx.set(s.transactionHash, leg);
    }
    const senders = new Map(await inBatches([...perTx.keys()], (h) => pc.getTransaction({ hash: h }).then((t) => [h, t.from.toLowerCase()] as const)));
    const byTrader = new Map<string, { block: bigint; tx: Hex; tokens: bigint }[]>();
    for (const [tx, leg] of perTx) {
      if (leg.tokens === 0n) continue;
      const trader = senders.get(tx)!;
      const list = byTrader.get(trader) ?? [];
      list.push({ block: leg.block, tx, tokens: leg.tokens });
      byTrader.set(trader, list);
    }
    for (const [trader, legs] of byTrader) {
      for (let i = 0; i < legs.length && !findings.has(trader); i++) {
        for (let j = i + 1; j < legs.length; j++) {
          const [a, b] = [legs[i], legs[j]];
          if (b.block - a.block > ROUND_TRIP_BLOCKS) break;
          if ((a.tokens > 0n) === (b.tokens > 0n)) continue;
          const x = a.tokens < 0n ? -a.tokens : a.tokens;
          const y = b.tokens < 0n ? -b.tokens : b.tokens;
          const diff = x > y ? x - y : y - x;
          if (diff * 20n <= x) {
            findings.set(trader, { wallet: getAddress(trader), reason: "cross-tx-round-trip", evidence: `${a.tx} and ${b.tx}, ${b.block - a.block} blocks apart` });
            break;
          }
        }
      }
    }
  }

  const flags = [...findings.values()].sort((p, q) => (p.wallet.toLowerCase() < q.wallet.toLowerCase() ? -1 : 1));
  return { label, tokenId: id, flags };
}

async function inBatches<T, R>(items: T[], fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = [];
  for (let i = 0; i < items.length; i += 25) out.push(...(await Promise.all(items.slice(i, i + 25).map(fn))));
  return out;
}
