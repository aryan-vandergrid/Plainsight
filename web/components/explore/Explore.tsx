"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useMemo, useState } from "react";
import { ScoreBadge } from "@/components/ScoreBadge";
import { countdown, fmtPrice, fmtTokensCompact, fmtUsdCompact, timeLeft } from "@/lib/auction";
import { PARENT } from "@/lib/manifest";
import type { Launches, LaunchStatus, LaunchSummary } from "@/lib/server/launches";

const FILTERS: { key: LaunchStatus | "all"; text: string }[] = [
  { key: "all", text: "All" },
  { key: "live", text: "Auction live" },
  { key: "upcoming", text: "Upcoming" },
  { key: "trading", text: "Trading" },
  { key: "settled", text: "Settled" },
  { key: "refunded", text: "Refunded" },
  { key: "blocked", text: "Blocked" },
];

const LOOK: Record<LaunchStatus, { tag: string; dot: string; text: string }> = {
  live: { tag: "border-accent/30 bg-accent-tint text-blue-ink", dot: "bg-accent", text: "Auction live" },
  upcoming: { tag: "border-edge bg-white text-ink", dot: "bg-ink", text: "Upcoming" },
  trading: { tag: "border-positive/25 bg-positive-tint text-positive-ink", dot: "bg-positive", text: "Trading" },
  settled: { tag: "border-edge bg-ground text-muted", dot: "bg-faint", text: "Settled" },
  refunded: { tag: "border-edge bg-ground text-muted", dot: "bg-faint", text: "Refunded" },
  blocked: { tag: "border-negative/25 bg-negative-tint text-negative", dot: "bg-negative", text: "Blocked" },
};

const PRINCIPLES = [
  ["Disclosed", "Every insider wallet named on-chain and under ENS before anything trades."],
  ["One price", "A continuous clearing auction: every bidder pays the same price per block."],
  ["Supported", "The money from the extra 15% of tokens (about 13% of the raise) becomes a buy wall for 30 days. The issuer can't touch it."],
  ["Surveilled", "Wash trades counted as fake and penalised. Insiders pay more to sell."],
] as const;

const LABEL_RE = /^[a-z0-9-]{1,63}$/;

export function Explore() {
  const q = useQuery({
    queryKey: ["launches"],
    queryFn: async (): Promise<Launches> => {
      const r = await fetch("/api/launches");
      if (!r.ok) throw new Error(`${r.status}`);
      return r.json();
    },
    refetchInterval: 15_000,
  });
  const [filter, setFilter] = useState<LaunchStatus | "all">("all");
  const [search, setSearch] = useState("");

  const all = q.data?.launches;
  const counts = useMemo(() => {
    const c: Record<string, number> = { all: all?.length ?? 0 };
    for (const l of all ?? []) c[l.status] = (c[l.status] ?? 0) + 1;
    return c;
  }, [all]);
  const term = search.trim().toLowerCase().replace(new RegExp(`\\.${PARENT.replace(".", "\\.")}$`), "");
  const shown = (all ?? []).filter(
    (l) => (filter === "all" || l.status === filter) && (!term || l.label.includes(term) || l.name.toLowerCase().includes(term) || l.symbol.toLowerCase().includes(term)),
  );

  return (
    <main>
      <section className="border-b border-edge">
        <div className="mx-auto max-w-[1200px] px-4 pt-14 pb-12 sm:px-8 sm:pt-20 sm:pb-16">
          <p className="m-0 font-mono text-[11px] tracking-[0.14em] text-accent uppercase">Token launches · Ethereum Sepolia</p>
          <h1 className="h mt-6 max-w-[860px] text-[40px] leading-[1.04] font-semibold tracking-[-0.035em] sm:text-[60px]">
            Every insider disclosed. <span className="text-faint">Every launch verified before it trades.</span>
          </h1>
          <p className="mt-6 mb-0 max-w-[600px] text-[17px] leading-[1.7] text-muted">
            Plainsight runs token launches the way an IPO runs: insiders named on-chain, one fair auction price, a 30-day stabilisation reserve, and volume that is checked rather than claimed.
          </p>
          <div className="mt-9 flex flex-wrap gap-3">
            <Link href="/create" className="btn btn-primary min-h-12 px-7">
              Create a launch <span aria-hidden="true">→</span>
            </Link>
            <a href="#launches" className="btn min-h-12 px-7">
              View launches
            </a>
          </div>
          <dl className="mt-14 grid gap-x-10 gap-y-7 border-t border-edge pt-9 sm:grid-cols-2 lg:grid-cols-4">
            {PRINCIPLES.map(([t, d]) => (
              <div key={t}>
                <dt className="font-mono text-[15px] font-bold tracking-[-0.01em]">{t}</dt>
                <dd className="m-0 mt-2 text-[13px] leading-relaxed text-muted">{d}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      <section className="border-b border-edge bg-ground" aria-label="Totals">
        <dl className="mx-auto grid max-w-[1200px] grid-cols-2 px-4 sm:px-8 lg:grid-cols-4">
          <Stat k="Launches" v={q.data ? String(q.data.totals.launches) : undefined} />
          <Stat k="Raised through auctions" v={q.data ? fmtUsdCompact(q.data.totals.raisedUsd) : undefined} />
          <Stat k="Fake volume caught" v={q.data ? fmtUsdCompact(q.data.totals.fakeUsd) : undefined} />
          <Stat k="Blocked by checks" v={q.data ? String(q.data.totals.blocked) : undefined} />
        </dl>
      </section>

      <section id="launches" className="mx-auto max-w-[1200px] scroll-mt-20 px-4 pt-12 sm:px-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="eyebrow">Register</p>
            <h2 className="h mt-2 text-[28px]">Launches</h2>
          </div>
          <label className="flex min-h-11 w-full items-center gap-2 border border-field bg-white px-3 focus-within:border-ink sm:w-[300px]">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#666" strokeWidth="2" strokeLinecap="square" aria-hidden="true">
              <circle cx="11" cy="11" r="7" />
              <path d="M20 20l-4-4" />
            </svg>
            <input aria-label="Search launches" placeholder="Search name, symbol or ENS" value={search} onChange={(e) => setSearch(e.target.value)} className="min-w-0 flex-1 border-0 bg-transparent text-sm outline-none placeholder:text-faint" />
          </label>
        </div>

        <div className="-mx-4 mt-6 overflow-x-auto border-b border-edge px-4 sm:mx-0 sm:px-0" role="group" aria-label="Filter by status">
          <div className="flex gap-7">
            {FILTERS.map((f) => {
              const on = filter === f.key;
              return (
                <button
                  key={f.key}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setFilter(f.key)}
                  className={`relative -mb-px flex min-h-11 flex-none cursor-pointer items-center gap-2 border-b bg-transparent px-0 text-[14px] ${on ? "border-ink text-ink" : "border-transparent text-muted hover:text-ink"}`}
                >
                  {f.text}
                  {q.data && <span className="font-mono text-[11px] text-faint">{counts[f.key] ?? 0}</span>}
                </button>
              );
            })}
          </div>
        </div>

        {q.isError && !q.data && (
          <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border border-negative/25 bg-negative-tint px-5 py-4">
            <p className="m-0 text-sm text-negative">Couldn&apos;t load launches from Sepolia.</p>
            <button type="button" className="btn min-h-10" onClick={() => q.refetch()}>
              Try again
            </button>
          </div>
        )}

        {!q.data && !q.isError && (
          <div className="mt-6 flex flex-col gap-px" aria-busy="true" aria-label="Loading launches">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-[68px] animate-pulse bg-ground" />
            ))}
          </div>
        )}

        {q.data && shown.length > 0 && (
          <>
            <LaunchTable rows={shown} />
            <div className="mt-6 grid gap-4 md:hidden">
              {shown.map((l) => (
                <LaunchCard key={l.label} l={l} />
              ))}
            </div>
          </>
        )}

        {q.data && shown.length === 0 && (
          <div className="mt-6 flex flex-col items-start gap-4 border border-edge px-6 py-8">
            <p className="m-0 text-muted">
              {all?.length === 0 ? "No launches yet." : term ? <>No launch matches &ldquo;{search.trim()}&rdquo;{filter !== "all" && " in this filter"}.</> : "No launches with this status right now."}
            </p>
            <div className="flex flex-wrap gap-2">
              {term && LABEL_RE.test(term) && (
                <Link href={`/launch/${term}`} className="btn">
                  Open <span className="font-mono text-[13px]">{`${term}.${PARENT}`}</span>
                </Link>
              )}
              {all?.length === 0 && (
                <Link href="/create" className="btn btn-primary">
                  Create a launch
                </Link>
              )}
            </div>
          </div>
        )}

        <p className="kicker mt-5 mb-0 normal-case tracking-normal">
          Live on Sepolia{q.data ? ` · block ${q.data.block.toLocaleString()}` : ""} · refreshes every 15 s
        </p>
      </section>
    </main>
  );
}

function Stat({ k, v }: { k: string; v?: string }) {
  return (
    <div className="border-edge py-7 pr-4 [&:nth-child(n+2)]:pl-6 [&:nth-child(2n)]:border-l lg:[&:nth-child(n+2)]:border-l lg:[&:nth-child(n+2)]:pl-8">
      <dt className="kicker">{k}</dt>
      {v === undefined ? <dd className="m-0 mt-3 h-8 w-20 animate-pulse bg-line" /> : <dd className="m-0 mt-2 text-[30px] font-medium tracking-[-0.02em]">{v}</dd>}
    </div>
  );
}

type View = {
  chip: string;
  stats: [string, string][];
  bar: { left: string; right: string; pct: number } | null;
  note: { tone: "bad" | "muted"; text: React.ReactNode } | null;
  cta: string;
  href: string;
};

function describe(l: LaunchSummary): View {
  const a = l.auction;
  const t = l.trading;
  const chip =
    l.status === "trading"
      ? l.poolPending
        ? "Pool opening"
        : t?.paused
          ? "Trading · paused"
          : "Trading"
      : l.status === "upcoming" && !a
        ? "Ready to launch"
        : LOOK[l.status].text;

  let stats: [string, string][] = [];
  let bar: { left: string; right: string; pct: number } | null = null;
  let note: { tone: "bad" | "muted"; text: React.ReactNode } | null = null;
  let cta = "View launch";

  if (l.status === "live" && a) {
    stats = [
      ["Price now", fmtPrice(a.clearingPriceUsd)],
      ["Coverage", a.coverage != null ? `${a.coverage.toFixed(2)}×` : "—"],
      ["Ends in", countdown(a.blocksToEnd)],
    ];
    bar = { left: "Raised", right: `${fmtUsdCompact(a.raisedUsd)} of ${fmtUsdCompact(a.minRaiseUsd)} minimum`, pct: a.minRaiseUsd > 0 ? (a.raisedUsd / a.minRaiseUsd) * 100 : 0 };
    cta = "View launch and bid";
  } else if (l.status === "upcoming" && a) {
    stats = [
      ["For sale", fmtTokensCompact(a.supplyTokens)],
      ["Floor price", a.floorPriceUsd != null ? fmtPrice(a.floorPriceUsd) : "—"],
      ["Starts in", countdown(a.blocksToStart)],
    ];
    bar = { left: "Auction scheduled", right: `All ${l.checks.total} checks passed`, pct: 0 };
  } else if (l.status === "upcoming") {
    note = { tone: "muted", text: `All ${l.checks.total} checks passed. The auction starts when the issuer launches it.` };
  } else if (l.status === "trading" && a && t) {
    stats = [
      ["Price", fmtPrice(t.priceUsd)],
      ["Auction price", fmtPrice(t.openPriceUsd)],
      ["Real volume", fmtUsdCompact(t.realUsd)],
    ];
    bar = { left: "Buy wall used", right: `${Math.round(t.wallUsedPct)}% · ${t.secsLeft > 0 ? `${timeLeft(t.secsLeft)} left` : "window ended"}`, pct: t.wallUsedPct };
    if (t.fakeUsd > 0 || t.activeFlags > 0)
      note = {
        tone: "muted",
        text: [t.fakeUsd > 0 && `${fmtUsdCompact(t.fakeUsd)} fake volume caught and penalised`, t.activeFlags > 0 && `${t.activeFlags} wallet${t.activeFlags > 1 ? "s" : ""} flagged`].filter(Boolean).join(" · "),
      };
    cta = "View trading page";
  } else if (l.status === "trading" && a) {
    stats = [
      ["Auction price", fmtPrice(a.clearingPriceUsd)],
      ["Raised", fmtUsdCompact(a.raisedUsd)],
      ["Bidders", String(a.bidders)],
    ];
    note = { tone: "muted", text: "Auction closed above the minimum raise. The pool and its price support open next." };
  } else if (l.status === "settled" && a && t) {
    stats = [
      ["Auction price", fmtPrice(a.clearingPriceUsd)],
      ["Bought back", fmtTokensCompact(t.tokensBoughtBack || t.tokensBurned)],
      ["Burned", fmtTokensCompact(t.tokensBurned)],
    ];
    bar = { left: "Support window", right: `Complete · ${fmtUsdCompact(t.usdcReturned)} returned to issuer`, pct: 100 };
    cta = "View report";
  } else if (l.status === "refunded" && a) {
    stats = [
      ["Raised", fmtUsdCompact(a.raisedUsd)],
      ["Min raise", fmtUsdCompact(a.minRaiseUsd)],
      ["Bidders", String(a.bidders)],
    ];
    note = { tone: "muted", text: "Minimum raise not met, so every bidder gets their USDC back. No pool opened." };
  } else if (l.status === "blocked") {
    note = {
      tone: "bad",
      text: (
        <>
          <strong>{l.checks.failed ?? "A check"}</strong> failed ({l.checks.passed}/{l.checks.total} passed). Launch stays disabled until every check passes.
        </>
      ),
    };
    cta = "View checks";
  }

  const href = l.status === "trading" && !l.poolPending ? `/launch/${l.label}/trade` : `/launch/${l.label}`;

  return { chip, stats, bar, note, cta, href };
}

function StatusTag({ l, chip }: { l: LaunchSummary; chip: string }) {
  const look = LOOK[l.status];
  return (
    <span className={`inline-flex items-center gap-2 border px-2 py-[5px] font-mono text-[10px] leading-none tracking-[0.08em] whitespace-nowrap uppercase ${look.tag}`}>
      <span className={`h-[6px] w-[6px] ${look.dot} ${l.status === "live" ? "animate-pulse" : ""}`} aria-hidden="true" />
      {chip}
    </span>
  );
}

function Symbol({ l }: { l: LaunchSummary }) {
  return (
    <span className="flex h-10 w-10 flex-none items-center justify-center border border-edge bg-ground font-mono text-[11px] font-bold tracking-[0.04em]" aria-hidden="true">
      {l.symbol.slice(0, 4).toUpperCase()}
    </span>
  );
}

function LaunchTable({ rows }: { rows: LaunchSummary[] }) {
  const th = "kicker px-4 py-3 text-left font-normal first:pl-0";
  return (
    <div className="mt-2 hidden md:block">
      <table className="w-full border-collapse text-[14px]">
        <caption className="sr-only">Launches and their status</caption>
        <thead>
          <tr className="border-b border-edge">
            <th scope="col" className={th}>Launch</th>
            <th scope="col" className={th}>Status</th>
            <th scope="col" className={`${th} text-right`}>Price</th>
            <th scope="col" className={`${th} text-right`}>Raised</th>
            <th scope="col" className={`${th} text-right`}>Coverage</th>
            <th scope="col" className={`${th} text-right`}>Volume</th>
            <th scope="col" className={th}>Window</th>
            <th scope="col" className={th}>Score</th>
            <th scope="col" className="w-8"><span className="sr-only">Open</span></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((l) => (
            <LaunchRow key={l.label} l={l} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function LaunchRow({ l }: { l: LaunchSummary }) {
  const v = describe(l);
  const a = l.auction;
  const t = l.trading;
  const td = "px-4 py-4 align-middle first:pl-0";
  const price = t ? fmtPrice(t.priceUsd) : a ? fmtPrice(a.clearingPriceUsd) : "—";
  const support =
    l.status === "settled" && t
      ? `Settled · ${fmtUsdCompact(t.usdcReturned)} returned`
      : t
        ? `${Math.round(t.wallUsedPct)}% used · ${t.secsLeft > 0 ? `${timeLeft(t.secsLeft)} left` : "ended"}`
        : l.status === "live" && a
          ? `Auction ends in ${countdown(a.blocksToEnd)}`
          : l.status === "upcoming" && a
            ? `Auction starts in ${countdown(a.blocksToStart)}`
            : l.status === "blocked"
              ? `${l.checks.failed ?? "A check"} failed`
              : l.status === "refunded"
                ? "Minimum raise not met"
                : l.status === "upcoming"
                  ? `All ${l.checks.total} checks passed`
                  : "—";
  return (
    <tr className="group border-b border-line transition-colors hover:bg-ground">
      <td className={td}>
        <Link href={v.href} className="flex items-center gap-3 text-ink no-underline">
          <Symbol l={l} />
          <span className="min-w-0">
            <span className="block truncate font-medium group-hover:text-accent">{l.name}</span>
            <span className="block truncate font-mono text-[11px] text-muted">{l.ens}</span>
          </span>
        </Link>
      </td>
      <td className={td}>
        <StatusTag l={l} chip={v.chip} />
      </td>
      <td className={`${td} text-right font-medium`}>{price}</td>
      <td className={`${td} text-right`}>
        {a ? (
          <>
            {fmtUsdCompact(a.raisedUsd)}
            <span className="block text-[12px] whitespace-nowrap text-muted">of {fmtUsdCompact(a.minRaiseUsd)} min</span>
          </>
        ) : (
          "—"
        )}
      </td>
      <td className={`${td} text-right`}>{a?.coverage != null ? `${a.coverage.toFixed(2)}×` : "—"}</td>
      <td className={`${td} text-right`}>
        {t ? (
          <>
            {fmtUsdCompact(t.realUsd)}
            <span className={`block text-[12px] whitespace-nowrap ${t.fakeUsd > 0 ? "text-negative" : "text-muted"}`}>{fmtUsdCompact(t.fakeUsd)} fake</span>
          </>
        ) : (
          "—"
        )}
      </td>
      <td className={`${td} min-w-[180px] max-w-[220px] text-[13px] leading-snug ${l.status === "blocked" ? "text-negative" : "text-muted"}`}>
        {t && l.status === "trading" && (
          <span className="mb-1.5 block h-[3px] w-full max-w-[160px] bg-line" aria-hidden="true">
            <span className="block h-full bg-ink" style={{ width: `${Math.min(100, Math.max(0, t.wallUsedPct))}%` }} />
          </span>
        )}
        {support}
      </td>
      <td className={td}>{l.status !== "blocked" ? <ScoreBadge score={l.score} size="sm" /> : <span className="text-muted">—</span>}</td>
      <td className={`${td} pr-0 text-right text-faint group-hover:text-ink`} aria-hidden="true">
        →
      </td>
    </tr>
  );
}

function LaunchCard({ l }: { l: LaunchSummary }) {
  const { chip, stats, bar, note, cta, href } = describe(l);
  const t = l.trading;
  return (
    <article className="flex flex-col border border-edge bg-white">
      <div className="flex items-center gap-3 p-4">
        <Symbol l={l} />
        <div className="min-w-0 flex-1">
          <h3 className="h truncate text-[17px]">{l.name}</h3>
          <p className="m-0 mt-0.5 truncate font-mono text-[11px] text-muted">{l.ens}</p>
        </div>
        <StatusTag l={l} chip={chip} />
      </div>

      <div className="flex flex-col gap-4 border-t border-line p-4">
        {l.status !== "blocked" && (
          <div className="flex flex-wrap items-center gap-2">
            <ScoreBadge score={l.score} size="sm" />
            {t?.paused && <span className="border border-negative/25 bg-negative-tint px-2 py-[5px] font-mono text-[10px] leading-none tracking-[0.08em] text-negative uppercase">Swaps paused</span>}
          </div>
        )}
        {stats.length > 0 && (
          <dl className="m-0 grid grid-cols-3 gap-3">
            {stats.map(([k, val]) => (
              <div key={k} className="min-w-0">
                <dt className="kicker truncate text-[10px]">{k}</dt>
                <dd className="m-0 mt-1 truncate text-[15px] font-medium">{val}</dd>
              </div>
            ))}
          </dl>
        )}
        {bar && (
          <div>
            <div className="mb-2 flex justify-between gap-3 text-[12px] text-muted">
              <span>{bar.left}</span>
              <span className="text-right text-ink">{bar.right}</span>
            </div>
            <div className="h-[3px] bg-line" role="progressbar" aria-label={bar.left} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(Math.min(100, bar.pct))}>
              <div className="h-full bg-ink" style={{ width: `${Math.min(100, Math.max(0, bar.pct))}%` }} />
            </div>
          </div>
        )}
        {note && <p className={`m-0 px-3 py-2.5 text-[13px] leading-snug ${note.tone === "bad" ? "bg-negative-tint text-negative" : "bg-ground text-muted"}`}>{note.text}</p>}
      </div>

      <Link href={href} className="flex min-h-12 items-center justify-between border-t border-edge px-4 text-[14px] font-medium text-ink no-underline hover:bg-ground">
        {cta}
        <span aria-hidden="true">→</span>
        <span className="sr-only">: {l.name}</span>
      </Link>
    </article>
  );
}
