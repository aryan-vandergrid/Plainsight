"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { privateKeyToAddress } from "viem/accounts";
import { keccak256, toBytes } from "viem";
import { emptyForm, rowLabel, validateAllocations, validateGreenshoe, validateToken, type CreateForm } from "@/lib/manifest";
import { StepAllocations } from "./StepAllocations";
import { StepMarket } from "./StepMarket";
import { StepReview } from "./StepReview";
import { StepToken } from "./StepToken";

const STEPS = ["Token", "Allocations", "Market maker", "Review"] as const;

const demoWallet = (label: string, bucket: string) => privateKeyToAddress(keccak256(toBytes(`plainsight-demo/${label}/${bucket}`)));

export function CreateWizard() {
  const router = useRouter();
  const legacy = useSearchParams().get("label");
  useEffect(() => {
    if (legacy) router.replace(`/launch/${encodeURIComponent(legacy)}`);
  }, [legacy, router]);

  const [form, setForm] = useState<CreateForm>(() => emptyForm(""));
  const [decimals, setDecimals] = useState(18);
  const [taken, setTaken] = useState(false);
  const [step, setStep] = useState(0);
  const [showErrors, setShowErrors] = useState(false);

  const set = useCallback((p: Partial<CreateForm>) => setForm((f) => ({ ...f, ...p })), []);
  const errors = useMemo(() => [validateToken(form), validateAllocations(form), validateGreenshoe(form)], [form]);
  const valid = (i: number) => i > 2 || (Object.keys(errors[i]).length === 0 && !(i === 0 && taken));
  const ready = [0, 1, 2].every(valid);

  function go(i: number) {
    for (let k = step; k < i; k++) {
      if (!valid(k)) {
        setStep(k);
        setShowErrors(true);
        return;
      }
    }
    setShowErrors(false);
    setStep(i);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function fillDemo() {
    set({
      allocations: form.allocations.map((r) => (rowLabel(r) ? { ...r, wallet: demoWallet(form.label, rowLabel(r)) } : r)),
      mm: { ...form.mm, wallet: demoWallet(form.label, "mm") },
      agent: demoWallet(form.label, "agent"),
      agentOperator: form.agentOperator || "Vandergrid",
    });
  }

  const shown = (i: number) => (showErrors ? errors[i] : {});

  return (
    <main className="mx-auto flex max-w-[760px] flex-col gap-6 px-4 pt-8 pb-16 sm:px-6">
      <div>
        <h1 className="h text-[30px] sm:text-[36px]">Create a launch</h1>
        <p className="mt-1.5 mb-0 text-muted">Disclose who holds what, on-chain and under ENS, before anything trades.</p>
      </div>

      <nav aria-label="Progress">
        <ol className="m-0 grid list-none grid-cols-4 gap-2 p-0">
          {STEPS.map((s, i) => (
            <li key={s} className="min-w-0">
              <button type="button" onClick={() => go(i)} aria-current={i === step ? "step" : undefined} className="flex min-h-11 w-full cursor-pointer flex-col justify-end gap-2 text-left">
                <span className={`block h-1.5 w-full ${i <= step ? "bg-ink" : "bg-edge"}`} />
                <span className={`truncate text-[13px] font-semibold ${i === step ? "text-ink" : "text-muted"}`}>
                  {i + 1}
                  <span className={i === step ? "" : "hidden sm:inline"}>. {s}</span>
                </span>
              </button>
            </li>
          ))}
        </ol>
      </nav>

      {step === 0 && <StepToken form={form} set={set} errors={shown(0)} onDecimals={setDecimals} onTaken={setTaken} />}
      {step === 1 && <StepAllocations form={form} set={set} errors={shown(1)} decimals={decimals} />}
      {step === 2 && <StepMarket form={form} set={set} errors={shown(2)} />}
      {step === 3 && <StepReview form={form} decimals={decimals} ready={ready} taken={taken} onEdit={go} />}

      <div className="flex flex-wrap items-center gap-3">
        {step > 0 && (
          <button type="button" className="btn" onClick={() => go(step - 1)}>
            Back
          </button>
        )}
        {step < 3 && (
          <button type="button" className="btn btn-primary px-8" onClick={() => go(step + 1)}>
            Continue
          </button>
        )}
        {(step === 1 || step === 2) && (
          <button type="button" className="ml-auto min-h-11 px-3 text-sm font-semibold text-muted hover:bg-white hover:text-ink" onClick={fillDemo}>
            Use demo wallets
          </button>
        )}
        {showErrors && !valid(step) && (
          <p className="err m-0 w-full" role="alert">
            Fix the highlighted fields to continue.
          </p>
        )}
      </div>
    </main>
  );
}
