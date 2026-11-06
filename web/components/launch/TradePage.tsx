"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";
import { formatUnits, maxUint160, maxUint256, parseUnits, type Address } from "viem";
import { useAccount, usePublicClient, useReadContract, useWriteContract } from "wagmi";
import { sepolia } from "wagmi/chains";
import { WalletButton } from "@/components/Header";
import { Alert, Card, Field, Pill, TxSteps } from "@/components/create/ui";
import { addresses } from "@/lib/addresses";
import { manifestRegistryAbi, mockTokenAbi, permit2Abi, plainsightHookAbi, usdcAbi, v4QuoterAbi } from "@/lib/abis";
import { fmtPrice, fmtUsdCompact } from "@/lib/auction";
import { TxHash } from "@/components/TxHash";
import { fmt, shortAddr } from "@/lib/format";
import { fullName } from "@/lib/manifest";
import { encodeExactInSingle, universalRouterAbi } from "@/lib/trade";
import { explainError } from "@/lib/tx";
import { useLaunchData, type LaunchData } from "@/lib/useLaunchData";
import { LaunchTabs } from "./LaunchTabs";
import { PausedBanner } from "./PausedBanner";

const SLIPPAGE_BPS = 100n;

export function TradePage({ label }: { label: string }) {
  const d = useLaunchData(label);
  if (d.status.isLoading || !d.a.saleReady || (d.opened && !d.p.key)) return <Shell>Loading {fullName(label)}…</Shell>;
  if (!d.opened || !d.p.key)
    return (
      <Shell>
        <Card title="Trading hasn't opened" description="The pool opens once the auction ends and the vault places the buy wall.">
          <Link href={`/launch/${label}`} className="btn mt-4">
            Back to the launch
          </Link>
        </Card>
      </Shell>
    );
  return (
    <Shell>
      <div>
        <Link href={`/launch/${label}`} className="font-mono text-sm text-muted">
          {fullName(label)}
        </Link>
        <h1 className="h mt-1 text-[30px]">
          Trade {d.symbol} <span className="text-lg font-semibold text-muted">{d.p.priceUsd !== undefined ? fmtPrice(d.p.priceUsd) : ""}</span>
        </h1>
      </div>
      <LaunchTabs label={label} active="trade" />
      {d.h.paused && <PausedBanner reason={d.h.config?.pauseReason} until={d.h.pausedUntil} />}
      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="flex min-w-0 flex-col gap-5">
          <SwapBox d={d} />
          <RecentTrades d={d} />
        </div>
        <aside className="flex min-w-0 flex-col gap-5">
          <PoolRules d={d} />
        </aside>
      </div>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return <main className="mx-auto flex max-w-[1200px] flex-col gap-5 px-4 pt-10 pb-8 sm:px-8">{children}</main>;
}

function SwapBox({ d }: { d: LaunchData }) {
  const { address, chainId } = useAccount();
  const pc = usePublicClient({ chainId: sepolia.id });
  const { writeContractAsync } = useWriteContract();
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [amount, setAmount] = useState("");
  const [at, setAt] = useState(-1);
  const [links, setLinks] = useState<(string | undefined)[]>([]);
  const [error, setError] = useState("");
  const [done, setDone] = useState("");

  const key = d.p.key!;
  const token = d.token as Address;
  const tokenIs0 = d.p.tokenIs0;
  const zeroForOne = side === "buy" ? !tokenIs0 : tokenIs0;
  const inToken = side === "buy" ? addresses.usdc : token;
  const inDec = side === "buy" ? 6 : d.decimals;
  const outDec = side === "buy" ? d.decimals : 6;
  const inSym = side === "buy" ? "USDC" : d.symbol;
  const outSym = side === "buy" ? d.symbol : "USDC";
  const ok = /^\d*\.?\d+$/.test(amount.trim()) && Number(amount) > 0;
  const amountIn = ok ? parseUnits(amount.trim(), inDec) : 0n;

  const bal = useReadContract({ address: inToken, abi: mockTokenAbi, functionName: "balanceOf", args: [address!], query: { enabled: !!address, refetchInterval: 6_000 } });
  const insider = useReadContract({ address: addresses.manifestRegistry, abi: manifestRegistryAbi, functionName: "isInsider", args: [d.id, address!], query: { enabled: !!address } }).data;
  const feePips = useReadContract({ address: addresses.plainsightHook, abi: plainsightHookAbi, functionName: "feeFor", args: [d.p.poolId!, address ?? "0x0000000000000000000000000000000000000000", zeroForOne], query: { enabled: !!d.p.poolId, refetchInterval: 6_000 } }).data;
  const fee = feePips ?? 3000;
  const insiderFee = fee > 3000;

  const quote = useQuery({
    queryKey: ["quote", d.p.poolId, side, amountIn.toString(), d.a.block?.toString()],
    enabled: !!pc && amountIn > 0n && !d.h.paused,
    queryFn: async () => {
      const [out] = await pc!.readContract({
        address: addresses.v4.quoter,
        abi: v4QuoterAbi,
        functionName: "quoteExactInputSingle",
        args: [{ poolKey: key, zeroForOne, exactAmount: amountIn, hookData: "0x" }],
      });
      return insiderFee ? (out * BigInt(1_000_000 - fee)) / BigInt(1_000_000 - 3000) : out;
    },
    retry: false,
  });
  const minOut = quote.data !== undefined ? (quote.data * (10_000n - SLIPPAGE_BPS)) / 10_000n : 0n;
  const short = bal.data !== undefined && amountIn > bal.data;
  const ready = ok && !short && !d.h.paused && quote.data !== undefined && quote.data > 0n;
  const running = at >= 0 && at < 3 && !error;

  async function swap() {
    if (!address || !pc) return;
    setError("");
    setDone("");
    setLinks([]);
    try {
      setAt(0);
      const toPermit2 = await pc.readContract({ address: inToken, abi: usdcAbi, functionName: "allowance", args: [address, addresses.cca.permit2] });
      if (toPermit2 < amountIn) {
        const h = await writeContractAsync({ address: inToken, abi: usdcAbi, functionName: "approve", args: [addresses.cca.permit2, maxUint256] });
        setLinks([h]);
        await pc.waitForTransactionReceipt({ hash: h });
      }
      setAt(1);
      const [allowed, exp] = await pc.readContract({ address: addresses.cca.permit2, abi: permit2Abi, functionName: "allowance", args: [address, inToken, addresses.v4.universalRouter] });
      const now = Math.floor(Date.now() / 1000);
      if (allowed < amountIn || exp < now + 3600) {
        const h = await writeContractAsync({ address: addresses.cca.permit2, abi: permit2Abi, functionName: "approve", args: [inToken, addresses.v4.universalRouter, maxUint160, now + 30 * 86_400] });
        setLinks((l) => [l[0], h]);
        await pc.waitForTransactionReceipt({ hash: h });
      }
      setAt(2);
      const { commands, inputs } = encodeExactInSingle(key, zeroForOne, amountIn, minOut);
      const args = [commands, inputs, BigInt(now + 600)] as const;
      const { request } = await pc.simulateContract({ account: address, address: addresses.v4.universalRouter, abi: universalRouterAbi, functionName: "execute", args });
      const h = await writeContractAsync({ address: addresses.v4.universalRouter, abi: universalRouterAbi, functionName: "execute", args, gas: request.gas });
      setLinks((l) => [l[0], l[1], h]);
      const r = await pc.waitForTransactionReceipt({ hash: h });
      if (r.status !== "success") throw new Error("The swap failed on-chain.");
      setAt(3);
      setDone(`Swapped ${fmt(amount)} ${inSym} for about ${fmt(Number(formatUnits(quote.data!, outDec)).toFixed(4))} ${outSym}.`);
      setAmount("");
      await Promise.all([d.p.refetch(), d.h.refetch(), bal.refetch()]);
    } catch (e) {
      setError(explainError(e));
    }
  }

  async function faucet() {
    if (!address || !pc) return;
    try {
      const h = await writeContractAsync({ address: addresses.usdc, abi: usdcAbi, functionName: "mint", args: [address, 10_000n * 10n ** 6n] });
      await pc.waitForTransactionReceipt({ hash: h });
      await bal.refetch();
    } catch (e) {
      setError(explainError(e));
    }
  }

  const myName = d.nameOf(address);
  const windowEnd = d.h.config ? new Date(Number(d.h.config.windowEnd) * 1000).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "";

  return (
    <Card title="Swap" action={<Pill tone={insiderFee ? "bad" : "muted"}>{insiderFee ? `Insider fee ${fee / 10_000}%` : "Fee 0.30%"}</Pill>}>
      <div className="mt-4 grid grid-cols-2 gap-1 bg-ground p-1" role="radiogroup" aria-label="Side">
        {(["buy", "sell"] as const).map((s) => (
          <button
            key={s}
            type="button"
            role="radio"
            aria-checked={side === s}
            className={`min-h-11 text-sm font-semibold ${side === s ? "bg-white text-ink shadow-sm" : "text-muted hover:text-ink"}`}
            onClick={() => {
              setSide(s);
              setAmount("");
              setAt(-1);
              setError("");
            }}
          >
            {s === "buy" ? `Buy ${d.symbol}` : `Sell ${d.symbol}`}
          </button>
        ))}
      </div>

      <div className="mt-4 flex flex-col gap-4">
        {insider && side === "sell" && (
          <Alert>
            This wallet is disclosed as <span className="font-mono font-semibold">{myName ?? "an insider"}</span>. Selling before {windowEnd} costs the {fee / 10_000}% insider fee instead of 0.30%, and the sale is logged publicly.
          </Alert>
        )}
        <Field
          id="swap-in"
          label={`You pay (${inSym})`}
          inputMode="decimal"
          suffix={inSym}
          placeholder="0"
          value={amount}
          onChange={(e) => setAmount(e.target.value.replace(/[,\s]/g, ""))}
          error={amount && !ok ? "Enter an amount." : short ? `More than your ${inSym} balance.` : undefined}
          help={bal.data !== undefined ? `Balance ${fmt(formatUnits(bal.data, inDec))} ${inSym}` : undefined}
        />
        <div className=" bg-ground px-4 py-3">
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-sm text-muted">You receive about</span>
            <span className="font-display text-xl font-semibold">
              {quote.isFetching && quote.data === undefined ? "…" : quote.data !== undefined ? `${fmt(Number(formatUnits(quote.data, outDec)).toFixed(outDec === 6 ? 2 : 4))} ${outSym}` : "—"}
            </span>
          </div>
          {quote.data !== undefined && (
            <p className="m-0 mt-1 text-xs text-muted">
              At least {fmt(Number(formatUnits(minOut, outDec)).toFixed(4))} {outSym} (1% slippage) · fee {fee / 10_000}%{insiderFee ? " (insider)" : ""}
            </p>
          )}
          {quote.isError && <p className="m-0 mt-1 text-xs text-negative">No quote: the pool can&apos;t fill this size right now.</p>}
        </div>

        {at >= 0 && <TxSteps steps={[`Allow Permit2 to move your ${inSym}`, "Allow the Uniswap router through Permit2", "Swap"]} at={at} failed={!!error} done={at === 3} txs={links} />}
        {done && !error && <p className="m-0 text-sm font-semibold text-positive-ink">{done}</p>}
        {error && <Alert>{error}</Alert>}

        {address && chainId === sepolia.id ? (
          <button type="button" className="btn btn-primary min-h-[52px] text-base" disabled={!ready || running} onClick={swap}>
            {running ? "Confirm in your wallet…" : d.h.paused ? "Trading is paused" : side === "buy" ? `Buy ${d.symbol}` : `Sell ${d.symbol}`}
          </button>
        ) : (
          <WalletButton light />
        )}
        {address && side === "buy" && (
          <button type="button" className="self-end text-xs font-medium text-accent hover:underline" onClick={faucet}>
            Get 10,000 test USDC
          </button>
        )}
      </div>
    </Card>
  );
}

function PoolRules({ d }: { d: LaunchData }) {
  const m = d.manifest;
  const cfg = d.h.config;
  const open = d.a.sale ? Number(d.a.sale.clearingPriceQ96 * 10n ** BigInt(d.decimals) / (1n << 96n)) / 1e6 : undefined;
  const depth = m ? m.rangeDepthBps / 100 : 10;
  const until = cfg ? new Date(Number(cfg.windowEnd) * 1000).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "…";
  const rules = [
    { t: "Pool fee 0.30%", d: "Paid to liquidity providers on every swap." },
    { t: `Insiders pay ${m ? m.insiderFeeBps / 100 : "…"}% to sell until ${until}`, d: "Team, investor and market-maker wallets from the manifest. Logged publicly." },
    {
      t: "Wash trades pay 1% and count as fake",
      d: (
        <>
          Tokens bought and sold back in one transaction count as fake, fully or partly: only the matched amount. Its 1% penalty goes to the protocol treasury{" "}
          {m?.treasury ? <span className="font-mono">{shortAddr(m.treasury)}</span> : null}, published on {d.label}.plainsight.eth.
        </>
      ),
    },
    { t: `Buy wall ${open ? `${fmtPrice(open * (1 - depth / 100))} to ${fmtPrice(open)}` : ""}`, d: `The vault's ${d.a.sale ? fmtUsdCompact(Number(formatUnits(d.a.sale.reserve, 6))) : ""} reserve buys as the price falls, locked until ${until}.` },
    {
      t: "Emergency pause, 24 hours at most",
      d: `Only ${m ? shortAddr(m.agent) : "the agent"} (agent.${d.label}.plainsight.eth${m?.agentOperator ? `, run by ${m.agentOperator}` : ""}) can halt swaps, with a public reason. A halt lifts itself after 24 hours and can't be renewed for another 24. Liquidity can always be withdrawn.`,
    },
  ];
  return (
    <Card title="Pool rules" description="Enforced by the pool's hook, not by a promise.">
      <ul className="mt-4 mb-0 flex list-none flex-col gap-3 p-0">
        {rules.map((r) => (
          <li key={r.t} className="text-sm">
            <p className="m-0 font-semibold">{r.t}</p>
            <p className="m-0 mt-0.5 text-muted">{r.d}</p>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function RecentTrades({ d }: { d: LaunchData }) {
  const fakeTx = new Set(d.h.activity.filter((a) => a.kind === "roundTrip").map((a) => a.tx));
  const insiderTx = new Set(d.h.activity.filter((a) => a.kind === "insider").map((a) => a.tx));
  const rungTx = new Set(d.h.activity.filter((a) => a.kind === "rung" || a.kind === "opened").map((a) => a.tx));
  const hist = d.p.history;
  const rows = hist
    .map((x, i) => ({ ...x, dir: i === 0 ? 0 : Math.sign(x.usd - hist[i - 1].usd) }))
    .filter((x) => x.tx && !rungTx.has(x.tx))
    .reverse()
    .slice(0, 12);

  return (
    <Card title="Recent trades" description="Every swap in the pool, tagged by what the hook saw.">
      {!d.p.historyReady ? (
        <div className="mt-4 h-24 animate-pulse bg-ground" aria-label="Loading trades" />
      ) : rows.length === 0 ? (
        <p className="mt-4 mb-0 text-sm text-muted">No trades yet.</p>
      ) : (
        <table className="mt-3 w-full border-collapse text-sm">
          <thead>
            <tr className="text-left text-xs text-muted">
              <th className="py-2 font-semibold">Trade</th>
              <th className="py-2 text-right font-semibold">USDC</th>
              <th className="py-2 text-right font-semibold">Price after</th>
              <th className="py-2 text-right font-semibold">Tag</th>
              <th className="py-2 text-right font-semibold">Tx</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((x, i) => {
              const tag = fakeTx.has(x.tx!) ? ["Fake · penalty", "text-negative"] : insiderTx.has(x.tx!) ? ["Insider fee", "text-negative"] : ["Normal", "text-muted"];
              return (
                <tr key={`${x.tx}-${i}`} className="border-t border-line">
                  <td className="py-2">
                    <span className="font-semibold">{x.dir > 0 ? "Buy" : x.dir < 0 ? "Sell" : "Swap"}</span>
                  </td>
                  <td className="py-2 text-right">{fmtUsdCompact(Number(formatUnits(x.volume, 6)))}</td>
                  <td className="py-2 text-right">{fmtPrice(x.usd)}</td>
                  <td className={`py-2 text-right text-xs font-semibold ${tag[1]}`}>{tag[0]}</td>
                  <td className="py-2 text-right">
                    <TxHash hash={x.tx!} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </Card>
  );
}
