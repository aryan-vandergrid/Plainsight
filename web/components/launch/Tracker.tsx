import { clock, fmtPrice, timeLeft, type Phase } from "@/lib/auction";
import { useCountdown } from "@/lib/useCountdown";

type State = "done" | "current" | "blocked" | "next" | "skipped";

export function Tracker({
  phase,
  blocksLeft,
  finalUsd,
  refunded,
  pool,
}: {
  phase: Phase;
  blocksLeft?: number;
  finalUsd?: number;
  refunded?: boolean;
  pool?: { settled: boolean; lockedUntil: number; priceUsd?: number; now: number };
}) {
  const auctionSecs = useCountdown(blocksLeft);
  const auction: [State, string] =
    phase === "unverified"
      ? ["next", "After every check passes"]
      : phase === "ready"
        ? ["current", "Ready to start"]
        : phase === "upcoming"
          ? ["current", "Opens next block"]
          : phase === "live"
            ? ["current", `Ends in ${clock(auctionSecs ?? 0)}`]
            : refunded
              ? ["blocked", "Minimum missed · refunded"]
              : ["done", finalUsd !== undefined ? `Cleared at ${fmtPrice(finalUsd)}` : "Ended"];
  const after: State = phase === "ended" ? (refunded ? "skipped" : pool ? "done" : "current") : "next";
  const secsLeft = pool ? pool.lockedUntil - pool.now : 0;
  const shoe: [State, string] = refunded
    ? ["skipped", "Not reached"]
    : !pool
      ? ["next", "Buy wall below price"]
      : pool.settled
        ? ["done", "Window closed"]
        : secsLeft > 0
          ? ["current", `${timeLeft(secsLeft)} left`]
          : ["current", "Ready to settle"];
  const settled: [State, string] = refunded ? ["skipped", "Not reached"] : pool?.settled ? ["done", "Burned and paid out"] : ["next", "Burn and pay out"];

  const steps: { title: string; state: State; text: string }[] = [
    { title: "Registered", state: "done", text: "Manifest posted" },
    { title: "ENS verified", state: phase === "unverified" ? "blocked" : "done", text: phase === "unverified" ? "A check is failing" : "Names match the manifest" },
    { title: "Auction", state: auction[0], text: auction[1] },
    { title: "Pool opens", state: after, text: refunded ? "Not reached" : pool?.priceUsd !== undefined ? `Trading at ${fmtPrice(pool.priceUsd)}` : "At the final price" },
    { title: "Greenshoe 30 days", state: shoe[0], text: shoe[1] },
    { title: "Settled", state: settled[0], text: settled[1] },
  ];
  const doneCount = steps.filter((s) => s.state === "done").length;
  const pct = Math.round(((doneCount + (steps.some((s) => s.state === "current") ? 0.5 : 0)) / steps.length) * 100);

  return (
    <section className="card" aria-label="Launch progress">
      <ol className="m-0 grid list-none grid-cols-2 gap-4 p-0 sm:grid-cols-3 lg:grid-cols-6">
        {steps.map((s, i) => (
          <li key={s.title} className="flex min-w-0 flex-col gap-2" aria-current={s.state === "current" ? "step" : undefined}>
            <Dot state={s.state} n={i + 1} />
            <p className={`m-0 text-sm font-semibold ${s.state === "next" || s.state === "skipped" ? "text-muted" : ""} ${s.state === "blocked" ? "text-negative" : ""}`}>{s.title}</p>
            <p className={`m-0 text-xs ${s.state === "blocked" ? "font-semibold text-negative" : "text-muted"}`}>{s.text}</p>
          </li>
        ))}
      </ol>
      <div className="mt-5 h-1.5 overflow-hidden bg-line" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Launch progress">
        <div className="h-full bg-ink transition-[width] duration-500" style={{ width: `${pct}%` }} />
      </div>
    </section>
  );
}

function Dot({ state, n }: { state: State; n: number }) {
  const base = "flex h-8 w-8 flex-none items-center justify-center text-sm font-semibold";
  if (state === "done")
    return (
      <span className={`${base} bg-ink`}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M5 12l5 5L20 7" />
        </svg>
        <span className="sr-only">Done</span>
      </span>
    );
  if (state === "blocked")
    return (
      <span className={`${base} bg-negative-tint text-negative`}>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" aria-hidden="true">
          <path d="M6 6l12 12M18 6L6 18" />
        </svg>
        <span className="sr-only">Blocked</span>
      </span>
    );
  if (state === "current") return <span className={`${base} bg-mint text-ink`}>{n}</span>;
  return <span className={`${base} bg-line text-muted`}>{n}</span>;
}
