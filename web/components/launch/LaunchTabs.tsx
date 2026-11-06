import Link from "next/link";

const TABS = [
  { key: "overview", text: "Overview", href: "" },
  { key: "trade", text: "Trade", href: "/trade" },
  { key: "agent", text: "Agent console", href: "/agent" },
] as const;

export function LaunchTabs({ label, active }: { label: string; active: (typeof TABS)[number]["key"] }) {
  return (
    <nav aria-label="Launch sections" className="-mb-1 flex gap-1 overflow-x-auto border-b border-edge">
      {TABS.map((t) => (
        <Link
          key={t.key}
          href={`/launch/${label}${t.href}`}
          aria-current={t.key === active ? "page" : undefined}
          className={`-mb-px mr-7 inline-flex min-h-11 items-center border-b-2 px-0 text-[14px] whitespace-nowrap no-underline ${t.key === active ? "border-ink text-ink" : "border-transparent text-muted hover:text-ink"}`}
        >
          {t.text}
        </Link>
      ))}
    </nav>
  );
}
