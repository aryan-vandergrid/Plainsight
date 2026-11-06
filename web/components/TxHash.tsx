import { explorerTx, shortAddr } from "@/lib/format";

export function TxHash({ hash, className = "" }: { hash: string; className?: string }) {
  return (
    <a href={explorerTx(hash)} target="_blank" rel="noreferrer" title={hash} className={`font-mono text-xs font-medium whitespace-nowrap text-accent no-underline hover:underline ${className}`}>
      {shortAddr(hash)} ↗
    </a>
  );
}
