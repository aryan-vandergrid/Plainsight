import type { Feed } from "@/lib/server/feed";

const ITEMS = [
  ["disclosed", "Disclosed and verified"],
  ["fairAuction", "Fair auction (graduated)"],
  ["greenshoe", "Price support active or settled"],
  ["volumeVerified", "Volume verified by the hook"],
] as const;

export function ScoreBadge({ score, size = "md" }: { score: Feed["score"]; size?: "sm" | "md" }) {
  const full = score.total === score.of;
  const detail = ITEMS.map(([k, t]) => `${score[k] ? "✓" : "✗"} ${t}`).join("\n");
  return (
    <span
      title={detail}
      aria-label={`Clean-launch score ${score.total} of ${score.of}. ${ITEMS.map(([k, t]) => `${t}: ${score[k] ? "yes" : "no"}`).join(". ")}`}
      className={`inline-flex items-center gap-2 border font-mono leading-none tracking-[0.06em] whitespace-nowrap uppercase ${full ? "border-positive/25 bg-positive-tint text-positive-ink" : "border-edge bg-ground text-muted"} ${size === "sm" ? "px-2 py-[5px] text-[10px]" : "px-2 py-[5px] text-[11px]"}`}
    >
      <span className="flex gap-[2px]" aria-hidden="true">
        {ITEMS.map(([k]) => (
          <span key={k} className={`h-[7px] w-[7px] ${score[k] ? "bg-positive" : "border border-field bg-white"}`} />
        ))}
      </span>
      Clean launch {score.total}/{score.of}
    </span>
  );
}
