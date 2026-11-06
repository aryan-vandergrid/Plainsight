# Plainsight

**A token launchpad with the rules of a stock-market IPO.**

Plainsight puts the protections of a regulated offering on-chain, so that launches are fair by construction instead of by promise:

- **Disclosure first.** The issuer publishes who holds what, and when it unlocks, before anything trades.
- **One fair price.** Tokens are sold through a continuous clearing auction. Every bidder in a block pays the same clearing price.
- **A price floor.** A reserve of the raise supports the price with a buy wall for 30 days.
- **Honest volume.** Fake trading is detected at the pool, counted separately from real volume, and charged.

Network: **Ethereum Sepolia** (chainId `11155111`). Built for **ETHGlobal Mumbai 2026**.

---

## How a launch works

```
Issuer posts disclosure ──► ENS names every insider wallet ──► 8 on-chain checks
        │                                                             │
        └───────────── Uniswap CCA auction ◄──────────────────────────┘
                              │
                              ▼
              Uniswap v4 pool + PlainsightHook ──► Chainlink CRE flags what the hook cannot see
```

1. **Post.** The issuer submits a disclosure (allocations, vesting, market maker, agent, treasury, greenshoe) to `ManifestRegistry`. `Launcher` registers ENS names and writes records in the same transaction, and locks insider tokens in vesting wallets.
2. **Verify.** Eight on-chain checks compare the live state against the disclosure (ENS records, vesting amounts, roles, and the auction's CREATE2 address).
3. **Auction.** A Uniswap CCA sells the planned tokens plus a 15% greenshoe, priced in USDC. If the minimum raise is not met, bidders are refunded.
4. **Pool.** `GreenshoeVault` opens a Uniswap v4 pool at the auction's final price, with `PlainsightHook` attached, and places the reserve as a 10-position buy wall.
5. **Surveillance.** A Chainlink CRE workflow reads flow data on a schedule and writes flags and periodic reports to `FlagRegistry`, which the hook reads.
6. **Settle.** After 30 days the wall is removed, bought-back tokens are burned and leftover USDC returns to the issuer.

---

## Partner integrations

### Uniswap

| Piece | Use |
|---|---|
| **Continuous Clearing Auction v2.1.0** | `AuctionDeployer` creates each auction through the official factory. `GreenshoeVault` is the funds and token recipient. Bidding goes through Permit2. Check 7 recomputes the auction's CREATE2 address. |
| **Uniswap v4 hook** | `PlainsightHook` is mined to carry exactly its permission bits (check 8). |
| **Universal Router, Quoter, StateView** | The trade page swaps through the Universal Router. Quotes use the v4 Quoter and pool price uses StateView. |

What the hook does:

| Callback | Behaviour |
|---|---|
| `beforeInitialize` | Only the launch vault can create a pool with this hook. |
| `beforeRemoveLiquidity` | The vault's wall is locked for 30 days. Every other LP can always withdraw. |
| `beforeSwap` | Dynamic fee: 0.3% normally, 3% when an insider or flagged wallet sells inside the window. Blocks swaps during a halt. |
| `afterSwap` (return delta) | Counts fake volume: `matched = min(bought, sold)` within one transaction. A 1% penalty on the matched amount goes to the treasury. Uses transient storage. |
| `after{Add,Remove}Liquidity` | Detects phantom swaps undone by a liquidity change in the same transaction. |

The hook calls the router's `msgSender()` to identify the real trader. When a router does not expose it, the router itself is treated as the trader. A halt can only be raised by the launch's named agent, for at most 24 hours, with a public reason code. Liquidity providers can always withdraw.

### ENS (ENSv2)

ENS turns the disclosure into names a person can read (`team.abc.plainsight.eth` instead of `0x466d…`), and the contracts check that names and records still match the disclosure.

- `plainsight.eth` is registered through the ENSv2 ETHRegistrar, with its own `PlainsightRegistry` (a `UserRegistry` proxy created by the VerifiableFactory) and one shared `PermissionedResolver`.
- For every launch, `Launcher` creates `<label>.plainsight.eth` and one subname per allocation (`team`, `investors`, `advisors`, custom labels), plus `mm` and `agent`.
- Each subname gets an address record (the disclosed wallet) and text records (for example `amount`, `vesting`, `insider`, `manifest`, `greenshoe`, `treasury`).
- Issuers cannot change names or records after posting. The admin role is renounced so `Launcher` is the only writer.

Code: `contracts/src/ens/`, `contracts/script/SetupEns.s.sol`.

### Chainlink (CRE)

`cre/surveillance` is a Chainlink Runtime Environment workflow that runs on a cron schedule:

- reads the flow-tracking data (`/api/flowtrack/<label>`) and on-chain hook and vault state;
- writes **flag** reports (wallets with a reason hash) and periodic **reports** (days 1, 7, 30) through `writeReport` to `FlagRegistry`;
- `FlagRegistry` implements the CRE receiver interface and only accepts reports from the CRE forwarder. `PlainsightHook` reads it to apply the insider fee to flagged wallets.

Code: `cre/surveillance/main.ts`, `contracts/src/FlagRegistry.sol`.

---

## Where to verify each integration

**Uniswap**

| What | Code |
|---|---|
| CCA created through the official factory | [`AuctionDeployer.sol#L56`](contracts/src/AuctionDeployer.sol#L56) (`deploy`) |
| CCA address recomputed (check 7) | [`AuctionDeployer.sol#L68`](contracts/src/AuctionDeployer.sol#L68), [`Launcher.sol#L139`](contracts/src/Launcher.sol#L139) |
| Hook permission bits | [`PlainsightHook.sol#L92`](contracts/src/PlainsightHook.sol#L92) (`getHookPermissions`) |
| Pool creation restricted to the vault | [`PlainsightHook.sol#L195`](contracts/src/PlainsightHook.sol#L195) (`_beforeInitialize`) |
| Dynamic fee, halts | [`PlainsightHook.sol#L247`](contracts/src/PlainsightHook.sol#L247) (`_beforeSwap`) |
| Fake-volume accounting and penalty | [`PlainsightHook.sol#L259`](contracts/src/PlainsightHook.sol#L259) (`_afterSwap`) |
| Phantom-swap detection | [`PlainsightHook.sol#L210`](contracts/src/PlainsightHook.sol#L210), [`#L235`](contracts/src/PlainsightHook.sol#L235) |
| Locked buy-wall liquidity | [`PlainsightHook.sol#L222`](contracts/src/PlainsightHook.sol#L222) (`_beforeRemoveLiquidity`) |
| Trader identity via `msgSender()` | [`PlainsightHook.sol#L397`](contracts/src/PlainsightHook.sol#L397) |
| Pool opened, buy wall placed, settle | [`GreenshoeVault.sol#L249`](contracts/src/GreenshoeVault.sol#L249), [`#L272`](contracts/src/GreenshoeVault.sol#L272), [`#L188`](contracts/src/GreenshoeVault.sol#L188) |
| Universal Router swaps in the app | [`TradePage.tsx`](web/components/launch/TradePage.tsx), [`trade.ts`](web/lib/trade.ts) |
| Bids through Permit2 | [`BidBox.tsx`](web/components/launch/BidBox.tsx) |

**ENS (ENSv2)**

| What | Code |
|---|---|
| `plainsight.eth` registered, registry and resolver wired | [`SetupEns.s.sol`](contracts/script/SetupEns.s.sol) |
| Role constants (registrar, renew, set address, set text) | [`PlainsightEnsRoles.sol`](contracts/src/ens/PlainsightEnsRoles.sol) |
| Per-launch name tree created | [`PlainsightEnsWriter.sol#L47`](contracts/src/ens/PlainsightEnsWriter.sol#L47) (`_createNames`) |
| Address and text records written | [`PlainsightEnsWriter.sol#L69`](contracts/src/ens/PlainsightEnsWriter.sol#L69), [`Launcher.sol#L80`](contracts/src/Launcher.sol#L80) |
| Records re-read and compared to the disclosure | [`Launcher.sol#L154`](contracts/src/Launcher.sol#L154) (`_recordsMatch`) |
| Issuer holds no roles on names | [`PlainsightEnsWriter.sol#L113`](contracts/src/ens/PlainsightEnsWriter.sol#L113) |
| Record layout | [`ManifestRecords.sol`](contracts/src/libraries/ManifestRecords.sol) |
| Tests | [`Launcher.t.sol`](contracts/test/unit/Launcher.t.sol) |

**Chainlink (CRE)**

| What | Code |
|---|---|
| Workflow (cron, HTTP fetch, chain reads, `writeReport`) | [`cre/surveillance/main.ts`](cre/surveillance/main.ts) |
| Report receiver and flag storage | [`FlagRegistry.sol#L46`](contracts/src/FlagRegistry.sol#L46) (`onReport`) |
| Flags applied by the hook | [`PlainsightHook.sol`](contracts/src/PlainsightHook.sol) (`flags.isFlagged`) |
| Tests | [`Flags.t.sol`](contracts/test/unit/Flags.t.sol) |

Uniswap integration feedback: [FEEDBACK.md](FEEDBACK.md).

---

## Repository layout

```
contracts/   Solidity (Foundry): src, script (deploy + demo), test (unit + fork)
cre/         Chainlink CRE workflow (TypeScript)
web/         Next.js app: create, explore, auction, trade, agent console
docs/        Deployment addresses
```

Deployed addresses: [docs/DEPLOYMENTS.md](docs/DEPLOYMENTS.md).

---

## Run it locally

Prerequisites: [Foundry](https://book.getfoundry.sh/), Node 20+, pnpm, [Bun](https://bun.sh) (for `cre/`).

**Contracts**

```bash
git submodule update --init --recursive
cd contracts
forge build
forge test --no-match-path 'test/fork/*'                    # unit tests
forge test --match-path 'test/fork/*' --fork-url $SEPOLIA_RPC_URL   # Sepolia fork tests
```

Copy `contracts/.env.example` to `contracts/.env` for deployment keys. Never commit it.

**Web app**

```bash
cd web
cp .env.example .env.local     # set NEXT_PUBLIC_SEPOLIA_RPC_URL to your own RPC
pnpm install
pnpm dev
```

Contract addresses are read from `web/lib/addresses.json`. ABIs are generated from compiled contracts with `pnpm abis`.

**Chainlink workflow**

```bash
cd cre/surveillance && bun install
```

Set `CRE_ETH_PRIVATE_KEY` and `SEPOLIA_RPC_URL` in `cre/.env`, then simulate with the CRE CLI. `flowTrackUrl` in `config.*.json` must point to a URL the workflow can reach.

---

## Testing

- 69 unit tests cover the registry, launcher checks and ENS records, the auction, pool and hook protections (fake volume, insider fee, halts, phantom swaps), and flags.
- 4 fork tests run against Sepolia: CCA payout and vault sweep, and the hook through the Universal Router (insider sell, wash bot, halt).

---

## Security notes

This is hackathon software and has **not been audited**. It runs on a testnet with test USDC. The demo ENS admin roles are held by the deployer until `renounceAdmin` is called. Do not use it with real funds.

---

## Hackathon scope and third-party code

All Plainsight code in this repository was written during ETHGlobal Mumbai 2026. Third-party code is used as libraries and is not copied into the source:

- Uniswap `continuous-clearing-auction` and v4 core/periphery (git submodule)
- ENS `contracts-v2` and OpenZeppelin (git submodule)
- Foundry `forge-std` (git submodule)
- Chainlink CRE SDK, Next.js, wagmi, viem, TanStack Query, Tailwind CSS (package dependencies)

---

## Use of AI tools

AI coding assistants, including Claude Code, were used during development. They assisted with writing and refactoring code across the smart contracts, Foundry tests and scripts, the Chainlink CRE workflow, the web app, and the documentation, and with organizing the repository for submission. Product design, architecture, and the decisions on protocol rules were made by the team, and AI output was reviewed before being committed.

---

## License

MIT. See [LICENSE](LICENSE).
