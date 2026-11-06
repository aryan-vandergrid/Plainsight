export const CHECKS = [
  { title: "Manifest posted on-chain", blocked: "No manifest posted", fail: "No manifest is stored for this name." },
  { title: "Every insider has an ENS name", blocked: "Missing ENS names", fail: "Some allocations have no ENS name." },
  { title: "ENS records match the manifest", blocked: "ENS doesn't match the manifest", fail: "An ENS record differs from the manifest. The name is highlighted below." },
  { title: "Names are locked", blocked: "ENS names aren't locked", fail: "The issuer can still change an ENS name or record." },
  { title: "Insider tokens are vesting", blocked: "Insider tokens aren't vesting", fail: "A vesting contract holds less than the declared amount." },
  { title: "Stabilisation agent is independent", blocked: "Agent isn't independent", fail: "The agent wallet is the issuer's wallet." },
  { title: "Auction follows the rules", blocked: "Auction rules aren't met", fail: "The minimum raise or extra supply is missing, or the live auction differs from the disclosed terms." },
  { title: "Pool hook is in place", blocked: "Pool hook isn't ready", fail: "The price-support hook isn't wired to the vault, or its address doesn't carry its permissions." },
] as const;

export const CheckStatus = { Failed: 0, Passed: 1, NotConfigured: 2 } as const;
