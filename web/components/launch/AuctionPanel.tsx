"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { formatUnits, type Hex } from "viem";
import { useAccount, usePublicClient, useWriteContract } from "wagmi";
import { sepolia } from "wagmi/chains";
import { Alert, Card, CopyAddress, Pill, Stat } from "@/components/create/ui";
import { addresses } from "@/lib/addresses";
import { greenshoeVaultAbi } from "@/lib/abis";
import { coverage, fmtPrice, fmtTokensCompact, fmtUsdCompact, q96ToUsd } from "@/lib/auction";
import { explainError } from "@/lib/tx";
import type { AuctionView } from "@/lib/useAuction";
import { PriceChart } from "./PriceChart";

export function AuctionPanel({ id, a, symbol, decimals, minRaise, greenshoeBps }: { id: Hex; a: AuctionView; symbol: string; decimals: number; minRaise: bigint; greenshoeBps: number }) {
  const info = a.info!;
  const ended = a.phase === "ended";
  const price = a.clearingQ96 !== undefined ? q96ToUsd(a.clearingQ96, decimals) : undefined;
  const supply = Number(formatUnits(info.supply, decimals));
  const raised = a.currencyRaised ?? 0n;
  const sold = a.totalCleared !== undefined ? Number(formatUnits(a.totalCleared, decimals)) : 0;
  const released = a.cumulativeMps !== undefined ? a.cumulativeMps / 1e7 : 0;
  const totalBid = a.bids.reduce((s, b) => s + b.amount, 0n);
  const bidders = new Set(a.bids.map((b) => b.owner.toLowerCase())).size;
  const cov = a.clearingQ96 !== undefined ? coverage(totalBid, info.supply, a.clearingQ96) : null;
  const graduated = raised >= minRaise;
  const refunded = ended && a.graduated === false;
  const minUsd = Number(formatUnits(minRaise, 6));

  return (
    <Card
      title={ended ? (refunded ? "Auction refunded" : "Auction result") : a.phase === "upcoming" ? "Auction opens next block" : "Auction live"}
      action={ended ? <Pill tone={refunded ? "bad" : "ok"}>{refunded ? "Minimum missed" : "Graduated"}</Pill> : <Pill tone={graduated ? "ok" : "muted"}>{graduated ? "Minimum raise reached" : `Min raise ${fmtUsdCompact(minUsd)}`}</Pill>}
    >
      <div className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Stat label={ended ? "Final price" : "Price now"} value={price !== undefined ? fmtPrice(price) : "—"} sub={ended ? "Closing clearing price" : "Can only rise"} />
        <Stat label="For sale" value={fmtTokensCompact(supply)} sub={symbol} />
        <Stat label={ended ? "Raised" : "Raised so far"} value={fmtUsdCompact(Number(formatUnits(raised, 6)))} sub={cov !== null && totalBid > 0n ? `${cov.toFixed(2)}× covered` : "No bids yet"} />
        <Stat label="Bidders" value={bidders.toLocaleString()} sub={`${a.bids.length} bid${a.bids.length === 1 ? "" : "s"}`} />
      </div>

      <div className="mt-5">
        <div className="mb-1.5 flex flex-wrap justify-between gap-2 text-[13px] text-muted">
          <span>Sold so far</span>
          <span className="font-semibold text-ink">
            {sold.toLocaleString("en-US", { maximumFractionDigits: 0 })} / {supply.toLocaleString("en-US")} {symbol}
          </span>
        </div>
        <div className="relative h-2.5 overflow-hidden bg-line">
          <div className="h-full bg-ink transition-[width] duration-500" style={{ width: `${Math.min(100, (sold / supply) * 100)}%` }} />
          {!ended && released > 0 && <div className="absolute top-0 h-full w-0.5 bg-ink" style={{ left: `${Math.min(100, released * 100)}%` }} title={`${Math.round(released * 100)}% released by schedule`} />}
        </div>
        {!ended && <p className="help">A little is released every block and at least 30% in the final block. The dark tick is how much the schedule has released so far.</p>}
      </div>

      <div className="mt-6">
        <p className="eyebrow mb-2">Price{ended ? "" : " · can only go up"}</p>
        {a.floorQ96 !== undefined ? (
          <PriceChart points={a.checkpoints} startBlock={info.startBlock} endBlock={info.endBlock} nowBlock={a.block} nowQ96={a.clearingQ96} floorQ96={a.floorQ96} decimals={decimals} />
        ) : (
          <div className="h-[180px] animate-pulse bg-ground" />
        )}
      </div>

      {!ended && (
        <p className="mt-4 mb-0 text-sm leading-relaxed text-muted">
          Uniswap continuous auction: a little is sold every block and the price can only rise. In each block every bidder pays the same clearing price, never more than their max. Below the minimum raise of {fmtUsdCompact(minUsd)}
          {graduated ? "" : ` (${fmtUsdCompact(Math.max(0, minUsd - Number(formatUnits(raised, 6))))} to go)`}, all bids are refunded.
        </p>
      )}

      {ended && <Proceeds id={id} a={a} symbol={symbol} decimals={decimals} greenshoeBps={greenshoeBps} refunded={refunded} />}

      <div className="mt-5 border-t border-line pt-4">
        <CopyAddress address={a.auction!} label="Auction" kind="address" />
      </div>
    </Card>
  );
}

function Proceeds({ id, a, symbol, decimals, greenshoeBps, refunded }: { id: Hex; a: AuctionView; symbol: string; decimals: number; greenshoeBps: number; refunded: boolean }) {
  const { address } = useAccount();
  const pc = usePublicClient({ chainId: sepolia.id });
  const qc = useQueryClient();
  const { writeContractAsync } = useWriteContract();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const s = a.sale;
  const gs = greenshoeBps / 100;

  async function open() {
    if (!pc || !address) return;
    setBusy(true);
    setError("");
    try {
      const { request } = await pc.simulateContract({ account: address, address: addresses.greenshoeVault, abi: greenshoeVaultAbi, functionName: "collectAndPlace", args: [id] });
      const h = await writeContractAsync({ address: addresses.greenshoeVault, abi: greenshoeVaultAbi, functionName: "collectAndPlace", args: [id], gas: request.gas });
      await pc.waitForTransactionReceipt({ hash: h });
      await a.refetch();
      await qc.invalidateQueries();
    } catch (e) {
      setError(explainError(e));
    } finally {
      setBusy(false);
    }
  }

  if (!s) return null;
  const usd = (v: bigint) => fmtUsdCompact(Number(formatUnits(v, 6)));

  return (
    <div className="mt-6 border-t border-line pt-5">
      <p className="eyebrow">Proceeds</p>
      {!s.collected ? (
        <div className="mt-3 flex flex-col gap-3">
          <p className="m-0 text-sm text-muted">
            {refunded
              ? `The minimum raise wasn't met. Every bidder can withdraw their full USDC, and this returns all ${symbol} to the issuer. No pool opens.`
              : `One step: the vault collects the raise, sends 100/${100 + gs} to the issuer, opens the Uniswap pool at the final price and places the other ${gs}/${100 + gs} as a buy wall below it.`}
          </p>
          {error && <Alert>{error}</Alert>}
          {address ? (
            <button type="button" className="btn btn-primary self-start" disabled={busy} onClick={open}>
              {busy ? "Confirm in your wallet…" : refunded ? `Return ${symbol} to the issuer` : "Open the pool"}
            </button>
          ) : (
            <p className="m-0 text-[13px] text-muted">Anyone can do this. Connect a wallet to send it.</p>
          )}
        </div>
      ) : refunded || s.received === 0n ? (
        <p className="mt-3 mb-0 text-sm text-muted">
          Collected. {fmtTokensCompact(Number(formatUnits(s.unsoldTokens, decimals)))} {symbol} returned to the issuer; the vault holds nothing.
        </p>
      ) : (
        <div className="mt-3 flex flex-col gap-3">
          <div className="flex h-10 overflow-hidden text-[13px] font-semibold text-white" role="img" aria-label={`${usd(s.toIssuer)} to the issuer, ${usd(s.reserve)} for price support`}>
            <div className="flex min-w-0 items-center truncate bg-ink pl-3" style={{ flex: 100 }}>
              {usd(s.toIssuer)} to the issuer
            </div>
            <div className="ml-0.5 flex min-w-0 items-center justify-center truncate bg-accent px-1" style={{ flex: Math.max(gs, 12) }}>
              {usd(s.reserve)}
            </div>
          </div>
          <p className="m-0 text-sm text-muted">
            {usd(s.received)} arrived from the auction. {usd(s.reserve)} {s.poolOpened ? "became the buy wall under the pool price" : "is held by the vault"}.
            {s.unsoldTokens >= 10n ** BigInt(decimals) && ` ${fmtTokensCompact(Number(formatUnits(s.unsoldTokens, decimals)))} unsold ${symbol} went back to the issuer.`}
          </p>
        </div>
      )}
    </div>
  );
}
