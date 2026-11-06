"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { formatUnits, type Address, type Hex } from "viem";
import { useAccount, usePublicClient, useReadContract, useWriteContract } from "wagmi";
import { sepolia } from "wagmi/chains";
import { WalletButton } from "@/components/Header";
import { addresses } from "@/lib/addresses";
import { launcherAbi, launcherWithErrorsAbi, mockTokenAbi } from "@/lib/abis";
import { TxHash } from "@/components/TxHash";
import { fmt, shortAddr } from "@/lib/format";
import { explainError } from "@/lib/tx";
import { fullName, manifestId, rowLabel, rowName, subName, toManifestArgs, totalLocked, unlockTs, type CreateForm } from "@/lib/manifest";
import { Card, CheckIcon, CopyAddress } from "./ui";

const PHASES = [
  { key: "approve", title: "Approve tokens for vesting" },
  { key: "post", title: "Post manifest and create ENS names" },
  { key: "verify", title: "Run the on-chain checks" },
] as const;
type PhaseKey = (typeof PHASES)[number]["key"];

export function StepReview({ form, decimals, ready, taken, onEdit }: { form: CreateForm; decimals: number; ready: boolean; taken: boolean; onEdit: (step: number) => void }) {
  const sym = form.symbol;
  const date = (d: string) => (unlockTs(d) * 1000n <= BigInt(Date.now()) ? "Unlocked" : new Date(`${d}T00:00:00Z`).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" }));
  const names = [fullName(form.label), ...form.allocations.map((r) => subName(rowLabel(r), form.label)), subName("mm", form.label), subName("agent", form.label)];

  return (
    <div className="flex flex-col gap-5">
      <Card title="Review" description="Check the details. Once posted, the disclosure can only be added to, never changed.">
        <Section title="Token" onEdit={() => onEdit(0)}>
          <Row k="Token" v={`${form.name} (${sym})`} />
          <Row k="ENS name" v={<span className="font-mono">{fullName(form.label)}</span>} />
          <div className="mt-1.5">
            <CopyAddress address={form.token} label="Contract" />
          </div>
        </Section>

        <Section title={`Allocations · ${fmt(formatUnits(totalLocked(form, decimals), decimals))} ${sym}`} onEdit={() => onEdit(1)}>
          {form.allocations.map((r) => (
            <div key={r.key} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 py-1.5 text-sm">
              <span className="font-semibold">
                {rowName(r)}
                {r.insider && <span className="ml-2 text-xs font-semibold text-muted">Insider</span>}
              </span>
              <span className="text-muted">
                <span className="font-semibold text-ink">
                  {fmt(r.amount)} {sym}
                </span>{" "}
                · {date(r.unlockDate)}
                {Number(r.vestingDays) > 0 && `, then over ${r.vestingDays} days`}
              </span>
            </div>
          ))}
        </Section>

        <Section title="Market maker and price support" onEdit={() => onEdit(2)}>
          <Row k="Market maker" v={<span className="font-mono">{shortAddr(form.mm.wallet)}</span>} />
          <Row k="Token loan" v={`${fmt(form.mm.loan)} ${sym} · strike ${form.mm.strike} USDC`} />
          <Row k="Stabilisation agent" v={<><span className="font-mono">{shortAddr(form.agent)}</span> · run by {form.agentOperator}</>} />
          <Row k="Minimum raise" v={`${fmt(form.minRaiseUsdc)} USDC`} />
        </Section>

        <Section title={`${names.length} ENS names will be created`}>
          <div className="flex flex-wrap gap-1.5 pt-1">
            {names.map((n) => (
              <span key={n} className=" bg-ground px-2 py-1 font-mono text-xs">
                {n}
              </span>
            ))}
          </div>
        </Section>
      </Card>

      <PostPanel form={form} decimals={decimals} ready={ready && !taken} taken={taken} />
    </div>
  );
}

function Section({ title, onEdit, children }: { title: string; onEdit?: () => void; children: React.ReactNode }) {
  return (
    <div className="mt-5 border-t border-line pt-4">
      <div className="mb-1.5 flex items-center justify-between gap-3">
        <h3 className="m-0 text-[13px] font-semibold tracking-[0.5px] text-muted uppercase">{title}</h3>
        {onEdit && (
          <button type="button" className="min-h-9 px-2 text-sm font-medium text-accent hover:bg-accent-tint" onClick={onEdit}>
            Edit
          </button>
        )}
      </div>
      {children}
    </div>
  );
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex flex-wrap justify-between gap-x-4 py-1.5 text-sm">
      <span className="text-muted">{k}</span>
      <span className="font-semibold break-all">{v}</span>
    </div>
  );
}

function PostPanel({ form, decimals, ready, taken }: { form: CreateForm; decimals: number; ready: boolean; taken: boolean }) {
  const router = useRouter();
  const { address, chainId } = useAccount();
  const pc = usePublicClient({ chainId: sepolia.id });
  const { writeContractAsync } = useWriteContract();
  const [phase, setPhase] = useState<PhaseKey | "idle" | "done">("idle");
  const [txs, setTxs] = useState<Partial<Record<PhaseKey, Hex>>>({});
  const [error, setError] = useState("");
  const label = form.label;
  const total = totalLocked(form, decimals);
  const balance = useReadContract({ address: form.token as Address, abi: mockTokenAbi, functionName: "balanceOf", args: [address!], query: { enabled: !!address } }).data;
  const short = balance !== undefined && balance < total;

  async function post() {
    if (!address || !pc) return;
    setError("");
    setTxs({});
    try {
      const token = form.token as Address;
      setPhase("approve");
      const allowance = await pc.readContract({ address: token, abi: mockTokenAbi, functionName: "allowance", args: [address, addresses.launcher] });
      if (allowance < total) {
        const h = await writeContractAsync({ address: token, abi: mockTokenAbi, functionName: "approve", args: [addresses.launcher, total] });
        setTxs((t) => ({ ...t, approve: h }));
        await pc.waitForTransactionReceipt({ hash: h });
      }

      setPhase("post");
      const args = toManifestArgs(form, address, decimals);
      const { request } = await pc.simulateContract({ account: address, address: addresses.launcher, abi: launcherWithErrorsAbi, functionName: "postManifest", args: [args] });
      const h2 = await writeContractAsync({ address: addresses.launcher, abi: launcherWithErrorsAbi, functionName: "postManifest", args: [args], gas: request.gas });
      setTxs((t) => ({ ...t, post: h2 }));
      const r2 = await pc.waitForTransactionReceipt({ hash: h2 });
      if (r2.status !== "success") throw new Error("Posting the manifest failed on-chain.");

      setPhase("verify");
      const h3 = await writeContractAsync({ address: addresses.launcher, abi: launcherAbi, functionName: "verify", args: [manifestId(label)] });
      setTxs((t) => ({ ...t, verify: h3 }));
      await pc.waitForTransactionReceipt({ hash: h3 });
      setPhase("done");
      router.push(`/launch/${label}`);
    } catch (e) {
      setError(explainError(e));
    }
  }

  const running = phase !== "idle" && phase !== "done" && !error;
  const at = PHASES.findIndex((p) => p.key === phase);
  const connected = !!address && chainId === sepolia.id;

  return (
    <Card title="Post your launch" description="Your wallet will ask you to confirm up to three transactions.">
      {phase !== "idle" && (
        <ol className="mt-4 mb-0 flex list-none flex-col gap-2.5 p-0">
          {PHASES.map((p, i) => {
            const state = phase === "done" || i < at ? "passed" : i === at ? (error ? "failed" : "active") : "pending";
            return (
              <li key={p.key} className="flex items-center gap-3 text-sm">
                <CheckIcon state={state} />
                <span className={state === "pending" ? "text-muted" : "font-semibold"}>{p.title}</span>
                {txs[p.key] && <TxHash hash={txs[p.key]!} className="ml-auto" />}
              </li>
            );
          })}
        </ol>
      )}
      {error && (
        <p className="mt-4 mb-0 bg-negative-tint p-3 text-sm text-negative" role="alert">
          {error}
        </p>
      )}
      <div className="mt-5 flex flex-wrap items-center gap-3">
        {connected ? (
          <button type="button" className="btn btn-primary min-h-[52px] w-full text-base sm:w-auto sm:px-8" disabled={!ready || running || short} onClick={post}>
            {running ? "Confirm in your wallet…" : error ? "Try again" : "Post and verify"}
          </button>
        ) : (
          <WalletButton light />
        )}
        {taken && <span className="text-sm text-negative">This ENS name is already taken. Pick another in step 1.</span>}
        {connected && short && (
          <span className="text-sm text-negative">
            This wallet holds {fmt(formatUnits(balance!, decimals))} {form.symbol} but the allocations need {fmt(formatUnits(total, decimals))}. Connect the wallet that holds the tokens.
          </span>
        )}
        {!taken && !ready && <span className="text-sm text-negative">Some details are missing. Go back and fix the highlighted fields.</span>}
      </div>
    </Card>
  );
}
