"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { fmtPrice, q96ToUsd, type CheckpointPoint } from "@/lib/auction";

const H = 220;
const PAD = { l: 52, r: 16, t: 16, b: 28 };
const INK = "#0b6b58";
const GRID = "#EBEBEB";
const AXIS = "#666666";

export function PriceChart({
  points,
  startBlock,
  endBlock,
  nowBlock,
  nowQ96,
  floorQ96,
  decimals,
}: {
  points: CheckpointPoint[];
  startBlock: bigint;
  endBlock: bigint;
  nowBlock?: bigint;
  nowQ96?: bigint;
  floorQ96: bigint;
  decimals: number;
}) {
  const svg = useRef<SVGSVGElement>(null);
  const box = useRef<HTMLElement>(null);
  const [hover, setHover] = useState<number | null>(null);
  const [W, setW] = useState(640);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(280, Math.round(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const series = useMemo(() => {
    const s = Number(startBlock);
    const e = Number(endBlock);
    const now = nowBlock === undefined ? s : Math.min(Math.max(Number(nowBlock), s), e);
    const stored = points.filter((p) => p.block >= startBlock).map((p) => ({ b: Number(p.block), usd: q96ToUsd(p.priceQ96, decimals) }));
    const pts = stored.map((p, i) => (i === 0 ? p : { b: Math.min(p.b, stored[i - 1].b + 1), usd: p.usd }));
    const floor = q96ToUsd(floorQ96, decimals);
    if (pts.length === 0 || pts[0].b > s) pts.unshift({ b: s, usd: floor });
    const tail = pts[pts.length - 1];
    const live = nowQ96 !== undefined ? Math.max(q96ToUsd(nowQ96, decimals), tail.usd) : tail.usd;
    if (live > tail.usd) pts.push({ b: Math.min(tail.b + 1, now), usd: live });
    if (pts[pts.length - 1].b < now) pts.push({ b: now, usd: live });
    return { s, e, now, pts, floor };
  }, [points, startBlock, endBlock, nowBlock, nowQ96, floorQ96, decimals]);

  const { s, e, now, pts, floor } = series;
  const maxUsd = Math.max(...pts.map((p) => p.usd), floor * 1.2);
  const ticks = niceTicks(floor * 0.9, maxUsd * 1.08, 4);
  const yMin = ticks[0];
  const yMax = ticks[ticks.length - 1];
  const x = (b: number) => PAD.l + ((b - s) / Math.max(1, e - s)) * (W - PAD.l - PAD.r);
  const y = (usd: number) => PAD.t + (1 - (usd - yMin) / (yMax - yMin || 1)) * (H - PAD.t - PAD.b);

  let d = `M${x(pts[0].b)} ${y(pts[0].usd)}`;
  for (let i = 1; i < pts.length; i++) d += ` H${x(pts[i].b)} V${y(pts[i].usd)}`;

  const priceAt = (b: number) => {
    let v = pts[0].usd;
    for (const p of pts) if (p.b <= b) v = p.usd;
    return v;
  };

  function onMove(ev: React.PointerEvent<SVGSVGElement>) {
    const r = svg.current!.getBoundingClientRect();
    const px = ((ev.clientX - r.left) / r.width) * W;
    const b = Math.round(s + ((px - PAD.l) / (W - PAD.l - PAD.r)) * (e - s));
    setHover(b < s || b > now ? null : b);
  }

  const last = pts[pts.length - 1];
  const hb = hover ?? null;

  return (
    <figure ref={box} className="m-0">
      <svg
        ref={svg}
        viewBox={`0 0 ${W} ${H}`}
        className="block h-auto w-full touch-none select-none"
        role="img"
        aria-label={`Clearing price rose from ${fmtPrice(floor)} to ${fmtPrice(last.usd)}`}
        onPointerMove={onMove}
        onPointerLeave={() => setHover(null)}
      >
        {ticks.map((t) => (
          <g key={t}>
            <line x1={PAD.l} x2={W - PAD.r} y1={y(t)} y2={y(t)} stroke={GRID} />
            <text x={PAD.l - 8} y={y(t) + 4} textAnchor="end" fontSize="12" fill={AXIS}>
              {fmtPrice(t)}
            </text>
          </g>
        ))}
        <line x1={PAD.l} x2={W - PAD.r} y1={y(floor)} y2={y(floor)} stroke={AXIS} strokeDasharray="4 4" strokeWidth="1" />
        <text x={W - PAD.r} y={y(floor) - 6} textAnchor="end" fontSize="11" fill={AXIS}>
          Floor {fmtPrice(floor)}
        </text>
        <path d={d} fill="none" stroke={INK} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
        {now < e && <line x1={x(now)} x2={x(now)} y1={PAD.t} y2={H - PAD.b} stroke="#0A0A0A" strokeDasharray="3 4" strokeWidth="1" />}
        <circle cx={x(last.b)} cy={y(last.usd)} r="5" fill={INK} stroke="#fff" strokeWidth="2" />
        <text x={PAD.l} y={H - 8} fontSize="12" fill={AXIS}>
          Start
        </text>
        <text x={W - PAD.r} y={H - 8} textAnchor="end" fontSize="12" fill={AXIS}>
          End
        </text>
        {hb !== null && (
          <g pointerEvents="none">
            <line x1={x(hb)} x2={x(hb)} y1={PAD.t} y2={H - PAD.b} stroke={AXIS} strokeWidth="1" />
            <circle cx={x(hb)} cy={y(priceAt(hb))} r="4.5" fill={INK} stroke="#fff" strokeWidth="2" />
          </g>
        )}
      </svg>
      <figcaption className="mt-1 flex min-h-5 flex-wrap justify-between gap-2 text-xs text-muted" aria-live="polite">
        {hb !== null ? (
          <span>
            Block {hb.toLocaleString()} · <span className="font-semibold text-ink">{fmtPrice(priceAt(hb))}</span>
          </span>
        ) : (
          <span>Hover the chart to see the price at any block.</span>
        )}
        <span>
          {Math.max(0, now - s).toLocaleString()} of {(e - s).toLocaleString()} blocks
        </span>
      </figcaption>
    </figure>
  );
}

function niceTicks(lo: number, hi: number, n: number): number[] {
  const span = Math.max(hi - lo, 1e-6);
  const raw = span / n;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((v) => v >= raw) ?? 10 * mag;
  const start = Math.floor(lo / step) * step;
  const out: number[] = [];
  for (let v = Math.max(0, start); ; v += step) {
    out.push(Number(v.toFixed(10)));
    if (v >= hi) break;
  }
  return out.length >= 2 ? out : [start, start + step];
}
