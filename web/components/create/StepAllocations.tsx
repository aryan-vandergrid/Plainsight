"use client";

import { formatUnits, isAddress, parseUnits, type Address } from "viem";
import { useReadContract } from "wagmi";
import { mockTokenAbi } from "@/lib/abis";
import { fmt, pctOf } from "@/lib/format";
import { CUSTOM, MAX_ALLOCATIONS, PRESETS, PRESET_GROUPS, newRow, rowLabel, subName, totalLocked, type AllocRow, type CreateForm, type Errors } from "@/lib/manifest";
import { Card, Field } from "./ui";

export function StepAllocations({ form, set, errors, decimals }: { form: CreateForm; set: (p: Partial<CreateForm>) => void; errors: Errors; decimals: number }) {
  const rows = form.allocations;
  const update = (key: string, p: Partial<AllocRow>) => set({ allocations: rows.map((r) => (r.key === key ? { ...r, ...p } : r)) });
  const usedBy = (key: string) => new Set(rows.filter((r) => r.key !== key && r.preset && r.preset !== CUSTOM).map((r) => r.preset));

  const supply = useReadContract({
    address: isAddress(form.token) ? (form.token as Address) : undefined,
    abi: mockTokenAbi,
    functionName: "totalSupply",
    query: { enabled: isAddress(form.token) },
  }).data;
  const amountOf = (r: AllocRow) => {
    try {
      return r.amount ? parseUnits(r.amount, decimals) : 0n;
    } catch {
      return 0n;
    }
  };
  const total = totalLocked(form, decimals);
  const sym = form.symbol || "tokens";

  return (
    <Card
      title="Allocations"
      description="Add every bucket in your tokenomics. Tokens with a future unlock date are locked in a vesting contract when you post."
      action={
        <span className="text-sm text-muted">
          <span className="font-semibold text-ink">
            {fmt(formatUnits(total, decimals))} {sym}
          </span>
          {pctOf(total, supply) && ` · ${pctOf(total, supply)} of supply`}
        </span>
      }
    >
      <ul className="mt-5 mb-0 flex list-none flex-col gap-3 p-0">
        {rows.map((r, i) => {
          const taken = usedBy(r.key);
          const err = (f: string) => errors[`${r.key}.${f}`];
          const label = rowLabel(r);
          const gradual = Number(r.vestingDays) > 0;
          return (
            <li key={r.key} className=" border border-line p-4">
              <div className="grid grid-cols-[1fr_1fr_auto] items-start gap-3 sm:grid-cols-[1.4fr_1fr_1fr_auto]">
                <div className="col-span-2 min-w-0 sm:col-span-1">
                  <label htmlFor={`${r.key}-preset`} className="label">
                    Category
                  </label>
                  <select
                    id={`${r.key}-preset`}
                    className={`field ${err("preset") ? "border-negative" : ""}`}
                    value={r.preset}
                    onChange={(e) => {
                      const p = PRESETS.find((x) => x.value === e.target.value);
                      update(r.key, { preset: e.target.value, insider: p ? p.insider : r.insider });
                    }}
                  >
                    <option value="">Choose…</option>
                    {PRESET_GROUPS.map((g) => (
                      <optgroup key={g} label={g}>
                        {PRESETS.filter((p) => p.group === g).map((p) => (
                          <option key={p.value} value={p.value} disabled={taken.has(p.value)}>
                            {p.name}
                          </option>
                        ))}
                      </optgroup>
                    ))}
                    <option value={CUSTOM}>Other (name it)…</option>
                  </select>
                  {err("preset") && <p className="err">{err("preset")}</p>}
                </div>
                <Field
                  id={`${r.key}-amount`}
                  label={`Amount (${sym})`}
                  inputMode="decimal"
                  placeholder="0"
                  value={r.amount}
                  onChange={(e) => update(r.key, { amount: e.target.value })}
                  error={err("amount")}
                  help={pctOf(amountOf(r), supply) ? `${pctOf(amountOf(r), supply)} of supply` : undefined}
                />
                <Field id={`${r.key}-unlock`} label="Unlocks on" type="date" value={r.unlockDate} onChange={(e) => update(r.key, { unlockDate: e.target.value })} error={err("unlockDate")} />
                <button
                  type="button"
                  className="col-start-3 row-start-1 mt-[26px] inline-flex h-11 w-11 items-center justify-center text-muted hover:bg-ground hover:text-negative sm:col-start-4"
                  aria-label={`Remove allocation ${i + 1}`}
                  onClick={() => set({ allocations: rows.filter((x) => x.key !== r.key) })}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
                    <path d="M6 6l12 12M18 6L6 18" />
                  </svg>
                </button>
              </div>

              {r.preset === CUSTOM && (
                <Field
                  id={`${r.key}-custom`}
                  className="mt-3"
                  label="Allocation name"
                  placeholder="e.g. Partners fund"
                  value={r.customName}
                  onChange={(e) => update(r.key, { customName: e.target.value })}
                  error={err("customName")}
                  help={label ? <span className="font-mono">{subName(label, form.label)}</span> : undefined}
                />
              )}
              {r.preset !== CUSTOM && err("customName") && <p className="err">{err("customName")}</p>}

              <Field id={`${r.key}-wallet`} className="mt-3" label="Wallet" mono placeholder="0x…" value={r.wallet} onChange={(e) => update(r.key, { wallet: e.target.value.trim() })} error={err("wallet")} />

              <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
                <label className="flex min-h-11 cursor-pointer items-center gap-2.5" title="Insiders pay a fee if they sell during the price-support window.">
                  <input type="checkbox" className="h-[18px] w-[18px] accent-green" checked={r.insider} onChange={(e) => update(r.key, { insider: e.target.checked })} />
                  <span className="font-semibold">Insider</span>
                </label>
                <label className="flex min-h-11 cursor-pointer items-center gap-2.5">
                  <input type="checkbox" className="h-[18px] w-[18px] accent-green" checked={gradual} onChange={(e) => update(r.key, { vestingDays: e.target.checked ? "365" : "0" })} />
                  <span className="font-semibold">Release gradually</span>
                </label>
                {gradual && (
                  <span className="flex items-center gap-2">
                    <label htmlFor={`${r.key}-vest`} className="text-muted">
                      over
                    </label>
                    <input id={`${r.key}-vest`} inputMode="numeric" className={`field w-24 ${err("vestingDays") ? "border-negative" : ""}`} value={r.vestingDays} onChange={(e) => update(r.key, { vestingDays: e.target.value })} />
                    <span className="text-muted">days after unlock</span>
                  </span>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      {errors.allocations && <p className="err">{errors.allocations}</p>}
      <button type="button" className="btn mt-3 w-full border-dashed sm:w-auto" disabled={rows.length >= MAX_ALLOCATIONS} onClick={() => set({ allocations: [...rows, newRow()] })}>
        + Add allocation
      </button>
      {rows.length >= MAX_ALLOCATIONS && <p className="help">You can add up to {MAX_ALLOCATIONS} allocations.</p>}
    </Card>
  );
}
