"use client";

import { useState } from "react";
import { useCountdown } from "@/lib/useCountdown";
import { formatUnits, maxUint160, maxUint256, parseUnits, type Address } from "viem";
import { useAccount, usePublicClient, useReadContract, useWriteContract } from "wagmi";
import { sepolia } from "wagmi/chains";
import { WalletButton } from "@/components/Header";
import { Alert, Card, Field, TxSteps } from "@/components/create/ui";
import { addresses } from "@/lib/addresses";
import { ccaWithErrorsAbi, permit2Abi, usdcAbi } from "@/lib/abis";
import { clock, fmtPrice, q96ToUsd, usdToBidQ96 } from "@/lib/auction";
import { fmt } from "@/lib/format";
import { explainError } from "@/lib/tx";
import type { AuctionView } from "@/lib/useAuction";

const STEPS = ["Allow Permit2 to move your USDC", "Allow this auction through Permit2", "Place your bid"];
const FAUCET = 10_000n * 10n ** 6n;
const MAX_MINT = 1_000_000n * 10n ** 6n;

export function BidBox({ a, symbol, decimals }: { a: AuctionView; symbol: string; decimals: number }) {
  const { address, chainId } = useAccount();
  const pc = usePublicClient({ chainId: sepolia.id });
  const { writeContractAsync } = useWriteContract();
  const [max, setMax] = useState("");
  const [spend, setSpend] = useState("");
  const [at, setAt] = useState(-1);
  const [links, setLinks] = useState<(string | undefined)[]>([]);
  const [error, setError] = useState("");
  const [minting, setMinting] = useState(false);
  const [placed, setPlaced] = useState(false);

  const usdc = useReadContract({ address: addresses.usdc, abi: usdcAbi, functionName: "balanceOf", args: [address!], query: { enabled: !!address, refetchInterval: 6_000 } });
  const balance = usdc.data;

  const live = a.phase === "live";
  const info = a.info!;
  const price = a.clearingQ96 !== undefined ? q96ToUsd(a.clearingQ96, decimals) : undefined;
  const maxQ96 = a.floorQ96 !== undefined && a.tickQ96 !== undefined ? usdToBidQ96(max, decimals, a.floorQ96, a.tickQ96) : null;
  const maxUsd = maxQ96 !== null ? q96ToUsd(maxQ96, decimals) : undefined;
  const spendOk = /^\d*\.?\d+$/.test(spend.trim()) && Number(spend) > 0;
  const spendUnits = spendOk ? parseUnits(spend.trim(), 6) : 0n;
  const snapped = maxUsd !== undefined && Math.abs(maxUsd - Number(max)) > 1e-9;
  const short = balance !== undefined && spendUnits > balance;

  const maxErr = !max
    ? undefined
    : maxQ96 === null
      ? "Enter a price in USDC."
      : a.clearingQ96 !== undefined && maxQ96 <= a.clearingQ96
        ? `Must be above the current price of ${fmtPrice(price!)}.`
        : a.maxBidQ96 !== undefined && maxQ96 > a.maxBidQ96
          ? "That's above the highest price this auction accepts."
          : undefined;
  const spendErr = spend && !spendOk ? "Enter an amount of USDC." : spendUnits >= 2n ** 128n ? "That amount is too large." : undefined;
  const ready = live && !!address && maxQ96 !== null && !maxErr && spendOk && !spendErr && !short;
  const running = at >= 0 && at < 3 && !error;

  async function faucet() {
    if (!address || !pc) return;
    setMinting(true);
    setError("");
    try {
      let need = spendUnits > (balance ?? 0n) ? spendUnits - (balance ?? 0n) : FAUCET;
      if (need < FAUCET) need = FAUCET;
      if (need > MAX_MINT) need = MAX_MINT;
      const h = await writeContractAsync({ address: addresses.usdc, abi: usdcAbi, functionName: "mint", args: [address, need] });
      await pc.waitForTransactionReceipt({ hash: h });
      await usdc.refetch();
    } catch (e) {
      setError(explainError(e));
    } finally {
      setMinting(false);
    }
  }

  async function bid() {
    if (!address || !pc || maxQ96 === null || !a.auction) return;
    const auction = a.auction as Address;
    setError("");
    setLinks([]);
    setPlaced(false);
    try {
      setAt(0);
      const toPermit2 = await pc.readContract({ address: addresses.usdc, abi: usdcAbi, functionName: "allowance", args: [address, addresses.cca.permit2] });
      if (toPermit2 < spendUnits) {
        const h = await writeContractAsync({ address: addresses.usdc, abi: usdcAbi, functionName: "approve", args: [addresses.cca.permit2, maxUint256] });
        setLinks((l) => [h, l[1], l[2]]);
        await pc.waitForTransactionReceipt({ hash: h });
      }

      setAt(1);
      const [allowed, expiration] = await pc.readContract({ address: addresses.cca.permit2, abi: permit2Abi, functionName: "allowance", args: [address, addresses.usdc, auction] });
      const now = Math.floor(Date.now() / 1000);
      if (allowed < spendUnits || expiration < now + 3600) {
        const h = await writeContractAsync({ address: addresses.cca.permit2, abi: permit2Abi, functionName: "approve", args: [addresses.usdc, auction, maxUint160, now + 30 * 86_400] });
        setLinks((l) => [l[0], h, l[2]]);
        await pc.waitForTransactionReceipt({ hash: h });
      }

      setAt(2);
      let hint = a.floorQ96!;
      for (const b of a.bids) if (b.maxPriceQ96 < maxQ96 && b.maxPriceQ96 > hint) hint = b.maxPriceQ96;
      const args = [maxQ96, spendUnits, address, hint, "0x"] as const;
      const { request } = await pc.simulateContract({ account: address, address: auction, abi: ccaWithErrorsAbi, functionName: "submitBid", args });
      const h = await writeContractAsync({ address: auction, abi: ccaWithErrorsAbi, functionName: "submitBid", args, gas: request.gas });
      setLinks((l) => [l[0], l[1], h]);
      const r = await pc.waitForTransactionReceipt({ hash: h });
      if (r.status !== "success") throw new Error("The bid failed on-chain.");
      setAt(3);
      setPlaced(true);
      setSpend("");
      await Promise.all([a.refetch(), usdc.refetch()]);
    } catch (e) {
      setError(explainError(e));
    }
  }

  const blocksLeft = a.block !== undefined ? Number(info.endBlock - a.block) : undefined;
  const secsLeft = useCountdown(blocksLeft);
  const tokensAtMax = maxUsd && spendOk ? Number(spend) / maxUsd : undefined;
  const tokensNow = price && spendOk ? Number(spend) / price : undefined;

  return (
    <Card
      className="border border-accent"
      title="Place a bid"
      action={<span className="font-mono text-[15px] font-semibold">{live && secsLeft !== undefined ? `${clock(secsLeft)} left` : a.phase === "upcoming" ? "Opens soon" : ""}</span>}
    >
      <div className="mt-4 flex flex-col gap-4">
        <div className="flex items-baseline justify-between">
          <span className="text-sm text-muted">Price now</span>
          <span className="h text-[32px]">{price !== undefined ? fmtPrice(price) : "—"}</span>
        </div>

        <Field
          id="bid-max"
          label={`Max price per ${symbol}`}
          inputMode="decimal"
          suffix="USDC"
          placeholder={price !== undefined ? (price * 1.2).toFixed(2) : "1.20"}
          value={max}
          onChange={(e) => setMax(e.target.value.replace(/[$,\s]/g, ""))}
          error={maxErr}
          help={snapped && maxUsd !== undefined ? `Rounded down to the auction's price grid: ${fmtPrice(maxUsd)}.` : "The most you'd pay. You may pay less."}
        />
        <Field
          id="bid-spend"
          label="Spend"
          inputMode="decimal"
          suffix="USDC"
          placeholder="1000"
          value={spend}
          onChange={(e) => setSpend(e.target.value.replace(/[,\s]/g, ""))}
          error={spendErr ?? (short ? "More than your USDC balance." : undefined)}
          help={tokensAtMax ? `At least ${fmt(tokensAtMax.toFixed(2))} ${symbol} if the price stays below your max${tokensNow ? `, about ${fmt(tokensNow.toFixed(2))} at today's price` : ""}.` : undefined}
        />

        <Alert tone="info">You never pay more than your max: each block, every bidder buys at the same clearing price. Unused USDC comes back to you, and if the minimum raise is missed you get everything back.</Alert>

        {at >= 0 && <TxSteps steps={STEPS} at={at} failed={!!error} done={at === 3} txs={links} />}
        {placed && !error && <p className="m-0 text-sm font-semibold text-positive-ink">Bid placed. It shows under Your bids.</p>}
        {error && <Alert>{error}</Alert>}

        {address && chainId === sepolia.id ? (
          <button type="button" className="btn btn-primary min-h-[52px] text-base" disabled={!ready || running} onClick={bid}>
            {running ? "Confirm in your wallet…" : !live ? "Bidding opens next block" : "Place bid"}
          </button>
        ) : (
          <WalletButton light />
        )}

        {address && (
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
            <span>Balance {balance !== undefined ? fmt(formatUnits(balance, 6)) : "…"} USDC</span>
            <button type="button" className="min-h-9 px-2 font-medium text-accent hover:bg-accent-tint disabled:opacity-50" disabled={minting} onClick={faucet}>
              {minting ? "Minting…" : "Get test USDC"}
            </button>
          </div>
        )}
      </div>
    </Card>
  );
}
