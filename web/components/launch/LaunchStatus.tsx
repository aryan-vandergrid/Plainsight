"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";
import { TxHash } from "@/components/TxHash";
import { isAddressEqual, type Address, type Hex } from "viem";
import { useAccount, usePublicClient, useReadContract, useReadContracts, useWriteContract } from "wagmi";
import { sepolia } from "wagmi/chains";
import { Card, CheckIcon, CopyAddress, Pill } from "@/components/create/ui";
import { addresses } from "@/lib/addresses";
import { launcherAbi, manifestRegistryAbi, mockTokenAbi } from "@/lib/abis";
import { q96ToUsd, type Phase } from "@/lib/auction";
import { CHECKS, CheckStatus } from "@/lib/checks";
import { ensApp, shortAddr } from "@/lib/format";
import { fullName, manifestId, PARENT } from "@/lib/manifest";
import { useLaunchData } from "@/lib/useLaunchData";
import { ActivityLog } from "./ActivityLog";
import { ScoreBadge } from "@/components/ScoreBadge";
import { useFeed } from "@/lib/useFeed";
import { FeedCard } from "./FeedCard";
import { LaunchTabs } from "./LaunchTabs";
import { PausedBanner } from "./PausedBanner";
import { VolumePanel } from "./VolumePanel";
import { AuctionPanel } from "./AuctionPanel";
import { BidBox } from "./BidBox";
import { MyBids, RecentBids } from "./Bids";
import { StartAuction } from "./StartAuction";
import { Tracker } from "./Tracker";
import { VaultPanel } from "./VaultPanel";

const REFRESH_MS = 10_000;
const ZERO = "0x0000000000000000000000000000000000000000";

const PHASE_PILL: Record<Phase, { tone: "ok" | "bad" | "muted"; text: string }> = {
  unverified: { tone: "bad", text: "Launch blocked" },
  ready: { tone: "ok", text: "Ready to launch" },
  upcoming: { tone: "ok", text: "Auction opening" },
  live: { tone: "ok", text: "Auction live" },
  ended: { tone: "muted", text: "Auction ended" },
};

export function LaunchStatus({ label }: { label: string }) {
  const d = useLaunchData(label);
  const { id, status, a, p, h, opened } = d;
  const st = d.checks;
  const verified = d.verified;
  const checks = { data: d.checksLoaded ? st : undefined };
  const name = d.name;
  const token = d.token;
  const feed = useFeed(label, !!d.a.auction);

  if (status.isLoading) return <Shell>{<p className="text-muted">Loading {fullName(label)}…</p>}</Shell>;
  if (status.isError) return <Shell>{<p className="text-negative">Couldn&apos;t reach Sepolia. Refresh to try again.</p>}</Shell>;
  if (Number(status.data) === 0)
    return (
      <Shell>
        <Card title="No launch here yet" description={<>Nothing has been posted at <span className="font-mono">{fullName(label)}</span>.</>}>
          <Link href="/create" className="btn btn-primary mt-5">
            Create a launch
          </Link>
        </Card>
      </Shell>
    );

  const sym = d.symbol;
  const decimals = d.decimals;
  const m = d.manifest;
  const launched = !!a.auction;
  const refunded = a.phase === "ended" && a.graduated === false;
  const pill = refunded
    ? { tone: "bad" as const, text: "Refunded" }
    : a.sale?.settled
      ? { tone: "muted" as const, text: "Settled" }
      : opened
        ? { tone: "ok" as const, text: "Trading · price support on" }
        : PHASE_PILL[a.phase];
  const passed = st?.filter((s) => s === CheckStatus.Passed).length ?? 0;

  const disclosure = (
    <>
      <Checks id={id} st={st} launched={launched} />
      <EnsRecords id={id} />
    </>
  );

  return (
    <Shell>
      <section className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <a href={ensApp(fullName(label))} target="_blank" rel="noreferrer" className="font-mono text-sm text-muted">
            {fullName(label)}
          </a>
          <h1 className="h mt-1 text-[30px] sm:text-[36px]">
            {name ?? label.toUpperCase()} {name && <span className="text-lg font-semibold text-muted">{sym}</span>}
          </h1>
        </div>
        <div className="flex flex-wrap gap-2">
          {checks.data && <Pill tone={pill.tone}>{pill.text}</Pill>}
          {st && <Pill tone={verified ? "ok" : "bad"}>{`Verified ${passed}/${st.length} checks`}</Pill>}
          {feed.data && <ScoreBadge score={feed.data.score} />}
        </div>
        {token && (
          <div className="w-full">
            <CopyAddress address={token} label="Token" />
          </div>
        )}
      </section>

      {opened && <LaunchTabs label={label} active="overview" />}

      {checks.data && (
        <Tracker
          phase={a.phase}
          blocksLeft={a.block !== undefined && a.info ? Number(a.info.endBlock - a.block) : undefined}
          finalUsd={a.phase === "ended" && a.clearingQ96 !== undefined ? q96ToUsd(a.clearingQ96, decimals) : undefined}
          refunded={refunded}
          pool={a.sale?.poolOpened ? { settled: a.sale.settled, lockedUntil: Number(a.sale.collectedAt) + Number(a.sale.windowSecs), priceUsd: p.priceUsd, now: a.chainTime } : undefined}
        />
      )}

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_380px]">
        {launched && a.info && m && (
          <div className="flex min-w-0 flex-col gap-5 lg:col-start-1">
            {opened && h.paused && <PausedBanner reason={h.config?.pauseReason} until={h.pausedUntil} />}
            {opened && <VaultPanel id={id} a={a} p={p} symbol={sym} decimals={decimals} depthBps={m.rangeDepthBps} />}
            {opened && <VolumePanel d={d} />}
            {opened && <ActivityLog d={d} />}
            {launched && <FeedCard label={label} />}
            <AuctionPanel id={id} a={a} symbol={sym} decimals={decimals} minRaise={m.minRaise} greenshoeBps={m.greenshoeBps} />
          </div>
        )}
        <aside className="flex min-w-0 flex-col gap-5 lg:col-start-2 lg:row-span-2 lg:row-start-1">
          {!launched && a.phase === "ready" && m && <StartAuction id={id} m={m} symbol={sym} decimals={decimals} onLaunched={() => a.refetch()} />}
          {!launched && a.phase === "unverified" && st && (
            <Card title="Launch is blocked" description="The auction can't start until every check passes. The failing check is highlighted.">
              <p className="mt-4 mb-0 text-sm text-muted">Anyone can re-run the checks once the issue is fixed.</p>
            </Card>
          )}
          {launched && a.info && (a.phase === "live" || a.phase === "upcoming") && <BidBox a={a} symbol={sym} decimals={decimals} />}
          {launched && a.info && <MyBids a={a} symbol={sym} decimals={decimals} />}
          {launched && a.info && <RecentBids a={a} decimals={decimals} />}
        </aside>
        <div className="flex min-w-0 flex-col gap-5 lg:col-start-1">{disclosure}</div>
      </div>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return <main className="mx-auto flex max-w-[1200px] flex-col gap-5 px-4 pt-10 pb-8 sm:px-8">{children}</main>;
}

function Checks({ id, st, launched }: { id: Hex; st?: readonly number[]; launched: boolean }) {
  const { address } = useAccount();
  const pc = usePublicClient({ chainId: sepolia.id });
  const qc = useQueryClient();
  const { writeContractAsync } = useWriteContract();
  const [busy, setBusy] = useState(false);
  const [verifyTx, setVerifyTx] = useState<string>();
  const last = useReadContract({ address: addresses.launcher, abi: launcherAbi, functionName: "lastVerify", args: [id], query: { refetchInterval: REFRESH_MS } });

  const fail = st ? st.findIndex((s) => s !== CheckStatus.Passed) : -1;
  const ok = !!st && fail === -1;

  async function reverify() {
    if (!pc) return;
    setBusy(true);
    try {
      const h = await writeContractAsync({ address: addresses.launcher, abi: launcherAbi, functionName: "verify", args: [id] });
      await pc.waitForTransactionReceipt({ hash: h });
      setVerifyTx(h);
      await qc.invalidateQueries();
    } catch {
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card
      title={!st ? "Checking…" : ok ? (launched ? "Disclosure verified" : "All checks passed") : CHECKS[fail].blocked}
      action={st && <Pill tone={ok ? "ok" : "bad"}>{ok ? "Verified" : "Not verified"}</Pill>}
      description={st && !ok ? CHECKS[fail].fail : launched ? "Checked again live against the manifest, ENS and the auction." : undefined}
    >
      <ol className="mt-4 mb-0 grid list-none gap-3 p-0 sm:grid-cols-2">
        {CHECKS.map((c, i) => {
          const s = st?.[i];
          const state = s === undefined ? "pending" : s === CheckStatus.Passed ? "passed" : "failed";
          return (
            <li key={c.title} className="flex items-center gap-3 text-[15px]">
              <CheckIcon state={state} />
              <span className={state === "failed" ? "font-semibold text-negative" : ""}>{c.title}</span>
            </li>
          );
        })}
      </ol>

      <div className="mt-5 flex flex-wrap items-center justify-between gap-2 border-t border-line pt-4 text-[13px] text-muted">
        <span>{last.data && last.data[2] > 0n ? `Last verified on-chain ${new Date(Number(last.data[2]) * 1000).toLocaleString()}` : "Not yet verified on-chain"}
          {verifyTx && (
            <>
              {" · "}
              <TxHash hash={verifyTx} />
            </>
          )}
        </span>
        {address && (
          <button type="button" className="min-h-9 px-2 font-medium text-accent hover:bg-accent-tint disabled:opacity-50" disabled={busy} onClick={reverify}>
            {busy ? "Verifying…" : "Verify again"}
          </button>
        )}
      </div>
    </Card>
  );
}

type Row = { name: string; wallet: Address; points: Address | null; texts: { key: string; want: string; got: string | null }[] };

function EnsRecords({ id }: { id: Hex }) {
  const pc = usePublicClient({ chainId: sepolia.id });
  const recs = useReadContract({ address: addresses.launcher, abi: launcherAbi, functionName: "expectedRecords", args: [id] });

  const live = useQuery({
    queryKey: ["ens-live", id, recs.data?.length],
    enabled: !!recs.data && !!pc,
    refetchInterval: REFRESH_MS,
    queryFn: async (): Promise<Row[]> =>
      Promise.all(
        recs.data!.map(async (r) => {
          const ur = addresses.ens.universalResolver;
          const points = await pc!.getEnsAddress({ name: r.name, universalResolverAddress: ur }).catch(() => null);
          const texts = await Promise.all(r.keys.map(async (key, k) => ({ key, want: r.values[k], got: await pc!.getEnsText({ name: r.name, key, universalResolverAddress: ur }).catch(() => null) })));
          return { name: r.name, wallet: r.wallet, points, texts };
        }),
      ),
  });

  const rows = (live.data ?? []).map((r) => {
    const addrOk = r.wallet === ZERO || (!!r.points && isAddressEqual(r.points, r.wallet));
    return { ...r, addrOk, ok: addrOk && r.texts.every((t) => t.got === t.want) };
  });
  const bad = rows.filter((r) => !r.ok).length;

  return (
    <Card
      title="ENS names"
      description="Read live from ENS and compared with the on-chain manifest."
      action={rows.length > 0 && <Pill tone={bad ? "bad" : "ok"}>{bad ? `${bad} mismatch${bad > 1 ? "es" : ""}` : `${rows.length} of ${rows.length} match`}</Pill>}
    >
      {live.isLoading || recs.isLoading ? (
        <p className="mt-4 mb-0 text-sm text-muted">Resolving names…</p>
      ) : (
        <ul className="mt-4 mb-0 flex list-none flex-col divide-y divide-line p-0">
          {rows.map((r) => (
            <EnsRow key={r.name} row={r} />
          ))}
        </ul>
      )}
    </Card>
  );
}

function EnsRow({ row }: { row: Row & { addrOk: boolean; ok: boolean } }) {
  const [open, setOpen] = useState(false);
  const expanded = open || !row.ok;
  const sub = row.name.slice(0, -(`.${PARENT}`.length));
  const [head, ...rest] = sub.split(".");
  return (
    <li className="py-3">
      <div className="flex items-center gap-3">
        <button type="button" className="flex min-h-11 min-w-0 flex-1 cursor-pointer items-center gap-3 text-left" onClick={() => setOpen(!open)} aria-expanded={expanded}>
          <CheckIcon state={row.ok ? "passed" : "failed"} />
          <span className="min-w-0 truncate font-mono text-sm">
            <span className="font-semibold">{head}</span>
            <span className="text-muted">
              {rest.length ? `.${rest.join(".")}` : ""}.{PARENT}
            </span>
          </span>
        </button>
        <span className={`hidden font-mono text-[13px] sm:inline ${row.addrOk ? "text-muted" : "font-semibold text-negative"}`}>{row.wallet === ZERO ? "" : shortAddr(row.points)}</span>
        <button type="button" className="min-h-9 flex-none px-2 text-[13px] font-medium text-accent hover:bg-accent-tint" onClick={() => setOpen(!open)}>
          {expanded ? "Hide" : "Details"}
        </button>
      </div>
      {expanded && (
        <dl className="mt-1 mb-0 ml-9 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 bg-ground p-3 font-mono text-xs">
          {row.wallet !== ZERO && (
            <Rec k="address" got={row.points} want={row.wallet} ok={row.addrOk} />
          )}
          {row.texts.map((t) => (
            <Rec key={t.key} k={t.key} got={t.got} want={t.want} ok={t.got === t.want} />
          ))}
        </dl>
      )}
    </li>
  );
}

const clip = (v: string | null) => (v && /^0x[0-9a-f]{40,}$/i.test(v) ? shortAddr(v) : v);

function Rec({ k, got, want, ok }: { k: string; got: string | null; want: string; ok: boolean }) {
  return (
    <>
      <dt className="font-sans text-muted">{k}</dt>
      <dd className={`m-0 break-words ${ok ? "" : "font-semibold text-negative"}`} title={got ?? undefined}>
        {clip(got) ?? "not set"}
        {!ok && <span className="font-normal"> (manifest: {clip(want)})</span>}
      </dd>
    </>
  );
}
