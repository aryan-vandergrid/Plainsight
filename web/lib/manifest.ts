import { isAddress, keccak256, parseUnits, toBytes, type Address, type Hex } from "viem";

export const PRESETS = [
  { group: "Team", value: "team", name: "Team & founders", insider: true },
  { group: "Team", value: "advisors", name: "Advisors", insider: true },
  { group: "Investors", value: "investors", name: "Investors", insider: true },
  { group: "Investors", value: "seed", name: "Seed round", insider: true },
  { group: "Investors", value: "private-sale", name: "Private sale", insider: true },
  { group: "Investors", value: "strategic", name: "Strategic round", insider: true },
  { group: "Investors", value: "kol", name: "KOL round", insider: true },
  { group: "Project", value: "treasury", name: "Treasury", insider: true },
  { group: "Project", value: "foundation", name: "Foundation", insider: true },
  { group: "Project", value: "ecosystem", name: "Ecosystem & grants", insider: true },
  { group: "Project", value: "marketing", name: "Marketing & partnerships", insider: true },
  { group: "Project", value: "reserve", name: "Reserve", insider: true },
  { group: "Project", value: "liquidity", name: "Liquidity & exchanges", insider: true },
  { group: "Community", value: "community", name: "Community & airdrop", insider: false },
  { group: "Community", value: "staking", name: "Staking rewards", insider: false },
  { group: "Community", value: "incentives", name: "Incentives & rewards", insider: false },
] as const;
export const PRESET_GROUPS = ["Team", "Investors", "Project", "Community"] as const;
export const CUSTOM = "custom";
export const RESERVED_LABELS = ["mm", "agent"];
export const MAX_ALLOCATIONS = 12;

export const presetName = (label: string) => PRESETS.find((p) => p.value === label)?.name;

export function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 63)
    .replace(/-+$/g, "");
}

export type AllocRow = {
  key: string;
  preset: string;
  customName: string;
  insider: boolean;
  wallet: string;
  amount: string;
  unlockDate: string;
  vestingDays: string;
};

export type CreateForm = {
  tokenSource: "new" | "existing";
  newToken: { name: string; symbol: string; supply: string };
  token: string;
  name: string;
  symbol: string;
  label: string;
  allocations: AllocRow[];
  mm: { wallet: string; loan: string; strike: string; kpis: string };
  agent: string;
  agentOperator: string;
  greenshoePct: string;
  windowDays: string;
  rangePct: string;
  insiderFeePct: string;
  minRaiseUsdc: string;
};

export const PARENT = "plainsight.eth";
export const fullName = (label: string) => `${label || "…"}.${PARENT}`;
export const subName = (sub: string, label: string) => `${sub}.${fullName(label)}`;
export const manifestId = (label: string): Hex => keccak256(toBytes(label));

let rowSeq = 0;
export function newRow(preset = ""): AllocRow {
  const d = new Date();
  d.setFullYear(d.getFullYear() + 1);
  const p = PRESETS.find((x) => x.value === preset);
  return { key: `r${++rowSeq}`, preset, customName: "", insider: p?.insider ?? true, wallet: "", amount: "", unlockDate: d.toISOString().slice(0, 10), vestingDays: "0" };
}

export const rowLabel = (r: AllocRow) => (r.preset === CUSTOM ? slugify(r.customName) : r.preset);
export const rowName = (r: AllocRow) => (r.preset === CUSTOM ? r.customName.trim() || "Custom" : presetName(r.preset) ?? r.preset);

export function emptyForm(token: string): CreateForm {
  const team = newRow("team");
  team.amount = "200000";
  const inv = newRow("investors");
  inv.amount = "100000";
  const half = new Date();
  half.setMonth(half.getMonth() + 6);
  inv.unlockDate = half.toISOString().slice(0, 10);
  return {
    tokenSource: token ? "existing" : "new",
    newToken: { name: "", symbol: "", supply: "1000000" },
    token,
    name: "",
    symbol: "",
    label: "",
    allocations: [team, inv],
    mm: { wallet: "", loan: "50000", strike: "1.2", kpis: "2% depth within 1%, 99% uptime" },
    agent: "",
    agentOperator: "",
    greenshoePct: "15",
    windowDays: "30",
    rangePct: "10",
    insiderFeePct: "3",
    minRaiseUsdc: "800000",
  };
}

const LABEL_RE = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
const num = (s: string) => s.trim() !== "" && Number.isFinite(Number(s)) && Number(s) >= 0;

export type Errors = Record<string, string>;

export function validateToken(f: CreateForm): Errors {
  const e: Errors = {};
  if (!isAddress(f.token)) e.token = f.tokenSource === "new" ? "Deploy your token first." : "Enter the token contract address.";
  else if (!f.name.trim() || !f.symbol.trim()) e.token = "Couldn't read this token. Check it is an ERC-20 on Sepolia.";
  if (!LABEL_RE.test(f.label)) e.label = "Lowercase letters, digits and '-' only (1–63 characters).";
  return e;
}

export function duplicateLabels(rows: AllocRow[]): Set<string> {
  const seen = new Set<string>();
  const dup = new Set<string>();
  for (const r of rows) {
    const l = rowLabel(r);
    if (!l) continue;
    if (seen.has(l)) dup.add(l);
    seen.add(l);
  }
  return dup;
}

export function validateAllocations(f: CreateForm): Errors {
  const e: Errors = {};
  const dup = duplicateLabels(f.allocations);
  f.allocations.forEach((r) => {
    const l = rowLabel(r);
    if (!r.preset) e[`${r.key}.preset`] = "Pick a category.";
    else if (r.preset === CUSTOM && !l) e[`${r.key}.customName`] = "Name your allocation (letters or digits).";
    else if (!LABEL_RE.test(l)) e[`${r.key}.customName`] = "Use letters, digits and '-' (max 63).";
    else if (RESERVED_LABELS.includes(l)) e[`${r.key}.customName`] = `"${l}" is reserved for the ${l === "mm" ? "market maker" : "agent"}.`;
    else if (dup.has(l)) e[`${r.key}.${r.preset === CUSTOM ? "customName" : "preset"}`] = "Each allocation needs its own category.";
    if (!isAddress(r.wallet)) e[`${r.key}.wallet`] = "Enter a valid wallet address.";
    if (!num(r.amount) || Number(r.amount) <= 0) e[`${r.key}.amount`] = "Amount must be above 0.";
    if (!r.unlockDate) e[`${r.key}.unlockDate`] = "Unlock date required.";
    if (!num(r.vestingDays)) e[`${r.key}.vestingDays`] = "Days, 0 for a cliff.";
  });
  if (f.allocations.length === 0) e.allocations = "Add at least one allocation.";
  if (f.allocations.length > MAX_ALLOCATIONS) e.allocations = `At most ${MAX_ALLOCATIONS} allocations.`;
  return e;
}

export function validateGreenshoe(f: CreateForm): Errors {
  const e: Errors = {};
  if (!isAddress(f.mm.wallet)) e["mm.wallet"] = "Enter the market maker's wallet.";
  if (!num(f.mm.loan)) e["mm.loan"] = "Loan size in tokens.";
  if (!num(f.mm.strike)) e["mm.strike"] = "Strike in USDC.";
  if (!isAddress(f.agent)) e.agent = "Enter the agent's wallet.";
  if (!f.agentOperator.trim()) e.agentOperator = "Name who runs the agent.";
  for (const k of ["greenshoePct", "windowDays", "rangePct", "insiderFeePct", "minRaiseUsdc"] as const) {
    if (!num(f[k])) e[k] = "Number required.";
  }
  return e;
}

export function unlockTs(date: string): bigint {
  return BigInt(Math.floor(new Date(`${date}T00:00:00Z`).getTime() / 1000));
}

const bps = (pct: string) => Math.round(Number(pct) * 100);

export function manifestJson(f: CreateForm): string {
  return JSON.stringify({
    name: f.name,
    symbol: f.symbol,
    ens: fullName(f.label),
    token: f.token,
    allocations: f.allocations.map((r) => ({ label: rowLabel(r), name: rowName(r), insider: r.insider, wallet: r.wallet, amount: r.amount, unlockDate: r.unlockDate, vestingDays: Number(r.vestingDays) })),
    mm: f.mm,
    agent: f.agent,
    agentOperator: f.agentOperator.trim(),
    greenshoeBps: bps(f.greenshoePct),
    windowSecs: Number(f.windowDays) * 86400,
    rangeDepthBps: bps(f.rangePct),
    insiderFeeBps: bps(f.insiderFeePct),
    minRaiseUsdc: f.minRaiseUsdc,
  });
}

function base64(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let bin = "";
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin);
}

export function toManifestArgs(f: CreateForm, issuer: Address, decimals: number) {
  const json = manifestJson(f);
  return {
    token: f.token as Address,
    ensLabel: f.label,
    issuer,
    allocations: f.allocations.map((r) => ({
      label: rowLabel(r),
      insider: r.insider,
      wallet: r.wallet as Address,
      amount: parseUnits(r.amount, decimals),
      vesting: "0x0000000000000000000000000000000000000000" as Address,
      unlockDate: unlockTs(r.unlockDate),
      vestingDuration: BigInt(Math.round(Number(r.vestingDays) * 86400)),
    })),
    mm: {
      wallet: f.mm.wallet as Address,
      loanAmount: parseUnits(f.mm.loan || "0", decimals),
      strikeUsdc: parseUnits(f.mm.strike || "0", 6),
      kpis: f.mm.kpis,
    },
    agent: f.agent as Address,
    agentOperator: f.agentOperator.trim(),
    greenshoeBps: bps(f.greenshoePct),
    windowSecs: Number(f.windowDays) * 86400,
    rangeDepthBps: bps(f.rangePct),
    treasury: "0x0000000000000000000000000000000000000000" as Address,
    insiderFeeBps: bps(f.insiderFeePct),
    minRaise: parseUnits(f.minRaiseUsdc || "0", 6),
    manifestHash: keccak256(toBytes(json)),
    jsonURI: `data:application/json;base64,${base64(json)}`,
  };
}

export function totalLocked(f: CreateForm, decimals: number): bigint {
  return f.allocations.reduce((s, r) => s + (num(r.amount) ? parseUnits(r.amount, decimals) : 0n), 0n);
}
