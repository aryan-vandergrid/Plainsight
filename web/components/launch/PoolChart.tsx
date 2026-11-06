"use client";

import { useEffect, useRef, useState } from "react";
import { fmtPrice } from "@/lib/auction";
import type { PricePoint } from "@/lib/pool";

const H = 240;
const PAD = { l: 52, r: 76, t: 16, b: 28 };
const OURS = "#0066FF";
const PLAIN = "#c4561a";
const GRID = "#EBEBEB";
const AXIS = "#666666";
const BAND = "#EBF2FF";

type Series = { name: string; color: string; dashed?: boolean; points: PricePoint[]; now?: number };

export function PoolChart({ open, depthBps, ours, plain, fromBlock, nowBlock }: { open: number; depthBps: number; ours: Series; plain?: Series; fromBlock: bigint; nowBlock?: bigint }) {
  const box = useRef<HTMLElement>(null);
  const [W, setW] = useState(640);
  const [hover, setHover] = useState<number | null>(null);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(280, Math.round(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const s = Number(fromBlock);
  const e = Math.max(Number(nowBlock ?? fromBlock), s + 1);
  const series = [ours, ...(plain ? [plain] : [])].map((x) => ({ ...x, pts: steps(x.points, s, e, open, x.now) }));
  const floor = open * (1 - depthBps / 10_000);
  const all = series.flatMap((x) => x.pts.map((p) => p.usd));
  const lo = Math.min(...all, floor) * 0.92;
  const hi = Math.max(...all, open) * 1.06;
  const x = (b: number) => PAD.l + ((b - s) / (e - s)) * (W - PAD.l - PAD.r);
  const y = (v: number) => PAD.t + (1 - (v - lo) / (hi - lo || 1)) * (H - PAD.t - PAD.b);
  const ticks = [lo, (lo + hi) / 2, hi].map((v) => Math.round(v * 100) / 100);

  const path = (pts: { b: number; usd: number }[]) => pts.reduce((d, p, i) => (i === 0 ? `M${x(p.b)} ${y(p.usd)}` : `${d} H${x(p.b)} V${y(p.usd)}`), "");
  const at = (pts: { b: number; usd: number }[], b: number) => pts.reduce((v, p) => (p.b <= b ? p.usd : v), pts[0].usd);

  function onMove(ev: React.PointerEvent<SVGSVGElement>) {
    const r = ev.currentTarget.getBoundingClientRect();
    const b = Math.round(s + ((ev.clientX - r.left - PAD.l) / (r.width - PAD.l - PAD.r)) * (e - s));
    setHover(b < s || b > e ? null : b);
  }

  return (
    <figure ref={box} className="m-0">
      {plain && (
        <div className="mb-2 flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted" aria-hidden="true">
          {series.map((x) => (
            <span key={x.name} className="inline-flex items-center gap-1.5">
              <svg width="18" height="6">
                <line x1="0" x2="18" y1="3" y2="3" stroke={x.color} strokeWidth="2.5" strokeDasharray={x.dashed ? "4 3" : undefined} />
              </svg>
              {x.name}
            </span>
          ))}
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-4" style={{ background: BAND }} />
            Support band
          </span>
        </div>
      )}
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="block h-auto w-full touch-none select-none"
        role="img"
        aria-label={series.map((x) => `${x.name}: ${fmtPrice(x.pts[x.pts.length - 1].usd)}`).join(", ") + `. Support band ${fmtPrice(floor)} to ${fmtPrice(open)}.`}
        onPointerMove={onMove}
        onPointerLeave={() => setHover(null)}
      >
        <rect x={PAD.l} y={y(open)} width={W - PAD.l - PAD.r} height={Math.max(0, y(floor) - y(open))} fill={BAND} />
        {ticks.map((t) => (
          <g key={t}>
            <line x1={PAD.l} x2={W - PAD.r} y1={y(t)} y2={y(t)} stroke={GRID} />
            <text x={PAD.l - 8} y={y(t) + 4} textAnchor="end" fontSize="12" fill={AXIS}>
              {fmtPrice(t)}
            </text>
          </g>
        ))}
        <line x1={PAD.l} x2={W - PAD.r} y1={y(open)} y2={y(open)} stroke={AXIS} strokeDasharray="4 4" />
        <text x={PAD.l + 4} y={y(open) - 5} fontSize="11" fill={AXIS}>
          Auction price {fmtPrice(open)}
        </text>
        <text x={PAD.l + 4} y={y(floor) + 13} fontSize="11" fill={AXIS}>
          Band floor {fmtPrice(floor)}
        </text>
        {series.map((sr) => {
          const last = sr.pts[sr.pts.length - 1];
          return (
            <g key={sr.name}>
              <path d={path(sr.pts)} fill="none" stroke={sr.color} strokeWidth="2.5" strokeDasharray={sr.dashed ? "6 4" : undefined} strokeLinejoin="round" />
              <circle cx={x(last.b)} cy={y(last.usd)} r="4.5" fill={sr.color} stroke="#fff" strokeWidth="2" />
              <text x={x(last.b) + 8} y={y(last.usd) + 4} fontSize="12" fontWeight="700" fill="#0A0A0A">
                {fmtPrice(last.usd)}
              </text>
            </g>
          );
        })}
        {hover !== null && (
          <g pointerEvents="none">
            <line x1={x(hover)} x2={x(hover)} y1={PAD.t} y2={H - PAD.b} stroke={AXIS} />
            {series.map((sr) => (
              <circle key={sr.name} cx={x(hover)} cy={y(at(sr.pts, hover))} r="4" fill={sr.color} stroke="#fff" strokeWidth="2" />
            ))}
          </g>
        )}
        <text x={PAD.l} y={H - 8} fontSize="12" fill={AXIS}>
          Pool opened
        </text>
        <text x={W - PAD.r} y={H - 8} textAnchor="end" fontSize="12" fill={AXIS}>
          Now
        </text>
      </svg>
      <figcaption className="mt-1 min-h-5 text-xs text-muted" aria-live="polite">
        {hover !== null ? (
          <>
            Block {hover.toLocaleString()} ·{" "}
            {series.map((sr, i) => (
              <span key={sr.name}>
                {i > 0 && " · "}
                {sr.name} <span className="font-semibold text-ink">{fmtPrice(at(sr.pts, hover))}</span>
              </span>
            ))}
          </>
        ) : (
          "Hover the chart to compare prices at any block."
        )}
      </figcaption>
    </figure>
  );
}

function steps(points: PricePoint[], s: number, e: number, open: number, now?: number) {
  const pts = [{ b: s, usd: open }, ...points.map((p) => ({ b: Math.max(s, Number(p.block)), usd: p.usd }))];
  const last = now ?? pts[pts.length - 1].usd;
  pts.push({ b: e, usd: last });
  return pts;
}
