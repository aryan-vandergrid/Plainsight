# Plainsight

**A token launchpad with the rules of a stock-market IPO.**

Plainsight puts the protections of a regulated offering on-chain, so that launches are fair by construction instead of by promise:

- **Disclosure first.** The issuer publishes who holds what, and when it unlocks, before anything trades.
- **One fair price.** Tokens are sold through a continuous clearing auction. Every bidder in a block pays the same clearing price.
- **A price floor.** A reserve of the raise supports the price with a buy wall for 30 days.
- **Honest volume.** Fake trading is detected at the pool, counted separately from real volume, and charged.

Network: **Ethereum Sepolia** (chainId `11155111`). Built for **ETHGlobal Mumbai 2026**.

| | |
|---|---|
| **Live app** | https://plainsight-two.vercel.app |
| **Partner integrations** | Uniswap (CCA, v4 hook), ENS (ENSv2), Chainlink (CRE) |
| **Integration references** | [Where to verify each integration](#where-to-verify-each-integration) · [FEEDBACK.md](FEEDBACK.md) |
| **Deployed contracts** | [Deployed contracts](#deployed-contracts-sepolia) |

**Contents:** [How a launch works](#how-a-launch-works) · [Deployed contracts](#deployed-contracts-sepolia) · [Partner integrations](#partner-integrations) · [Verify each integration](#where-to-verify-each-integration) · [Repository layout](#repository-layout) · [Run it locally](#run-it-locally) · [Testing](#testing) · [Security](#security-notes) · [AI tools](#use-of-ai-tools)

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

## Deployed contracts (Sepolia)

Network: Ethereum Sepolia, chainId `11155111` · Deploy block: `12076365` · ENS parent name: `plainsight.eth`

### Plainsight protocol

| Contract | Role | Address |
|---|---|---|
| `Launcher` | Posts disclosures, runs the 8 checks, launches | [`0x0ebc395B33c02A339f440E3a087619FB1C1e172e`](https://sepolia.etherscan.io/address/0x0ebc395B33c02A339f440E3a087619FB1C1e172e) |
| `ManifestRegistry` | Stores the disclosure | [`0xA127930a4EEB41A72efacffc9358f08246e45CED`](https://sepolia.etherscan.io/address/0xA127930a4EEB41A72efacffc9358f08246e45CED) |
| `AuctionDeployer` | Creates the Uniswap CCA for each launch | [`0x06138F5139E7c39e62fDe86bC7503E8Cf61A11F9`](https://sepolia.etherscan.io/address/0x06138F5139E7c39e62fDe86bC7503E8Cf61A11F9) |
| `GreenshoeVault` | Opens the pool, runs the buy wall, settles | [`0xd41a3A2Bb41da6235BeE70fBa67798677860E8f0`](https://sepolia.etherscan.io/address/0xd41a3A2Bb41da6235BeE70fBa67798677860E8f0) |
| `PlainsightHook` | Uniswap v4 hook | [`0xEC28b1369B53428A962a4b0a6025798Cce43AfC4`](https://sepolia.etherscan.io/address/0xEC28b1369B53428A962a4b0a6025798Cce43AfC4) |
| `FlagRegistry` | Chainlink CRE receiver, wallet flags and reports | [`0xe5c58941133124139fe38Fc294Df06e292a650A2`](https://sepolia.etherscan.io/address/0xe5c58941133124139fe38Fc294Df06e292a650A2) |
| `VestingWalletFactory` | Locks insider tokens | [`0xe700131948FF9d05e19834bf89eF77162d0Bb4E1`](https://sepolia.etherscan.io/address/0xe700131948FF9d05e19834bf89eF77162d0Bb4E1) |
| `TestUSDC` | Test stablecoin used for bidding and trading | [`0x1349A770Cc193840d83ceE2FF4db8F52e2703b88`](https://sepolia.etherscan.io/address/0x1349A770Cc193840d83ceE2FF4db8F52e2703b88) |
| Demo token `ABC` | Example launch | [`0x3D99Be8a04d9D565936fAa44Ba78537eFB0Ac69e`](https://sepolia.etherscan.io/address/0x3D99Be8a04d9D565936fAa44Ba78537eFB0Ac69e) |
| Demo token `XYZ` | Example launch | [`0x8368ceb29e95e030eF9224ED450c6Bf47131578B`](https://sepolia.etherscan.io/address/0x8368ceb29e95e030eF9224ED450c6Bf47131578B) |

### Uniswap

| Contract | Address |
|---|---|
| CCA Factory v2.1.0 | [`0x000000001F26a0044BaA66024e7b6599c61963F8`](https://sepolia.etherscan.io/address/0x000000001F26a0044BaA66024e7b6599c61963F8) |
| CCALens | [`0xc3C65F5453A3674aDb693cbdA3C842545cD30f53`](https://sepolia.etherscan.io/address/0xc3C65F5453A3674aDb693cbdA3C842545cD30f53) |
| Permit2 | [`0x000000000022D473030F116dDEE9F6B43aC78BA3`](https://sepolia.etherscan.io/address/0x000000000022D473030F116dDEE9F6B43aC78BA3) |
| v4 PoolManager | [`0xE03A1074c86CFeDd5C142C4F04F1a1536e203543`](https://sepolia.etherscan.io/address/0xE03A1074c86CFeDd5C142C4F04F1a1536e203543) |
| StateView | [`0xE1Dd9c3fA50EDB962E442f60DfBc432e24537E4C`](https://sepolia.etherscan.io/address/0xE1Dd9c3fA50EDB962E442f60DfBc432e24537E4C) |
| Universal Router | [`0x3A9D48AB9751398BbFa63ad67599Bb04e4BdF98b`](https://sepolia.etherscan.io/address/0x3A9D48AB9751398BbFa63ad67599Bb04e4BdF98b) |
| v4 Quoter | [`0x61B3f2011A92d183C7dbaDBdA940a7555Ccf9227`](https://sepolia.etherscan.io/address/0x61B3f2011A92d183C7dbaDBdA940a7555Ccf9227) |
| PoolSwapTest | [`0x9B6b46e2c869aa39918Db7f52f5557FE577B6eEe`](https://sepolia.etherscan.io/address/0x9B6b46e2c869aa39918Db7f52f5557FE577B6eEe) |
| PoolModifyLiquidityTest | [`0x0C478023803a644c94c4CE1C1e7b9A087e411B0A`](https://sepolia.etherscan.io/address/0x0C478023803a644c94c4CE1C1e7b9A087e411B0A) |

### ENS (ENSv2)

| Contract | Address |
|---|---|
| `PlainsightRegistry` (subregistry of `plainsight.eth`) | [`0x1581E3106Db36C9aB34af1A2E80070f672b2cdc5`](https://sepolia.etherscan.io/address/0x1581E3106Db36C9aB34af1A2E80070f672b2cdc5) |
| `PermissionedResolver` | [`0x4Df4D55743f3932A9Acf3ae550b4f4dDdA3dBEC3`](https://sepolia.etherscan.io/address/0x4Df4D55743f3932A9Acf3ae550b4f4dDdA3dBEC3) |
| Universal Resolver | [`0xeEeEEEeE14D718C2B47D9923Deab1335E144EeEe`](https://sepolia.etherscan.io/address/0xeEeEEEeE14D718C2B47D9923Deab1335E144EeEe) |
| ETHRegistry | [`0xD4eBcbBdF463C9c45784603Db0dDD499BC44A8B4`](https://sepolia.etherscan.io/address/0xD4eBcbBdF463C9c45784603Db0dDD499BC44A8B4) |
| VerifiableFactory | [`0xDa70306C98E97eCe36F997a21368e53298572991`](https://sepolia.etherscan.io/address/0xDa70306C98E97eCe36F997a21368e53298572991) |

### Chainlink CRE evidence

A broadcast simulation of the surveillance workflow published an on-chain report to `FlagRegistry`: [`0x61a8f742…8ff0`](https://sepolia.etherscan.io/tx/0x61a8f7424d7cdaaa8563f6378aa46891224ead459cf3ede37119a7528a158ff0) (block 12078646, status success).

The same addresses are kept in [`docs/DEPLOYMENTS.md`](docs/DEPLOYMENTS.md), `web/lib/addresses.json` and `contracts/addresses.json`.

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
cd contracts && mkdir -p lib && cd lib
git clone https://github.com/foundry-rs/forge-std && git -C forge-std checkout v1.11.0
git clone https://github.com/ensdomains/contracts-v2 && git -C contracts-v2 checkout 07e55a056f5b6a9c90119f501bdd05714e67dddd && git -C contracts-v2 submodule update --init --recursive
git clone --recurse-submodules https://github.com/Uniswap/continuous-clearing-auction && git -C continuous-clearing-auction checkout ce78b4d94cdf94fd41f20afb6f6e495b8b83a234 && git -C continuous-clearing-auction submodule update --init --recursive
cd ..
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
