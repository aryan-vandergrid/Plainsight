"use client";

import { formatUnits } from "viem";
import { Card, Stat } from "@/components/create/ui";
import { fmtTokensCompact, fmtUsdCompact } from "@/lib/auction";
import type { LaunchData } from "@/lib/useLaunchData";

const usd = (v: bigint) => fmtUsdCompact(Number(formatUnits(v, 6)));

export function VolumePanel({ d }: { d: LaunchData }) {
  const s = d.h.stats;
  const real = s?.realVolume ?? 0n;
  const fake = s?.fakeVolume ?? 0n;
  const reported = real + fake;
  const plain = d.p.plain ? d.p.plain.history.reduce((t, x) => t + x.volume, 0n) : undefined;
  const max = [reported, plain ?? 0n].reduce((m, v) => (v > m ? v : m), 1n);
  const w = (v: bigint) => `${Math.max(Number((v * 1000n) / max) / 10, v > 0n ? 0.6 : 0)}%`;
  const fakePct = reported > 0n ? Number((fake * 1000n) / reported) / 10 : 0;

  return (
    <Card title="Volume" description="The pool's hook checks every swap. Buying and selling back in the same transaction is counted as fake volume and pays a 1% penalty to the treasury, not to LPs.">
      <div className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Stat label="Real volume" value={usd(real)} sub="Counted trades" />
        <Stat label="Fake volume" value={usd(fake)} sub={reported > 0n ? `${fakePct}% of what was traded` : "None so far"} />
        <Stat label="Round trips caught" value={(s?.roundTrips ?? 0n).toLocaleString()} sub="Same-transaction wash" />
        <Stat
          label="Penalties paid"
          value={usd(s?.penaltyUsdc ?? 0n)}
          sub={s && s.penaltyToken > 0n ? `+ ${fmtTokensCompact(Number(formatUnits(s.penaltyToken, d.decimals)))} ${d.symbol}` : "To the treasury"}
        />
      </div>

      {plain !== undefined && (
        <div className="mt-6">
          <p className="eyebrow mb-3">What each pool reports</p>
          <div className="flex flex-col gap-3 text-sm">
            <div>
              <div className="mb-1 flex justify-between gap-2">
                <span className="font-semibold">Plain launch</span>
                <span className="font-semibold">{usd(plain)} reported</span>
              </div>
              <div className="h-3 bg-line">
                <div className="h-full" style={{ width: w(plain), background: "#c4561a" }} />
              </div>
            </div>
            <div>
              <div className="mb-1 flex flex-wrap justify-between gap-2">
                <span className="font-semibold">{d.symbol} (Plainsight)</span>
                <span>
                  <span className="font-semibold text-positive-ink">{usd(real)} real</span> · <span className="font-semibold">{usd(fake)} fake</span>
                </span>
              </div>
              <div className="flex h-3 overflow-hidden bg-line" role="img" aria-label={`${usd(real)} real, ${usd(fake)} fake`}>
                <div className="h-full" style={{ width: w(real), background: "#0066FF" }} />
                <div className="h-full" style={{ width: w(fake), background: "repeating-linear-gradient(135deg,#666666 0 4px,#D4D4D4 4px 8px)" }} />
              </div>
            </div>
          </div>
          <p className="help">Same wash bot, same pools. The plain pool counts every leg as volume; Plainsight separates it and charges for it.</p>
        </div>
      )}

      <div className="mt-5 border-t border-line pt-4 text-sm">
        <span className="font-semibold">Insider sells inside the window:</span>{" "}
        {s && s.insiderSells > 0n ? (
          <>
            {s.insiderSells.toString()} · {usd(s.insiderFeeVolume)}, each paying the {d.manifest ? d.manifest.insiderFeeBps / 100 : "…"}% insider fee instead of 0.30%.
          </>
        ) : (
          <span className="text-muted">none so far.</span>
        )}
      </div>
    </Card>
  );
}
