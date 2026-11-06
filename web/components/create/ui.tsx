"use client";

import { useState, type InputHTMLAttributes, type ReactNode } from "react";
import { TxHash } from "@/components/TxHash";

export function Field({
  id,
  label,
  error,
  help,
  mono,
  suffix,
  className = "",
  ...input
}: { id: string; label: string; error?: string; help?: ReactNode; mono?: boolean; suffix?: string } & InputHTMLAttributes<HTMLInputElement>) {
  const box = `field ${mono ? "font-mono text-[14px]" : ""} ${error ? "border-negative" : ""}`;
  const el = (
    <input
      id={id}
      className={suffix ? `min-w-0 flex-1 border-0 bg-transparent px-3 py-2.5 outline-none ${mono ? "font-mono text-[14px]" : ""}` : box}
      aria-invalid={error ? true : undefined}
      aria-describedby={error ? `${id}-err` : help ? `${id}-help` : undefined}
      {...input}
    />
  );
  return (
    <div className={`min-w-0 ${className}`}>
      <label htmlFor={id} className="label">
        {label}
      </label>
      {suffix ? (
        <div className={`${box} flex items-center p-0 focus-within:outline-2 focus-within:outline-positive`}>
          {el}
          <span className="pr-3 font-mono text-[14px] text-muted">{suffix}</span>
        </div>
      ) : (
        el
      )}
      {error ? (
        <p id={`${id}-err`} className="err">
          {error}
        </p>
      ) : help ? (
        <div id={`${id}-help`} className="help">
          {help}
        </div>
      ) : null}
    </div>
  );
}

export function Card({ title, description, action, children, className = "" }: { title?: ReactNode; description?: ReactNode; action?: ReactNode; children?: ReactNode; className?: string }) {
  return (
    <section className={`card ${className}`}>
      {(title || action) && (
        <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
          {title && <h2 className="h text-[19px]">{title}</h2>}
          {action}
        </div>
      )}
      {description && <p className="mt-1.5 mb-0 text-sm text-muted">{description}</p>}
      {children}
    </section>
  );
}

export function Pill({ tone, children }: { tone: "ok" | "bad" | "muted"; children: ReactNode }) {
  const cls = {
    ok: "border-positive/25 bg-positive-tint text-positive-ink",
    bad: "border-negative/25 bg-negative-tint text-negative",
    muted: "border-edge bg-ground text-muted",
  }[tone];
  return <span className={`inline-flex items-center border px-2 py-[5px] font-mono text-[11px] leading-none tracking-[0.06em] whitespace-nowrap uppercase ${cls}`}>{children}</span>;
}

export function CheckIcon({ state }: { state: "passed" | "failed" | "pending" | "active" }) {
  if (state === "passed")
    return (
      <span className="flex h-6 w-6 flex-none items-center justify-center rounded-full bg-positive-tint">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#0E7A4B" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M5 12l5 5L20 7" />
        </svg>
      </span>
    );
  if (state === "failed")
    return (
      <span className="flex h-6 w-6 flex-none items-center justify-center rounded-full bg-negative-tint">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#B42318" strokeWidth="3.2" strokeLinecap="round" aria-hidden="true">
          <path d="M6 6l12 12M18 6L6 18" />
        </svg>
      </span>
    );
  if (state === "active") return <span className="h-6 w-6 flex-none animate-spin rounded-full border-[3px] border-positive-tint border-t-positive" aria-hidden="true" />;
  return <span className="h-6 w-6 flex-none rounded-full border-2 border-edge" aria-hidden="true" />;
}

export function CopyAddress({ address, label, kind = "token" }: { address: string; label?: string; kind?: "token" | "address" }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
    }
  }
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-2 border border-line bg-white p-1.5 pl-3">
      {label && <span className="text-[13px] font-semibold text-muted">{label}</span>}
      <code className="min-w-0 flex-1 font-mono text-[13px] break-all select-all">{address}</code>
      <button type="button" className="min-h-9 px-3 text-[13px] font-medium text-accent hover:bg-accent-tint" onClick={copy} aria-live="polite">
        {copied ? "Copied" : "Copy"}
      </button>
      <a href={`https://sepolia.etherscan.io/${kind}/${address}`} target="_blank" rel="noreferrer" className="inline-flex min-h-9 items-center px-3 text-[13px] font-medium text-accent no-underline hover:bg-positive-tint">
        Etherscan
      </a>
    </div>
  );
}

export function Stat({ label, value, sub }: { label: string; value: ReactNode; sub?: ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="m-0 text-xs text-muted">{label}</p>
      <p className="m-0 mt-0.5 truncate font-display text-[26px] leading-tight font-semibold">{value}</p>
      {sub && <p className="m-0 mt-0.5 text-xs text-muted">{sub}</p>}
    </div>
  );
}

export function TxSteps({ steps, at, failed, done, txs }: { steps: string[]; at: number; failed: boolean; done: boolean; txs?: (string | undefined)[] }) {
  return (
    <ol className="m-0 flex list-none flex-col gap-2.5 p-0">
      {steps.map((t, i) => {
        const state = done || i < at ? "passed" : i === at ? (failed ? "failed" : "active") : "pending";
        return (
          <li key={t} className="flex items-center gap-3 text-sm">
            <CheckIcon state={state} />
            <span className={state === "pending" ? "text-muted" : "font-semibold"}>{t}</span>
            {txs?.[i] && <TxHash hash={txs[i]!} className="ml-auto" />}
          </li>
        );
      })}
    </ol>
  );
}

export function Alert({ children, tone = "bad" }: { children: ReactNode; tone?: "bad" | "info" }) {
  return (
    <p className={`m-0 p-3 text-sm ${tone === "bad" ? "bg-negative-tint text-negative" : "bg-ground text-[#2b3850]"}`} role={tone === "bad" ? "alert" : undefined}>
      {children}
    </p>
  );
}
