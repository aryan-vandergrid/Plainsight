"use client";

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { formatUnits, isAddressEqual, type Address } from "viem";
import { useAccount, usePublicClient, useWriteContract } from "wagmi";
import { sepolia } from "wagmi/chains";
import { WalletButton } from "@/components/Header";
import { Alert, Card } from "@/components/create/ui";
import { ccaAbi, ccaWithErrorsAbi } from "@/lib/abis";
import { bidExitedEvent, exitHints, fmtPrice, getLogsChunked, q96ToUsd, standing, type BidRow, type CheckpointPoint } from "@/lib/auction";
import { fmt, shortAddr } from "@/lib/format";
import { explainError } from "@/lib/tx";
import { TxHash } from "@/components/TxHash";
import type { AuctionView } from "@/lib/useAuction";

type Exit = { tokensFilled: bigint; refund: bigint };

export function MyBids({ a, symbol, decimals }: { a: AuctionView; symbol: string; decimals: number }) {
  const { address } = useAccount();
  const pc = usePublicClient({ chainId: sepolia.id });
  const { writeContractAsync } = useWriteContract();
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const mine = address ? a.bids.filter((b) => isAddressEqual(b.owner, address)) : [];
  const auction = a.auction as Address | undefined;
  const ended = a.phase === "ended";

  const exits = useQuery({
    queryKey: ["my-exits", auction, address, a.block?.toString()],
    enabled: !!pc && !!auction && !!address && mine.length > 0 && !!a.info,
    placeholderData: (p) => p,
    queryFn: async () => {
      const logs = (await getLogsChunked(pc!, auction!, bidExitedEvent, a.info!.startBlock, a.block!, { owner: address })) as unknown as { args: { bidId: bigint; tokensFilled: bigint; currencyRefunded: bigint } }[];
      const m = new Map<string, Exit>();
      for (const l of logs) m.set(l.args.bidId.toString(), { tokensFilled: l.args.tokensFilled, refund: l.args.currencyRefunded });
      return m;
    },
  });
  const claimed = useQuery({
    queryKey: ["my-claims", auction, address, a.block?.toString()],
    enabled: !!pc && !!auction && !!address && mine.length > 0 && ended,
    placeholderData: (p) => p,
    queryFn: async () => {
      const ids = mine.map((b) => b.id);
      const rows = await pc!.multicall({ allowFailure: false, contracts: ids.map((id) => ({ address: auction!, abi: ccaAbi, functionName: "bids", args: [id] }) as const) });
      return new Map(ids.map((id, i) => [id.toString(), rows[i] as { exitedBlock: bigint; tokensFilled: bigint }]));
    },
  });

  const exited = (b: BidRow) => exits.data?.has(b.id.toString()) ?? false;
  const unsettled = mine.filter((b) => !exited(b));
  const unclaimed = mine.filter((b) => (claimed.data?.get(b.id.toString())?.tokensFilled ?? 0n) > 0n);
  const canClaim = a.claimBlock !== undefined && a.block !== undefined && a.block >= a.claimBlock && a.graduated === true;

  function points(): CheckpointPoint[] {
    const pts = [...a.checkpoints];
    const end = a.info!.endBlock;
    if (ended && a.clearingQ96 !== undefined && pts[pts.length - 1]?.block !== end) pts.push({ block: end, priceQ96: a.clearingQ96, cumulativeMps: 1e7 });
    return pts;
  }

  async function settle(list: BidRow[], claimAfter: boolean) {
    if (!pc || !auction || !address || a.clearingQ96 === undefined) return;
    setError("");
    try {
      for (const b of list) {
        setBusy(`Settling bid #${b.id}…`);
        const final = a.clearingQ96;
        if (!a.graduated || b.maxPriceQ96 > final) {
          const { request } = await pc.simulateContract({ account: address, address: auction, abi: ccaWithErrorsAbi, functionName: "exitBid", args: [b.id] });
          await pc.waitForTransactionReceipt({ hash: await writeContractAsync({ address: auction, abi: ccaWithErrorsAbi, functionName: "exitBid", args: [b.id], gas: request.gas }) });
          continue;
        }
        let h = exitHints(points(), b.maxPriceQ96, final);
        if (!h) {
          setBusy("Recording the latest price…");
          const tx = await writeContractAsync({ address: auction, abi: ccaAbi, functionName: "checkpoint" });
          const rc = await pc.waitForTransactionReceipt({ hash: tx });
          h = exitHints([...points(), { block: rc.blockNumber, priceQ96: final, cumulativeMps: 0 }], b.maxPriceQ96, final);
          if (!h) throw new Error("This bid can't be refunded yet. Try again in a block.");
        }
        const args = [b.id, h.lastFull, h.outbid] as const;
        const { request } = await pc.simulateContract({ account: address, address: auction, abi: ccaWithErrorsAbi, functionName: "exitPartiallyFilledBid", args });
        await pc.waitForTransactionReceipt({ hash: await writeContractAsync({ address: auction, abi: ccaWithErrorsAbi, functionName: "exitPartiallyFilledBid", args, gas: request.gas }) });
      }
      if (claimAfter) {
        const rows = await pc.multicall({ allowFailure: false, contracts: mine.map((b) => ({ address: auction, abi: ccaAbi, functionName: "bids", args: [b.id] }) as const) });
        const ids = mine.filter((_, i) => (rows[i] as { tokensFilled: bigint }).tokensFilled > 0n).map((b) => b.id);
        if (ids.length) {
          setBusy(`Claiming ${symbol}…`);
          const { request } = await pc.simulateContract({ account: address, address: auction, abi: ccaWithErrorsAbi, functionName: "claimTokensBatch", args: [address, ids] });
          const tx = await writeContractAsync({ address: auction, abi: ccaWithErrorsAbi, functionName: "claimTokensBatch", args: [address, ids], gas: request.gas });
          await pc.waitForTransactionReceipt({ hash: tx });
        }
      }
      await Promise.all([a.refetch(), exits.refetch(), claimed.refetch()]);
    } catch (e) {
      setError(explainError(e));
    } finally {
      setBusy("");
    }
  }

  if (!address)
    return (
      <Card title="Your bids">
        <p className="mt-3 mb-0 text-sm text-muted">Connect your wallet to see your bids{ended ? " and withdraw" : ""}.</p>
        <div className="mt-3">
          <WalletButton light />
        </div>
      </Card>
    );
  const clearing = a.clearingQ96;
  const totals = mine.reduce(
    (t, b) => {
      const x = exits.data?.get(b.id.toString());
      return x ? { tokens: t.tokens + x.tokensFilled, refund: t.refund + x.refund, spent: t.spent + b.amount - x.refund } : t;
    },
    { tokens: 0n, refund: 0n, spent: 0n },
  );
  const liveOutbid = !ended && a.graduated === true && clearing !== undefined ? unsettled.filter((b) => b.maxPriceQ96 < clearing) : [];

  return (
    <Card title="Your bids">
      {mine.length === 0 ? (
        <p className="mt-3 mb-0 text-sm text-muted">{ended ? "This wallet didn't bid." : "No bids from this wallet yet."}</p>
      ) : (
        <div className="mt-3 flex flex-col gap-3">
          <ul className="m-0 flex list-none flex-col divide-y divide-line p-0">
            {mine.map((b) => (
              <li key={b.id.toString()} className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 py-2.5 text-sm">
                <span>
                  <span className="font-semibold">Max {fmtPrice(q96ToUsd(b.maxPriceQ96, decimals))}</span>
                  <span className="text-muted"> · {fmt(formatUnits(b.amount, 6))} USDC</span>
                </span>
                <BidStatus b={b} a={a} exit={exits.data?.get(b.id.toString())} symbol={symbol} decimals={decimals} />
              </li>
            ))}
          </ul>

          {ended && (totals.tokens > 0n || totals.refund > 0n) && (
            <p className="m-0 bg-positive-tint p-3 text-sm text-positive-ink">
              {totals.tokens > 0n && (
                <>
                  <span className="font-semibold">
                    {fmt(Number(formatUnits(totals.tokens, decimals)).toFixed(2))} {symbol}
                  </span>{" "}
                  {unclaimed.length ? "won" : "in your wallet"}
                  {totals.spent > 0n && ` · average ${fmtPrice(Number(formatUnits(totals.spent, 6)) / Number(formatUnits(totals.tokens, decimals)))}`}
                </>
              )}
              {totals.tokens > 0n && totals.refund > 0n && " · "}
              {totals.refund > 0n && <span>{fmt(formatUnits(totals.refund, 6))} USDC refunded</span>}
            </p>
          )}

          {error && <Alert>{error}</Alert>}
          {ended && (unsettled.length > 0 || unclaimed.length > 0) && (
            <button type="button" className="btn btn-primary" disabled={!!busy || a.clearingQ96 === undefined || (a.graduated && !canClaim && unsettled.length === 0)} onClick={() => settle(unsettled, a.graduated === true)}>
              {busy || (a.graduated ? `Withdraw ${symbol}${unsettled.some((b) => b.maxPriceQ96 <= (clearing ?? 0n)) ? " and refunds" : ""}` : "Withdraw your USDC")}
            </button>
          )}
          {liveOutbid.length > 0 && (
            <button type="button" className="btn" disabled={!!busy} onClick={() => settle(liveOutbid, false)}>
              {busy || `Refund ${liveOutbid.length} outbid bid${liveOutbid.length > 1 ? "s" : ""} now`}
            </button>
          )}
        </div>
      )}
    </Card>
  );
}

function BidStatus({ b, a, exit, symbol, decimals }: { b: BidRow; a: AuctionView; exit?: Exit; symbol: string; decimals: number }) {
  if (exit) {
    if (exit.tokensFilled === 0n) return <span className="text-muted">Refunded {fmt(formatUnits(exit.refund, 6))} USDC</span>;
    return (
      <span className="font-semibold text-positive-ink">
        Won {fmt(Number(formatUnits(exit.tokensFilled, decimals)).toFixed(2))} {symbol}
      </span>
    );
  }
  if (a.clearingQ96 === undefined) return <span className="text-muted">…</span>;
  if (a.phase === "ended" && a.graduated === false) return <span className="font-semibold text-negative">Refund ready</span>;
  const s = standing(b.maxPriceQ96, a.clearingQ96);
  if (a.phase === "ended") return s === "outbid" ? <span className="text-muted">Outbid · refund ready</span> : <span className="font-semibold text-positive-ink">Won · ready to withdraw</span>;
  if (s === "winning") return <span className="font-semibold text-positive-ink">Winning · filling at {fmtPrice(q96ToUsd(a.clearingQ96, decimals))}</span>;
  if (s === "at-price") return <span className="font-semibold text-ink">At the price · partly filling</span>;
  return <span className="font-semibold text-negative">Outbid{a.graduated ? "" : " · refundable at the end"}</span>;
}

export function RecentBids({ a, decimals }: { a: AuctionView; decimals: number }) {
  const rows = [...a.bids].reverse().slice(0, 8);
  return (
    <Card title="Latest bids">
      {!a.logsReady ? (
        <p className="mt-3 mb-0 text-sm text-muted">Loading bids…</p>
      ) : rows.length === 0 ? (
        <p className="mt-3 mb-0 text-sm text-muted">No bids yet. Be the first.</p>
      ) : (
        <table className="mt-2 w-full border-collapse text-sm">
          <thead className="sr-only">
            <tr>
              <th>Bidder and transaction</th>
              <th>Max price</th>
              <th>Amount</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((b) => (
              <tr key={b.id.toString()} className="border-b border-line last:border-0">
                <td className="py-2">
                  <span className="block font-mono text-[13px]">{shortAddr(b.owner)}</span>
                  <TxHash hash={b.tx} className="text-[11px]" />
                </td>
                <td className="py-2">{fmtPrice(q96ToUsd(b.maxPriceQ96, decimals))}</td>
                <td className="py-2 text-right">{compactUsdc(b.amount)} USDC</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {a.bids.length > rows.length && <p className="mt-2 mb-0 text-xs text-muted">{a.bids.length - rows.length} earlier bids not shown.</p>}
    </Card>
  );
}

const compactUsdc = (v: bigint) => {
  const n = Number(formatUnits(v, 6));
  return n >= 10_000 ? new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(n) : n.toLocaleString("en-US", { maximumFractionDigits: 2 });
};
