import Link from "next/link";
import { addresses } from "@/lib/addresses";
import { PlainsightMark } from "./PlainsightMark";

const etherscan = (a: string) => `https://sepolia.etherscan.io/address/${a}`;

const COLUMNS: { title: string; links: { text: string; href: string; external?: boolean }[] }[] = [
  {
    title: "Product",
    links: [
      { text: "Launches", href: "/" },
      { text: "Create a launch", href: "/create" },
      { text: "Feed API", href: "/api/launches", external: true },
    ],
  },
  {
    title: "Contracts",
    links: [
      { text: "Launcher", href: etherscan(addresses.launcher), external: true },
      { text: "Greenshoe vault", href: etherscan(addresses.greenshoeVault), external: true },
      { text: "Pool hook", href: etherscan(addresses.plainsightHook), external: true },
    ],
  },
];

export function Footer() {
  return (
    <footer className="mt-16 border-t border-edge bg-white">
      <div className="mx-auto grid max-w-[1200px] gap-10 px-4 py-12 sm:px-8 md:grid-cols-[2fr_1fr_1fr]">
        <div className="flex flex-col gap-4">
          <span className="flex items-center gap-2.5 text-ink">
            <PlainsightMark className="h-5 w-5" />
            <span className="text-[17px] font-semibold tracking-[-0.03em]">Plainsight</span>
          </span>
          <p className="m-0 max-w-[300px] text-[13px] leading-relaxed text-muted">
            Plainsight runs token launches under disclosed rules: insiders named on-chain, one auction price, 30 days of price support, and volume that is checked, not claimed.
          </p>
        </div>
        {COLUMNS.map((c) => (
          <nav key={c.title} aria-label={c.title} className="flex flex-col gap-3">
            <p className="kicker m-0">{c.title}</p>
            {c.links.map((l) =>
              l.external ? (
                <a key={l.text} href={l.href} target="_blank" rel="noreferrer" className="text-[14px] text-ink no-underline hover:text-accent">
                  {l.text}
                </a>
              ) : (
                <Link key={l.text} href={l.href} className="text-[14px] text-ink no-underline hover:text-accent">
                  {l.text}
                </Link>
              ),
            )}
          </nav>
        ))}
      </div>
      <div className="border-t border-edge">
        <div className="mx-auto flex max-w-[1200px] flex-col gap-2 px-4 py-5 text-[12px] text-muted sm:flex-row sm:items-center sm:justify-between sm:px-8">
          <span>© {new Date().getFullYear()} Plainsight. Ethereum Sepolia testnet: tokens and USDC here have no value.</span>
        </div>
      </div>
    </footer>
  );
}
