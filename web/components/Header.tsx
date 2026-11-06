"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAccount, useConnect, useDisconnect, useSwitchChain } from "wagmi";
import { sepolia } from "wagmi/chains";
import { shortAddr } from "@/lib/format";
import { PlainsightMark } from "./PlainsightMark";

export function Header() {
  const path = usePathname();
  return (
    <header className="sticky top-0 z-40 border-b border-edge bg-white/90 backdrop-blur supports-[backdrop-filter]:bg-white/80">
      <div className="mx-auto flex h-16 max-w-[1200px] items-center justify-between gap-4 px-4 sm:px-8">
        <div className="flex min-w-0 items-center gap-8">
          <Link href="/" className="flex items-center gap-2.5 text-ink no-underline" aria-label="Plainsight, home">
            <PlainsightMark className="h-[22px] w-[22px]" />
            <span className="text-[19px] font-semibold tracking-[-0.03em]">Plainsight</span>
          </Link>
          <nav aria-label="Main" className="hidden items-center gap-6 md:flex">
            <NavLink href="/" on={path === "/"}>
              Launches
            </NavLink>
            <NavLink href="/create" on={!!path?.startsWith("/create")}>
              Create a launch
            </NavLink>
          </nav>
        </div>
        <div className="flex items-center gap-4">
          <span className="kicker hidden items-center gap-2 border border-edge px-2 py-1 sm:inline-flex">Sepolia</span>
          <WalletButton />
        </div>
      </div>
    </header>
  );
}

function NavLink({ href, on, children }: { href: string; on: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      aria-current={on ? "page" : undefined}
      className={`relative inline-flex h-16 items-center text-[14px] no-underline transition-colors ${on ? "text-ink after:absolute after:inset-x-0 after:bottom-[-1px] after:h-px after:bg-ink" : "text-muted hover:text-ink"}`}
    >
      {children}
    </Link>
  );
}

export function WalletButton({ light = false }: { light?: boolean }) {
  const { address, isConnected, chainId } = useAccount();
  const { connect, connectors, isPending } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChain } = useSwitchChain();
  const base = light ? "btn btn-primary" : "btn btn-dark min-h-10 px-4 text-[13px]";

  if (!isConnected) {
    const connector = connectors.find((c) => c.id === "io.metamask") ?? connectors[0];
    return (
      <button
        type="button"
        className={base}
        disabled={isPending || !connector}
        onClick={() => connect({ connector })}
      >
        {isPending ? "Connecting…" : "Connect wallet"}
      </button>
    );
  }
  if (chainId !== sepolia.id) {
    return (
      <button type="button" className={`btn border-negative bg-negative text-white hover:border-negative ${light ? "" : "min-h-10 px-4 text-[13px]"}`} onClick={() => switchChain({ chainId: sepolia.id })}>
        Switch to Sepolia
      </button>
    );
  }
  if (light) return null;
  return (
    <button type="button" className={light ? base : "btn min-h-10 px-3 font-mono text-[12px]"} onClick={() => disconnect()} title="Disconnect">
      {shortAddr(address)}
    </button>
  );
}
