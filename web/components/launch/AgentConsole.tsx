"use client";

import Link from "next/link";
import { useState } from "react";
import { TxHash } from "@/components/TxHash";
import { formatUnits, isAddressEqual, stringToHex } from "viem";
import { useAccount, usePublicClient, useWriteContract } from "wagmi";
import { sepolia } from "wagmi/chains";
import { WalletButton } from "@/components/Header";
import { Alert, Card, CopyAddress, Field, Pill, Stat } from "@/components/create/ui";
import { addresses } from "@/lib/addresses";
import { greenshoeVaultAbi, plainsightHookAbi } from "@/lib/abis";
import { fmtTokensCompact, fmtUsdCompact, timeLeft } from "@/lib/auction";
import { fullName, subName } from "@/lib/manifest";
import { bytes32ToText, REASON_CODES } from "@/lib/trade";
import { explainError } from "@/lib/tx";
import { useLaunchData } from "@/lib/useLaunchData";
import { LaunchTabs } from "./LaunchTabs";
import { PausedBanner } from "./PausedBanner";

const MAX_PAUSE_SECS = 24 * 60 * 60;

const LAST_TX: Record<string, string> = { pause: "Trading paused", unpause: "Trading resumed", replenish: "Wall topped up", settle: "Settled" };
const usd = (v: bigint) => fmtUsdCompact(Number(formatUnits(v, 6)));

export function AgentConsole({ label }: { label: string }) {
  const d = useLaunchData(label);
  const { address, chainId } = useAccount();
  const pc = usePublicClient({ chainId: sepolia.id });
  const { writeContractAsync } = useWriteContract();
  const [reason, setReason] = useState<string>(REASON_CODES[0].code);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [lastTx, setLastTx] = useState<{ label: string; hash: string }>();

  if (d.status.isLoading || !d.a.saleReady || (d.opened && (!d.p.poolId || !d.manifest))) return <Shell>Loading {fullName(label)}…</Shell>;
  if (!d.opened || !d.p.poolId || !d.manifest)
    return (
      <Shell>
        <Card title="Nothing to run yet" description="The agent's console opens with the pool, after the auction.">
          <Link href={`/launch/${label}`} className="btn mt-4">
            Back to the launch
          </Link>
        </Card>
      </Shell>
    );

  const agent = d.manifest.agent;
  const isAgent = !!address && isAddressEqual(address, agent);
  const s = d.a.sale!;
  const st = d.p.status;
  const windowEnd = Number(s.collectedAt) + Number(s.windowSecs);
  const windowOver = d.a.chainTime >= windowEnd;
  const cfg = d.h.config;
  const haltEnded = cfg ? (cfg.paused ? Number(cfg.pausedAt) + MAX_PAUSE_SECS : Number(cfg.resumedAt)) : 0;
  const cooldownUntil = haltEnded > 0 ? haltEnded + MAX_PAUSE_SECS : 0;
  const coolingDown = !d.h.paused && d.a.chainTime < cooldownUntil;
  const poolId = d.p.poolId;

  async function send(label: string, fn: () => Promise<`0x${string}`>) {
    if (!pc) return;
    setBusy(label);
    setError("");
    try {
      const h = await fn();
      await pc.waitForTransactionReceipt({ hash: h });
      setLastTx({ label, hash: h });
      await Promise.all([d.h.refetch(), d.p.refetch(), d.a.refetch()]);
      if (label === "pause") setNote("");
    } catch (e) {
      setError(explainError(e));
    } finally {
      setBusy("");
    }
  }

  const pause = () =>
    send("pause", async () => {
      const args = [poolId, stringToHex(reason, { size: 32 }), note.trim()] as const;
      const { request } = await pc!.simulateContract({ account: address, address: addresses.plainsightHook, abi: plainsightHookAbi, functionName: "pause", args });
      return writeContractAsync({ address: addresses.plainsightHook, abi: plainsightHookAbi, functionName: "pause", args, gas: request.gas });
    });
  const unpause = () =>
    send("unpause", () => writeContractAsync({ address: addresses.plainsightHook, abi: plainsightHookAbi, functionName: "unpause", args: [poolId] }));
  const vault = (fn: "replenish" | "settle") => () =>
    send(fn, async () => {
      const { request } = await pc!.simulateContract({ account: address, address: addresses.greenshoeVault, abi: greenshoeVaultAbi, functionName: fn, args: [d.id] });
      return writeContractAsync({ address: addresses.greenshoeVault, abi: greenshoeVaultAbi, functionName: fn, args: [d.id], gas: request.gas });
    });

  return (
    <Shell>
      <div>
        <Link href={`/launch/${label}`} className="font-mono text-sm text-muted">
          {fullName(label)}
        </Link>
        <h1 className="h mt-1 text-[30px]">Agent console</h1>
      </div>
      <LaunchTabs label={label} active="agent" />
      {d.h.paused && <PausedBanner reason={d.h.config?.pauseReason} until={d.h.pausedUntil} />}

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="flex min-w-0 flex-col gap-5">
          <Card
            title="Trading halt"
            description="Halt swaps with a public reason code while something is investigated, for 24 hours at most: then trading resumes on its own. Liquidity providers can always withdraw."
            action={<Pill tone={d.h.paused ? "bad" : "ok"}>{d.h.paused ? `Paused · ${bytes32ToText(d.h.config!.pauseReason)}` : "Trading live"}</Pill>}
          >
            {!isAgent && (
              <div className="mt-4 flex flex-col gap-3">
                <Alert tone="info">
                  Only <span className="font-mono font-semibold">{subName("agent", label)}</span> can act here. Connect that wallet to pause or resume.
                </Alert>
                {!address && <WalletButton light />}
              </div>
            )}
            {d.h.paused && d.h.pausedUntil > 0 && (
              <p className="mt-4 mb-0 text-sm text-muted">Lifts on its own {timeLeft(d.h.pausedUntil - d.a.chainTime)} from now, if not resumed earlier.</p>
            )}
            {coolingDown && (
              <p className="mt-4 mb-0 text-sm text-muted">A new halt is possible in {timeLeft(cooldownUntil - d.a.chainTime)}: halts can&apos;t be chained back to back.</p>
            )}
            {isAgent && chainId === sepolia.id && !d.h.paused && !coolingDown && (
              <div className="mt-5 flex flex-col gap-4">
                <div>
                  <label htmlFor="reason" className="label">
                    Reason code
                  </label>
                  <select id="reason" className="field" value={reason} onChange={(e) => setReason(e.target.value)}>
                    {REASON_CODES.map((r) => (
                      <option key={r.code} value={r.code}>
                        {r.code} · {r.text}
                      </option>
                    ))}
                  </select>
                </div>
                <Field id="note" label="Public note" placeholder="What you're looking into" value={note} onChange={(e) => setNote(e.target.value)} help="Published on-chain with the halt." />
                <button type="button" className="btn border-negative bg-negative text-white" disabled={!!busy} onClick={pause}>
                  {busy === "pause" ? "Confirm in your wallet…" : "Pause trading"}
                </button>
              </div>
            )}
            {isAgent && d.h.paused && (
              <button type="button" className="btn btn-primary mt-5" disabled={!!busy} onClick={unpause}>
                {busy === "unpause" ? "Confirm in your wallet…" : "Resume trading"}
              </button>
            )}
            {error && (
              <div className="mt-4">
                <Alert>{error}</Alert>
              </div>
            )}
            {lastTx && !error && (
              <p className="mt-4 mb-0 flex flex-wrap items-center gap-2 text-[13px] text-muted">
                {LAST_TX[lastTx.label] ?? "Done"}: <TxHash hash={lastTx.hash} />
              </p>
            )}
          </Card>

          <Card title="The vault" description="The buy wall and its settlement. Anyone can trigger these; the agent watches them.">
            <div className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-4">
              <Stat label="Wall standing" value={usd(st?.usdcInWall ?? 0n)} sub={`of ${usd(s.reserve)}`} />
              <Stat label="Not placed yet" value={usd(st?.usdcUnplaced ?? 0n)} sub={st && st.rungsPlaced < st.rungCount ? `${st.rungCount - st.rungsPlaced} rung(s) left` : "All placed"} />
              <Stat label="Bought back" value={st ? fmtTokensCompact(Number(formatUnits(st.tokensBought, d.decimals))) : "—"} sub={d.symbol} />
              <Stat label="Window" value={windowOver ? "Over" : timeLeft(windowEnd - d.a.chainTime)} sub={new Date(windowEnd * 1000).toLocaleDateString("en-US", { month: "short", day: "numeric" })} />
            </div>
            <p className="mt-5 mb-0 bg-ground p-3 text-sm">
              {s.settled
                ? `Settled: ${fmtTokensCompact(Number(formatUnits(s.tokensBurned, d.decimals)))} ${d.symbol} burned, ${usd(s.usdcReturned)} returned to the issuer.`
                : `Settle preview: about ${st ? fmtTokensCompact(Number(formatUnits(st.tokensBought, d.decimals))) : "…"} ${d.symbol} burned and ${st ? usd(st.usdcInWall + st.usdcUnplaced) : "…"} returned to the issuer, ${windowOver ? "available now" : "after the window"}.`}
            </p>
            {address && !s.settled && (
              <div className="mt-4 flex flex-wrap gap-3">
                {st && st.rungsPlaced < st.rungCount && !windowOver && (
                  <button type="button" className="btn" disabled={!!busy || d.a.chainTime < Number(st.nextRungAt)} onClick={vault("replenish")}>
                    {busy === "replenish" ? "Placing…" : "Place the next rungs"}
                  </button>
                )}
                <button type="button" className="btn btn-primary" disabled={!!busy || !windowOver} onClick={vault("settle")}>
                  {busy === "settle" ? "Settling…" : windowOver ? "Settle" : "Settle (locked until the window ends)"}
                </button>
              </div>
            )}
          </Card>
        </div>

        <aside className="flex min-w-0 flex-col gap-5">
          <Card title="What this key can't do" description="The agent's only power is the halt. Everything else is out of reach by construction.">
            <ul className="mt-4 mb-0 flex list-disc flex-col gap-2 pl-5 text-sm">
              <li>Move the vault&apos;s USDC or tokens, or remove the wall early (the hook locks it).</li>
              <li>Change the pool fee, the insider fee or the wash penalty.</li>
              <li>Block withdrawals: liquidity can always be removed, even while paused.</li>
              <li>Edit the manifest or any ENS name or record.</li>
              <li>Pause silently: every halt carries a public reason code.</li>
              <li>Halt for more than 24 hours, or chain halts back to back.</li>
            </ul>
          </Card>
          <Card title="Agent">
            <div className="mt-3 flex flex-col gap-2">
              <p className="m-0 font-mono text-sm">{subName("agent", label)}</p>
              {d.manifest.agentOperator && <p className="m-0 text-sm text-muted">Run by {d.manifest.agentOperator}</p>}
              <CopyAddress address={agent} label="Wallet" kind="address" />
              <CopyAddress address={addresses.plainsightHook} label="Hook" kind="address" />
            </div>
          </Card>
        </aside>
      </div>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return <main className="mx-auto flex max-w-[1200px] flex-col gap-5 px-4 pt-10 pb-8 sm:px-8">{children}</main>;
}
