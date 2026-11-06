"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { BaseError, formatUnits, getAddress, isAddress, parseUnits, type Address } from "viem";
import { useAccount, useDeployContract, usePublicClient, useReadContract, useReadContracts } from "wagmi";
import { sepolia } from "wagmi/chains";
import { WalletButton } from "@/components/Header";
import { addresses } from "@/lib/addresses";
import { launchTokenAbi, launchTokenBytecode, manifestRegistryAbi, mockTokenAbi } from "@/lib/abis";
import { fmt } from "@/lib/format";
import { fullName, manifestId, PARENT, type CreateForm, type Errors } from "@/lib/manifest";
import { Card, CopyAddress, Field } from "./ui";

export function StepToken({
  form,
  set,
  errors,
  onDecimals,
  onTaken,
}: {
  form: CreateForm;
  set: (p: Partial<CreateForm>) => void;
  errors: Errors;
  onDecimals: (d: number) => void;
  onTaken: (taken: boolean) => void;
}) {
  const token = isAddress(form.token) ? (form.token as Address) : undefined;
  const meta = useReadContracts({
    allowFailure: true,
    contracts: token
      ? [
          { address: token, abi: mockTokenAbi, functionName: "name" },
          { address: token, abi: mockTokenAbi, functionName: "symbol" },
          { address: token, abi: mockTokenAbi, functionName: "decimals" },
          { address: token, abi: mockTokenAbi, functionName: "totalSupply" },
        ]
      : [],
    query: { enabled: !!token },
  });
  const [name, symbol, decimals, supply] = meta.data ?? [];
  const readOk = name?.status === "success" && symbol?.status === "success";

  useEffect(() => {
    if (readOk) set({ name: name.result as string, symbol: symbol.result as string });
    else if (!meta.isLoading) set({ name: "", symbol: "" });
    if (decimals?.status === "success") onDecimals(Number(decimals.result));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name?.result, symbol?.result, decimals?.result, meta.isLoading, token]);

  const status = useReadContract({
    address: addresses.manifestRegistry,
    abi: manifestRegistryAbi,
    functionName: "status",
    args: [manifestId(form.label)],
    query: { enabled: !errors.label && !!form.label },
  });
  const taken = status.data !== undefined && Number(status.data) !== 0;
  useEffect(() => onTaken(taken), [taken, onTaken]);
  const dec = decimals?.status === "success" ? Number(decimals.result) : 18;

  const summary = readOk ? (
    <span className="inline-flex flex-wrap items-center gap-x-2 bg-positive-tint px-2.5 py-1 text-[13px] text-positive-ink">
      <span className="font-semibold">
        {name.result as string} ({symbol.result as string})
      </span>
      {supply?.status === "success" && <span>· {fmt(formatUnits(supply.result as bigint, dec))} total supply</span>}
    </span>
  ) : null;

  return (
    <Card title="Your token" description="Create a new token or use one you already have, then choose the ENS name your launch will live under.">
      <div className="mt-5 grid grid-cols-2 gap-1 bg-ground p-1" role="radiogroup" aria-label="Token source">
        {(
          [
            ["new", "Create a new token"],
            ["existing", "Use an existing token"],
          ] as const
        ).map(([v, t]) => (
          <button
            key={v}
            type="button"
            role="radio"
            aria-checked={form.tokenSource === v}
            className={`min-h-11 px-3 text-sm font-semibold ${form.tokenSource === v ? "bg-white text-ink shadow-sm" : "text-muted hover:text-ink"}`}
            onClick={() => form.tokenSource !== v && set({ tokenSource: v, token: "" })}
          >
            {t}
          </button>
        ))}
      </div>

      <div className="mt-5 flex flex-col gap-5">
        {form.tokenSource === "new" ? (
          <NewToken form={form} set={set} error={errors.token} summary={summary} />
        ) : (
          <Field
            id="token"
            label="Token contract"
            mono
            placeholder="0x…"
            value={form.token}
            onChange={(e) => set({ token: e.target.value.trim() })}
            error={meta.isLoading ? undefined : errors.token}
            help={meta.isLoading ? "Reading token…" : summary}
          />
        )}
        <Field
          id="label"
          label="ENS name"
          mono
          suffix={`.${PARENT}`}
          placeholder="mytoken"
          value={form.label}
          onChange={(e) => set({ label: e.target.value.toLowerCase().trim() })}
          error={errors.label}
          help={
            taken ? (
              <span className="text-negative">
                <span className="font-mono">{fullName(form.label)}</span> is already taken.{" "}
                <Link href={`/launch/${form.label}`} className="font-semibold text-negative">
                  View that launch
                </Link>
              </span>
            ) : status.data !== undefined ? (
              <span className="font-semibold text-positive-ink">Available</span>
            ) : (
              "Lowercase letters, numbers and hyphens."
            )
          }
        />
      </div>
    </Card>
  );
}

function NewToken({ form, set, error, summary }: { form: CreateForm; set: (p: Partial<CreateForm>) => void; error?: string; summary: React.ReactNode }) {
  const { address, chainId } = useAccount();
  const pc = usePublicClient({ chainId: sepolia.id });
  const { deployContractAsync } = useDeployContract();
  const [busy, setBusy] = useState(false);
  const [fail, setFail] = useState("");
  const t = form.newToken;
  const upd = (p: Partial<CreateForm["newToken"]>) => set({ newToken: { ...t, ...p } });

  const supplyOk = /^\d+(\.\d+)?$/.test(t.supply) && Number(t.supply) > 0;
  const canDeploy = t.name.trim() && t.symbol.trim() && supplyOk;

  async function deploy() {
    if (!pc) return;
    setBusy(true);
    setFail("");
    try {
      const hash = await deployContractAsync({ abi: launchTokenAbi, bytecode: launchTokenBytecode, args: [t.name.trim(), t.symbol.trim(), parseUnits(t.supply, 18)] });
      const r = await pc.waitForTransactionReceipt({ hash });
      if (r.status !== "success" || !r.contractAddress) throw new Error("Deployment failed on-chain.");
      set({ token: getAddress(r.contractAddress) });
    } catch (e) {
      setFail(e instanceof BaseError ? (e.walk((x) => (x as { code?: number }).code === 4001) ? "You rejected the transaction in your wallet." : e.shortMessage) : String(e));
    } finally {
      setBusy(false);
    }
  }

  if (isAddress(form.token))
    return (
      <div className="flex flex-col gap-2.5 border border-positive/30 bg-positive-tint/40 p-4">
        <p className="m-0 text-sm font-semibold text-positive-ink">Token deployed. The whole supply is in your wallet.</p>
        <CopyAddress address={form.token} label="Address" />
        {summary}
        <button type="button" className="self-start text-[13px] font-semibold text-muted underline hover:text-ink" onClick={() => set({ token: "" })}>
          Deploy a different token
        </button>
      </div>
    );

  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-5 sm:grid-cols-[2fr_1fr]">
        <Field id="new-name" label="Token name" placeholder="My Token" value={t.name} onChange={(e) => upd({ name: e.target.value })} />
        <Field id="new-symbol" label="Symbol" placeholder="MYT" value={t.symbol} onChange={(e) => upd({ symbol: e.target.value.toUpperCase().replace(/\s/g, "") })} />
      </div>
      <Field
        id="new-supply"
        label="Total supply"
        inputMode="decimal"
        value={t.supply}
        onChange={(e) => upd({ supply: e.target.value.replace(/,/g, "") })}
        error={t.supply && !supplyOk ? "Enter a number above 0." : undefined}
        help="Fixed forever: nobody can mint more. All of it goes to your wallet."
      />
      {fail && (
        <p className="m-0 bg-negative-tint p-3 text-sm text-negative" role="alert">
          {fail}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-3">
        {address && chainId === sepolia.id ? (
          <button type="button" className="btn btn-primary" disabled={!canDeploy || busy} onClick={deploy}>
            {busy ? "Deploying…" : `Deploy ${t.symbol || "token"}`}
          </button>
        ) : (
          <WalletButton light />
        )}
        {error && !fail && <span className="err m-0">{error}</span>}
      </div>
    </div>
  );
}
