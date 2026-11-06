import type { Hex } from "viem";
import { bytes32ToText } from "@/lib/trade";

export function PausedBanner({ reason, until }: { reason?: Hex; until?: number }) {
  return (
    <div role="status" className="flex items-start gap-3 border-2 border-negative bg-negative-tint p-4 text-negative">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden="true" className="mt-0.5 flex-none">
        <path d="M9 5v14M15 5v14" />
      </svg>
      <div>
        <p className="m-0 font-semibold">Trading is paused by the stabilisation agent</p>
        <p className="m-0 mt-0.5 text-sm">
          Reason code <span className="font-mono font-semibold">{reason ? bytes32ToText(reason) : "…"}</span>. Swaps are blocked; liquidity providers can still withdraw.
          {until ? ` Trading resumes on its own by ${new Date(until * 1000).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}.` : ""}
        </p>
      </div>
    </div>
  );
}
