"use client";

import { formatUnits } from "viem";
import { Card } from "@/components/create/ui";
import { fmtTokensCompact, fmtUsdCompact } from "@/lib/auction";
import { TxHash } from "@/components/TxHash";
import { shortAddr } from "@/lib/format";
import { bytes32ToText } from "@/lib/trade";
import { FLAG_REASONS, type Activity } from "@/lib/useHook";
import type { LaunchData } from "@/lib/useLaunchData";

const usd = (v: bigint) => fmtUsdCompact(Number(formatUnits(v, 6)));
const TONE = { bad: "bg-negative", ok: "bg-positive", info: "bg-ink" } as const;

export function ActivityLog({ d }: { d: LaunchData }) {
  const rows: Activity[] = [];
  const count = new Map<string, number>();
  for (const x of d.h.activity) {
    const last = rows[rows.length - 1];
    if (x.kind === "roundTrip" && last?.kind === "roundTrip" && last.tx === x.tx) {
      rows[rows.length - 1] = { ...last, volume: last.volume + x.volume, penalty: last.penalty + x.penalty };
      count.set(x.tx, (count.get(x.tx) ?? 1) + 1);
    } else rows.push(x);
    if (rows.length >= 25) break;
  }
  const who = (w: `0x${string}`) => d.nameOf(w) ?? shortAddr(w);

  function line(x: Activity): { tone: keyof typeof TONE; text: React.ReactNode } {
    switch (x.kind) {
      case "roundTrip":
        return {
          tone: "bad",
          text: (
            <>
              {(count.get(x.tx) ?? 1) > 1 ? `${count.get(x.tx)} round trips` : "Round trip"} in one transaction by <span className="font-mono">{who(x.trader)}</span>: {usd(x.volume)} counted as fake
              {x.penalty > 0n && <>, {x.inUsdc ? usd(x.penalty) : `${fmtTokensCompact(Number(formatUnits(x.penalty, d.decimals)))} ${d.symbol}`} penalty to the treasury</>}
            </>
          ),
        };
      case "insider":
        return {
          tone: "bad",
          text: (
            <>
              Insider <span className="font-mono">{who(x.trader)}</span> sold {usd(x.volume)} inside the window and paid the {x.feePips / 10_000}% insider fee
            </>
          ),
        };
      case "paused":
        return { tone: "bad", text: <>Agent paused trading · <span className="font-mono font-semibold">{bytes32ToText(x.reason)}</span>{x.note ? ` · ${x.note}` : ""}</> };
      case "unpaused":
        return { tone: "ok", text: <>Agent resumed trading</> };
      case "rung":
        return { tone: "info", text: <>Vault placed buy-wall rung {x.index + 1}: {usd(x.usdc)}</> };
      case "opened":
        return { tone: "ok", text: <>Pool opened at the auction price with the Plainsight hook</> };
      case "flagged":
        return {
          tone: "bad",
          text: (
            <>
              FlowTrack flagged <span className="font-mono">{who(x.wallet)}</span> ({FLAG_REASONS[x.reason] ?? "flagged"}), posted on-chain by Chainlink CRE. It now pays the insider fee to sell.
            </>
          ),
        };
      case "report":
        return { tone: "info", text: <>Day {x.day} report published by Chainlink CRE · <span className="font-mono">{x.hash.slice(0, 10)}…</span></> };
      case "settled":
        return { tone: "info", text: <>Settled: {fmtTokensCompact(Number(formatUnits(x.burned, d.decimals)))} {d.symbol} burned, {usd(x.returned)} returned to the issuer</> };
    }
  }

  return (
    <Card title="Activity" description="Logged on-chain by the hook and the vault. Anyone can check every line.">
      {rows.length === 0 ? (
        <p className="mt-4 mb-0 text-sm text-muted">Nothing yet.</p>
      ) : (
        <ol className="mt-4 mb-0 flex list-none flex-col divide-y divide-line p-0">
          {rows.map((x, i) => {
            const l = line(x);
            return (
              <li key={`${x.tx}-${i}`} className="flex items-start gap-3 py-2.5 text-sm">
                <span className={`mt-1.5 h-2 w-2 flex-none ${TONE[l.tone]}`} aria-hidden="true" />
                <span className="min-w-0 flex-1">{l.text}</span>
                <span className="flex flex-none flex-col items-end gap-0.5">
                  <TxHash hash={x.tx} />
                  <span className="text-[11px] text-muted">Block {x.block.toLocaleString()}</span>
                </span>
              </li>
            );
          })}
        </ol>
      )}
    </Card>
  );
}
