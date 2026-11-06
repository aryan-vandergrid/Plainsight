export function shortAddr(a?: string | null): string {
  if (!a) return "—";
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}

export const fmt = (n: string | number) => Number(n || 0).toLocaleString("en-US", { maximumFractionDigits: 6 });

export function pctOf(part: bigint, whole?: bigint): string | null {
  if (!whole || whole === 0n) return null;
  return `${(Number((part * 1_000_000n) / whole) / 10_000).toLocaleString("en-US", { maximumFractionDigits: 2 })}%`;
}

export const explorerTx = (h: string) => `https://sepolia.etherscan.io/tx/${h}`;
export const ensApp = (name: string) => `https://sepolia.app.ens.domains/${name}`;
