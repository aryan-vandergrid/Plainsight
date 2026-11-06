"use client";

import { isAddressEqual, type Address } from "viem";
import { useReadContract, useReadContracts } from "wagmi";
import { addresses } from "./addresses";
import { launcherAbi, manifestRegistryAbi, mockTokenAbi } from "./abis";
import { CHECKS, CheckStatus } from "./checks";
import { manifestId, subName } from "./manifest";
import { useAuction } from "./useAuction";
import { useHook } from "./useHook";
import { usePool } from "./usePool";

const REFRESH_MS = 10_000;

export function useLaunchData(label: string) {
  const id = manifestId(label);
  const status = useReadContract({ address: addresses.manifestRegistry, abi: manifestRegistryAbi, functionName: "status", args: [id], query: { refetchInterval: REFRESH_MS } });
  const manifest = useReadContract({ address: addresses.manifestRegistry, abi: manifestRegistryAbi, functionName: "get", args: [id], query: { enabled: !!status.data } });
  const token = manifest.data?.token;
  const meta = useReadContracts({
    contracts: token
      ? [
          { address: token, abi: mockTokenAbi, functionName: "name" },
          { address: token, abi: mockTokenAbi, functionName: "symbol" },
          { address: token, abi: mockTokenAbi, functionName: "decimals" },
        ]
      : [],
    query: { enabled: !!token },
  });
  const [name, symbol, dec] = (meta.data ?? []).map((r) => r.result) as [string?, string?, number?];
  const checks = useReadContract({ address: addresses.launcher, abi: launcherAbi, functionName: "checks", args: [id], query: { enabled: !!status.data, refetchInterval: REFRESH_MS } });
  const st = checks.data?.slice(0, CHECKS.length);
  const verified = !!st && st.every((s) => s === CheckStatus.Passed);
  const decimals = dec ?? 18;
  const a = useAuction(id, verified);
  const opened = !!a.sale?.poolOpened;
  const p = usePool(id, label, token, opened, decimals, a.info?.endBlock, a.block);
  const h = useHook(id, p.poolId, p.openBlock, a.block);

  const m = manifest.data;
  function nameOf(w?: Address): string | undefined {
    if (!m || !w) return undefined;
    for (const al of m.allocations) if (isAddressEqual(al.wallet, w) || isAddressEqual(al.vesting, w)) return subName(al.label, label);
    if (isAddressEqual(m.mm.wallet, w)) return subName("mm", label);
    if (isAddressEqual(m.agent, w)) return subName("agent", label);
    if (isAddressEqual(m.issuer, w)) return `issuer of ${label}`;
    return undefined;
  }

  return {
    id,
    label,
    status,
    manifest: m,
    token,
    name,
    symbol: symbol ?? label.toUpperCase(),
    decimals,
    checks: st,
    checksLoaded: !!checks.data,
    verified,
    a,
    p,
    h,
    opened,
    nameOf,
  };
}

export type LaunchData = ReturnType<typeof useLaunchData>;
