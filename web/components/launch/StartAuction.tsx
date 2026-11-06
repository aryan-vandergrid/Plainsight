"use client";

import { useState } from "react";
import { formatUnits, parseUnits, type Address, type Hex } from "viem";
import { useAccount, usePublicClient, useReadContract, useWriteContract } from "wagmi";
import { sepolia } from "wagmi/chains";
import { WalletButton } from "@/components/Header";
import { Alert, Card, Field, TxSteps } from "@/components/create/ui";
import { addresses } from "@/lib/addresses";
import { launcherWithErrorsAbi, mockTokenAbi } from "@/lib/abis";
import { blocksToDuration, fmtPrice, fmtUsdCompact } from "@/lib/auction";
import { fmt } from "@/lib/format";
import { explainError } from "@/lib/tx";

const DURATIONS = [
  { blocks: 50, label: "10 minutes (demo)" },
  { blocks: 150, label: "30 minutes (demo)" },
  { blocks: 300, label: "1 hour" },
  { blocks: 7_200, label: "1 day" },
  { blocks: 21_600, label: "3 days" },
  { blocks: 50_400, label: "7 days" },
];

type Manifest = { token: Address; issuer: Address; greenshoeBps: number; minRaise: bigint };

export function StartAuction({ id, m, symbol, decimals, onLaunched }: { id: Hex; m: Manifest; symbol: string; decimals: number; onLaunched: () => void }) {
  const { address, chainId } = useAccount();
  const pc = usePublicClient({ chainId: sepolia.id });
  const { writeContractAsync } = useWriteContract();
  const [sale, setSale] = useState("1000000");
  const [floor, setFloor] = useState("0.50");
  const [blocks, setBlocks] = useState(150);
  const [at, setAt] = useState(-1);
  const [txs, setTxs] = useState<(string | undefined)[]>([]);
  const [error, setError] = useState("");

  const isIssuer = !!address && address.toLowerCase() === m.issuer.toLowerCase();
  const balance = useReadContract({ address: m.token, abi: mockTokenAbi, functionName: "balanceOf", args: [m.issuer] }).data;

  const gsPct = m.greenshoeBps / 100;
  const saleOk = /^\d+(\.\d+)?$/.test(sale) && Number(sale) > 0;
  const floorOk = /^\d*\.?\d+$/.test(floor) && Number(floor) > 0 && Number(floor) <= 1_000_000;
  const saleUnits = saleOk ? parseUnits(sale, decimals) : 0n;
  const supply = (saleUnits * BigInt(10_000 + m.greenshoeBps)) / 10_000n;
  const short = balance !== undefined && supply > balance;
  const minRaise = Number(formatUnits(m.minRaise, 6));
  const supplyWhole = Number(formatUnits(supply, decimals));
  const raiseAtFloor = supplyWhole * Number(floor || 0);

  const errors = {
    sale: sale && !saleOk ? "Enter a number of tokens above 0." : short ? `Your wallet holds ${fmt(formatUnits(balance!, decimals))} ${symbol}; the auction needs ${fmt(supplyWhole)}.` : undefined,
    floor: floor && !floorOk ? "Enter a price in USDC above 0." : undefined,
  };
  const ready = saleOk && floorOk && !short && isIssuer;
  const running = at >= 0 && at < 2 && !error;

  async function launch() {
    if (!address || !pc) return;
    setError("");
    setTxs([]);
    try {
      const terms = { saleAmount: saleUnits, floorPriceUsdc: parseUnits(floor, 6), durationBlocks: blocks };
      setAt(0);
      const allowance = await pc.readContract({ address: m.token, abi: mockTokenAbi, functionName: "allowance", args: [address, addresses.launcher] });
      if (allowance < supply) {
        const h = await writeContractAsync({ address: m.token, abi: mockTokenAbi, functionName: "approve", args: [addresses.launcher, supply] });
        setTxs([h]);
        await pc.waitForTransactionReceipt({ hash: h });
      }
      setAt(1);
      const { request } = await pc.simulateContract({ account: address, address: addresses.launcher, abi: launcherWithErrorsAbi, functionName: "launch", args: [id, terms] });
      const h2 = await writeContractAsync({ address: addresses.launcher, abi: launcherWithErrorsAbi, functionName: "launch", args: [id, terms], gas: request.gas });
      setTxs((t) => [t[0], h2]);
      const r = await pc.waitForTransactionReceipt({ hash: h2 });
      if (r.status !== "success") throw new Error("Starting the auction failed on-chain.");
      setAt(2);
      onLaunched();
    } catch (e) {
      setError(explainError(e));
    }
  }

  if (!isIssuer) {
    return (
      <Card title="Auction not started" description="Every check has passed. The issuer starts the auction from this page.">
        <div className="mt-4 flex flex-col gap-3">
          <Alert tone="info">One price for everyone, set by a Uniswap continuous auction. If the minimum raise of {fmtUsdCompact(minRaise)} isn&apos;t met, every bid is refunded.</Alert>
          {!address && <WalletButton light />}
          {address && <p className="m-0 text-[13px] text-muted">Connected wallet isn&apos;t the issuer.</p>}
        </div>
      </Card>
    );
  }

  return (
    <Card title="Start the auction" description="A Uniswap auction finds one fair price. You sell extra supply on top, which funds price support after launch.">
      <div className="mt-5 flex flex-col gap-5">
        <div className="grid items-end gap-3 sm:grid-cols-[1fr_auto_1fr]">
          <Field id="sale" label="Planned sale" inputMode="decimal" suffix={symbol} value={sale} onChange={(e) => setSale(e.target.value.replace(/[,\s]/g, ""))} error={errors.sale} />
          <span className="hidden pb-3 font-display text-xl font-semibold text-muted sm:block" aria-hidden="true">
            +
          </span>
          <div>
            <p className="label">Extra supply ({gsPct}%)</p>
            <p className="field m-0 bg-ground text-muted">{saleOk ? fmt(supplyWhole - Number(sale)) : "—"}</p>
          </div>
        </div>
        <div className="flex flex-wrap items-baseline justify-between gap-2 bg-ground px-4 py-3">
          <span className="text-sm text-muted">Auction supply</span>
          <span className="font-display text-xl font-semibold">
            {saleOk ? fmt(supplyWhole) : "—"} {symbol}
          </span>
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <Field id="floor" label="Starting price" inputMode="decimal" suffix="USDC" value={floor} onChange={(e) => setFloor(e.target.value.trim())} error={errors.floor} help="The price can only rise from here." />
          <div>
            <label htmlFor="duration" className="label">
              Duration
            </label>
            <select id="duration" className="field" value={blocks} onChange={(e) => setBlocks(Number(e.target.value))}>
              {DURATIONS.map((d) => (
                <option key={d.blocks} value={d.blocks}>
                  {d.label}
                </option>
              ))}
            </select>
            <p className="help">
              {blocks.toLocaleString()} blocks, {blocksToDuration(blocks)}
            </p>
          </div>
        </div>

        <div>
          <p className="label">Where the money goes</p>
          <div className="flex h-10 overflow-hidden text-[13px] font-semibold text-white" role="img" aria-label={`${(10000 / (100 + gsPct)).toFixed(1)}% to you, ${((gsPct * 100) / (100 + gsPct)).toFixed(1)}% to price support`}>
            <div className="flex items-center bg-ink pl-3" style={{ flex: 100 }}>
              100/{100 + gsPct} to you
            </div>
            <div className="ml-0.5 flex items-center justify-center bg-accent" style={{ flex: gsPct }}>
              {gsPct}
            </div>
          </div>
          <p className="help">
            At the starting price the auction raises {fmtUsdCompact(raiseAtFloor)}. The vault splits what arrives: {fmtUsdCompact((raiseAtFloor * 100) / (100 + gsPct))} to you and{" "}
            {fmtUsdCompact((raiseAtFloor * gsPct) / (100 + gsPct))} for 30 days of price support. Below the minimum raise of {fmtUsdCompact(minRaise)}, every bid is refunded and your tokens come back.
          </p>
        </div>

        {at >= 0 && <TxSteps steps={[`Approve ${fmt(supplyWhole)} ${symbol}`, "Start the auction"]} at={at} failed={!!error} done={at === 2} txs={txs} />}
        {error && <Alert>{error}</Alert>}

        {address && chainId === sepolia.id ? (
          <button type="button" className="btn btn-primary min-h-[52px] w-full text-base" disabled={!ready || running} onClick={launch}>
            {running ? "Confirm in your wallet…" : error ? "Try again" : `Start auction from ${floorOk ? fmtPrice(Number(floor)) : "—"}`}
          </button>
        ) : (
          <WalletButton light />
        )}
      </div>
    </Card>
  );
}
