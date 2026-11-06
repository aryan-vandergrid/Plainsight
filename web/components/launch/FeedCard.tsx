"use client";

import { keccak256, toBytes, type Hex } from "viem";
import { Card, CheckIcon } from "@/components/create/ui";
import { fmtPrice, fmtUsdCompact } from "@/lib/auction";
import { ScoreBadge } from "@/components/ScoreBadge";
import { useFeed } from "@/lib/useFeed";

export function FeedCard({ label }: { label: string }) {
  const url = `/api/feed/${label}`;
  const feed = useFeed(label);
  const f = feed.data;

  return (
    <Card
      title="Public feed"
      description="Everything on this page as JSON, for aggregators, exchanges and compliance tools. Same contract reads, same numbers."
      action={
        <a href={url} target="_blank" rel="noreferrer" className="btn min-h-9 px-3 text-sm">
          Open JSON
        </a>
      }
    >
      {feed.isError && <p className="mt-4 mb-0 text-sm text-negative">The feed couldn&apos;t reach Sepolia. Refresh to try again.</p>}
      {!f && !feed.isError && <div className="mt-4 h-24 animate-pulse bg-ground" />}
      {f && (
        <>
          <div className="mt-5 flex flex-wrap items-center gap-3">
            <ScoreBadge score={f.score} />
            <span className="text-xs text-muted">block {f.block.toLocaleString()}</span>
          </div>
          <ul className="mt-3 mb-0 grid list-none gap-2 p-0 text-sm sm:grid-cols-2">
            {(
              [
                ["Disclosed and verified", f.score.disclosed],
                ["Fair auction (graduated)", f.score.fairAuction],
                ["Greenshoe active or settled", f.score.greenshoe],
                ["Volume verified by the hook", f.score.volumeVerified],
              ] as const
            ).map(([t, ok]) => (
              <li key={t} className="flex items-center gap-2.5">
                <CheckIcon state={ok ? "passed" : "pending"} />
                <span className={ok ? "" : "text-muted"}>{t}</span>
              </li>
            ))}
          </ul>

          <dl className="mt-5 mb-0 grid grid-cols-2 gap-x-4 gap-y-2 bg-ground p-4 font-mono text-xs sm:grid-cols-3">
            <Row k="auction.clearingPriceUsd" v={f.auction ? fmtPrice(f.auction.clearingPriceUsd) : "—"} />
            <Row k="auction.coverage" v={f.auction?.coverage != null ? `${f.auction.coverage.toFixed(2)}×` : "—"} />
            <Row k="pool.priceUsd" v={f.pool ? fmtPrice(f.pool.priceUsd) : "—"} />
            <Row k="volume.real" v={f.volume ? fmtUsdCompact(f.volume.real.usd) : "—"} />
            <Row k="volume.fake" v={f.volume ? fmtUsdCompact(f.volume.fake.usd) : "—"} />
            <Row k="flags (active)" v={String(f.flags.filter((x) => x.active).length)} />
          </dl>

          <div className="mt-5">
            <p className="eyebrow mb-2">Chainlink CRE reports</p>
            {f.reports.length === 0 ? (
              <p className="m-0 text-sm text-muted">No report published yet. The CRE workflow publishes day 1, 7 and 30.</p>
            ) : (
              <ul className="m-0 flex list-none flex-col gap-2 p-0">
                {f.reports.map((r) => (
                  <ReportRow key={`${r.day}-${r.hash}`} r={r} />
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </Card>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="min-w-0">
      <dt className="truncate text-muted">{k}</dt>
      <dd className="m-0 font-sans text-sm font-semibold">{v}</dd>
    </div>
  );
}

function ReportRow({ r }: { r: { day: number; hash: Hex; uri: string; at: number } }) {
  let ok: boolean | null = null;
  let summary = "";
  try {
    const b64 = r.uri.split(",")[1] ?? "";
    const json = new TextDecoder().decode(Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)));
    ok = keccak256(toBytes(json)) === r.hash;
    const j = JSON.parse(json) as { volume: { real: string; fake: string }; vault: { tokensBought: string }; paused: boolean };
    summary = `real ${fmtUsdCompact(Number(j.volume.real) / 1e6)} · fake ${fmtUsdCompact(Number(j.volume.fake) / 1e6)}${j.paused ? " · paused" : ""}`;
  } catch {
    ok = null;
  }
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1 border border-line px-3 py-2 text-sm">
      <span className="font-semibold">Day {r.day}</span>
      <span className="font-mono text-xs text-muted">{r.hash.slice(0, 14)}…</span>
      <span className="text-xs text-muted">{summary}</span>
      <span className={`ml-auto text-xs font-semibold ${ok ? "text-positive-ink" : "text-negative"}`}>{ok === null ? "Unreadable" : ok ? "Hash verified" : "Hash mismatch"}</span>
    </li>
  );
}
