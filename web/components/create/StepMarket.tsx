"use client";

import { useState } from "react";
import type { CreateForm, Errors } from "@/lib/manifest";
import { Card, Field } from "./ui";

const ADVANCED = ["greenshoePct", "windowDays", "rangePct", "insiderFeePct", "minRaiseUsdc"] as const;

export function StepMarket({ form, set, errors }: { form: CreateForm; set: (p: Partial<CreateForm>) => void; errors: Errors }) {
  const sym = form.symbol || "tokens";
  const mm = (k: keyof CreateForm["mm"]) => ({ value: form.mm[k], onChange: (e: React.ChangeEvent<HTMLInputElement>) => set({ mm: { ...form.mm, [k]: k === "wallet" ? e.target.value.trim() : e.target.value } }), error: errors[`mm.${k}`] });
  const f = (k: (typeof ADVANCED)[number]) => ({ value: form[k], onChange: (e: React.ChangeEvent<HTMLInputElement>) => set({ [k]: e.target.value }), error: errors[k] });
  const advErr = ADVANCED.some((k) => errors[k]);
  const [open, setOpen] = useState(false);

  return (
    <div className="flex flex-col gap-5">
      <Card title="Market maker" description="The deal is disclosed on-chain and no tokens move. The market maker counts as an insider.">
        <div className="mt-5 grid gap-5 sm:grid-cols-2">
          <Field id="mm-wallet" label="Market maker wallet" mono placeholder="0x…" className="sm:col-span-2" {...mm("wallet")} />
          <Field id="mm-loan" label={`Token loan (${sym})`} inputMode="decimal" {...mm("loan")} />
          <Field id="mm-strike" label="Option strike (USDC per token)" inputMode="decimal" {...mm("strike")} />
          <Field id="mm-kpis" label="Performance targets" className="sm:col-span-2" placeholder="e.g. 2% depth within 1%" {...mm("kpis")} />
        </div>
      </Card>

      <Card title="Price support" description="After launch, an independent agent can buy back below the auction price using extra supply. It can't be your wallet.">
        <div className="mt-5 grid gap-5 sm:grid-cols-2">
          <Field id="agent" label="Stabilisation agent wallet" mono placeholder="0x…" className="sm:col-span-2" value={form.agent} onChange={(e) => set({ agent: e.target.value.trim() })} error={errors.agent} />
          <Field
            id="agent-operator"
            label="Agent operator"
            placeholder="Who runs the agent"
            help="Published on the agent's ENS name"
            className="sm:col-span-2"
            value={form.agentOperator}
            onChange={(e) => set({ agentOperator: e.target.value })}
            error={errors.agentOperator}
          />
        </div>
        <details className="group mt-5 border border-line" open={open || advErr} onToggle={(e) => setOpen(e.currentTarget.open)}>
          <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between px-4 text-sm font-semibold">
            <span>
              Advanced settings <span className="font-normal text-muted">· defaults work for most launches</span>
            </span>
            <svg className="transition-transform group-open:rotate-180" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden="true">
              <path d="M6 9l6 6 6-6" />
            </svg>
          </summary>
          <div className="grid gap-5 border-t border-line p-4 sm:grid-cols-3">
            <Field id="greenshoe" label="Extra supply (%)" inputMode="decimal" {...f("greenshoePct")} />
            <Field id="window" label="Support window (days)" inputMode="numeric" {...f("windowDays")} />
            <Field id="range" label="Buy range below price (%)" inputMode="decimal" {...f("rangePct")} />
            <Field id="fee" label="Insider sell fee (%)" inputMode="decimal" {...f("insiderFeePct")} />
            <Field id="minraise" label="Minimum raise (USDC)" inputMode="decimal" help="Below this, everyone is refunded" {...f("minRaiseUsdc")} />
          </div>
          <p className="m-0 border-t border-line px-4 py-3 text-xs text-muted">
            The wall goes in on a fixed schedule: 60% of the support money on day one, when dumps happen, and the rest evenly over the other days.
          </p>
        </details>
      </Card>
    </div>
  );
}
