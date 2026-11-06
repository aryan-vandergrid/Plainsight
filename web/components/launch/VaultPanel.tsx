"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { formatUnits, type Hex } from "viem";
import { useAccount, usePublicClient, useWriteContract } from "wagmi";
import { sepolia } from "wagmi/chains";
import { Alert, Card, CopyAddress, Pill, Stat } from "@/components/create/ui";
import { addresses } from "@/lib/addresses";
import { greenshoeVaultAbi } from "@/lib/abis";
import { fmtPrice, fmtTokensCompact, fmtUsdCompact, timeLeft } from "@/lib/auction";
import { explainError } from "@/lib/tx";
import type { AuctionView } from "@/lib/useAuction";
import type { PoolView } from "@/lib/usePool";
import { PoolChart } from "./PoolChart";

const tickToUsd = (tick: number, tokenIs0: boolean, decimals: number) => {
  const raw = Math.pow(1.0001, tick);
  return ((tokenIs0 ? raw : 1 / raw) * 10 ** decimals) / 1e6;
};

const when = (ts: number) => new Date(ts * 1000).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

export function VaultPanel({ id, a, p, symbol, decimals, depthBps }: { id: Hex; a: AuctionView; p: PoolView; symbol: string; decimals: number; depthBps: number }) {
  const { address } = useAccount();
  const pc = usePublicClient({ chainId: sepolia.id });
  const qc = useQueryClient();
  const { writeContractAsync } = useWriteContract();
  const [busy, setBusy] = useState<"" | "replenish" | "settle">("");
  const [error, setError] = useState("");
  const s = a.sale!;
  const st = p.status;
  const nowSec = a.chainTime;
  const lockedUntil = Number(s.collectedAt) + Number(s.windowSecs);
  const windowOver = nowSec >= lockedUntil;
  const open = Number(s.clearingPriceQ96 * 10n ** BigInt(decimals) / (1n << 96n)) / 1e6;
  const floor = open * (1 - depthBps / 10_000);
  const usd = (v: bigint) => fmtUsdCompact(Number(formatUnits(v, 6)));

  async function send(fn: "replenish" | "settle") {
    if (!pc || !address) return;
    setBusy(fn);
    setError("");
    try {
      const { request } = await pc.simulateContract({ account: address, address: addresses.greenshoeVault, abi: greenshoeVaultAbi, functionName: fn, args: [id] });
      const h = await writeContractAsync({ address: addresses.greenshoeVault, abi: greenshoeVaultAbi, functionName: fn, args: [id], gas: request.gas });
      await pc.waitForTransactionReceipt({ hash: h });
      await Promise.all([p.refetch(), a.refetch(), qc.invalidateQueries()]);
    } catch (e) {
      setError(explainError(e));
    } finally {
      setBusy("");
    }
  }

  const placed = p.rungs.reduce((t, r) => t + r.usdc, 0n);
  const standing = st?.usdcInWall ?? 0n;
  const used = placed > standing ? placed - standing : 0n;
  const unplaced = st?.usdcUnplaced ?? 0n;
  const total = placed + unplaced || 1n;
  const pct = (v: bigint) => `${Number((v * 1000n) / total) / 10}%`;
  const inBand = p.priceUsd !== undefined && p.priceUsd >= floor;
  const left = timeLeft(lockedUntil - nowSec);

  return (
    <Card
      title="Price support"
      description={
        s.settled
          ? `The support window is over. The wall was removed, the tokens it bought back were burned and its USDC went to the issuer.`
          : `The money raised by the extra ${s.greenshoeBps / 100}% of tokens (${s.greenshoeBps / 100}/${100 + s.greenshoeBps / 100} of the raise) sits in the pool as a buy wall from the auction price down ${depthBps / 100}%. The issuer can't touch it; the hook locks it until the window ends.`
      }
      action={<Pill tone={s.settled ? "muted" : windowOver ? "bad" : "ok"}>{s.settled ? "Settled" : windowOver ? "Window ended" : `Locked · ${left} left`}</Pill>}
    >
      <div className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Stat label="Pool price" value={p.priceUsd !== undefined ? fmtPrice(p.priceUsd) : "—"} sub={p.priceUsd === undefined ? "" : inBand ? "Inside the band" : "Below the band"} />
        <Stat label="Support band" value={`${fmtPrice(floor)}`} sub={`to ${fmtPrice(open)}`} />
        <Stat label="Bought back" value={st ? fmtTokensCompact(Number(formatUnits(s.settled ? s.tokensBurned : st.tokensBought, decimals))) : "—"} sub={s.settled ? `${symbol} burned` : symbol} />
        <Stat label="Wall standing" value={usd(s.settled ? 0n : standing)} sub={`of ${usd(s.reserve)} reserve`} />
      </div>

      {!s.settled && (
        <div className="mt-5">
          <div className="flex h-3 overflow-hidden bg-line" role="img" aria-label={`${usd(standing)} standing, ${usd(used)} spent buying back, ${usd(unplaced)} not placed yet`}>
            <div className="h-full bg-accent" style={{ width: pct(standing) }} />
            <div className="h-full bg-ink" style={{ width: pct(used) }} />
          </div>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
            <Legend color="bg-accent" text={`${usd(standing)} standing`} />
            <Legend color="bg-ink" text={`${usd(used)} spent buying back`} />
            <Legend color="bg-line" text={`${usd(unplaced)} not placed yet`} />
          </div>
        </div>
      )}

      <div className="mt-6">
        <p className="eyebrow mb-2">Pool price{p.plain ? " · Plainsight vs plain launch" : ""}</p>
        {p.openBlock !== undefined ? (
          <PoolChart
            open={open}
            depthBps={depthBps}
            fromBlock={p.openBlock}
            nowBlock={a.block}
            ours={{ name: `${symbol} (Plainsight)`, color: "#0066FF", points: p.history, now: p.priceUsd }}
            plain={p.plain ? { name: "Plain launch", color: "#c4561a", dashed: true, points: p.plain.history, now: p.plain.priceUsd } : undefined}
          />
        ) : (
          <div className="h-[200px] animate-pulse bg-ground" />
        )}
      </div>

      {p.rungs.length > 0 && !s.settled && (
        <div className="mt-6">
          <p className="eyebrow mb-1">The wall, rung by rung</p>
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="text-left text-xs text-muted">
                <th className="py-2 font-semibold">Buys between</th>
                <th className="py-2 text-right font-semibold">USDC</th>
                <th className="py-2 text-right font-semibold">Status</th>
              </tr>
            </thead>
            <tbody>
              {p.rungs.map((r, i) => {
                const a1 = tickToUsd(r.tickLower, p.tokenIs0, decimals);
                const a2 = tickToUsd(r.tickUpper, p.tokenIs0, decimals);
                const [lo, hi] = a1 < a2 ? [a1, a2] : [a2, a1];
                const price = p.priceUsd ?? hi;
                const state = price >= hi ? "Standing" : price > lo ? "Buying" : "Filled";
                return (
                  <tr key={i} className="border-t border-line">
                    <td className="py-2">
                      {fmtPrice(hi)} → {fmtPrice(lo)}
                    </td>
                    <td className="py-2 text-right">{usd(r.usdc)}</td>
                    <td className={`py-2 text-right font-semibold ${state === "Standing" ? "text-positive-ink" : state === "Buying" ? "text-ink" : "text-muted"}`}>{state}</td>
                  </tr>
                );
              })}
              {st && st.rungsPlaced < st.rungCount && (
                <tr className="border-t border-line text-muted">
                  <td className="py-2" colSpan={2}>
                    {st.rungCount - st.rungsPlaced} more rung{st.rungCount - st.rungsPlaced > 1 ? "s" : ""} ({usd(unplaced)}) on the release schedule
                  </td>
                  <td className="py-2 text-right text-xs">{st.nextRungAt > 0n ? `from ${when(Number(st.nextRungAt))}` : ""}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {s.settled && (
        <p className="mt-5 mb-0 bg-ground p-3 text-sm">
          Settled: {fmtTokensCompact(Number(formatUnits(s.tokensBurned, decimals)))} {symbol} bought back and burned; {usd(s.usdcReturned)} returned to the issuer.
        </p>
      )}

      {error && (
        <div className="mt-4">
          <Alert>{error}</Alert>
        </div>
      )}
      {address && !s.settled && (
        <div className="mt-5 flex flex-wrap gap-3">
          {st && st.rungsPlaced < st.rungCount && !windowOver && (
            <button type="button" className="btn" disabled={!!busy || st.nextRungAt === 0n || nowSec < Number(st.nextRungAt)} onClick={() => send("replenish")}>
              {busy === "replenish" ? "Placing…" : nowSec < Number(st.nextRungAt) ? `Next rung at ${when(Number(st.nextRungAt))}` : "Place the next rungs"}
            </button>
          )}
          {windowOver && (
            <button type="button" className="btn btn-primary" disabled={!!busy} onClick={() => send("settle")}>
              {busy === "settle" ? "Settling…" : `Settle: burn the buy-backs, return the USDC`}
            </button>
          )}
        </div>
      )}

      <div className="mt-5 border-t border-line pt-4">
        <CopyAddress address={addresses.plainsightHook} label="Hook" kind="address" />
      </div>
    </Card>
  );
}

function Legend({ color, text }: { color: string; text: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`inline-block h-2.5 w-2.5 ${color}`} />
      {text}
    </span>
  );
}
