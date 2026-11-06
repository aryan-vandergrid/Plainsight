# Plainsight surveillance workflow (Chainlink CRE)

A [Chainlink Runtime Environment](https://docs.chain.link/cre) workflow that connects the Plainsight contracts on Sepolia to an off-chain data source.

## What it does

On a cron schedule (`config.*.json` → `schedule`) the workflow:

1. **Fetches** flow-tracking findings from the web app: `GET <flowTrackUrl>` (`/api/flowtrack/<label>`), with consensus across nodes.
2. **Reads** the hook, vault and registry state on Sepolia.
3. **Writes** signed reports to [`FlagRegistry`](../contracts/src/FlagRegistry.sol) through `writeReport`:
   - `KIND_FLAG`: wallets that wash-trade or dump, with a reason hash.
   - `KIND_REPORT`: periodic surveillance reports on days 1, 7 and 30.
4. `PlainsightHook` reads `FlagRegistry`, so a flagged wallet pays the insider fee on its next sell.

Code: [`surveillance/main.ts`](surveillance/main.ts).

## Configure

1. Install: `cd surveillance && bun install`
2. Copy `.env.example` to `.env` and set `SEPOLIA_RPC_URL` and `CRE_ETH_PRIVATE_KEY` (a Sepolia key with test ETH, used to pay for simulated report transactions). Never commit `.env`.
3. In `surveillance/config.staging.json`, set `flowTrackUrl` to a URL the workflow can reach, for example your deployed app: `https://<your-app>.vercel.app/api/flowtrack/<label>`. Contract addresses are already set (see [../docs/DEPLOYMENTS.md](../docs/DEPLOYMENTS.md)).

## Simulate

From this folder, with the [CRE CLI](https://docs.chain.link/cre/getting-started/cli-installation) installed and logged in:

```bash
cre workflow simulate ./surveillance --target staging-settings            # dry run
cre workflow simulate ./surveillance --target staging-settings --broadcast # sends the report transaction
```

A successful run logs `writeReport kind=<n> txHash=0x… txStatus=SUCCESS`, and the transaction shows up on `FlagRegistry` on Sepolia (`Flagged` or `ReportPublished` events).
