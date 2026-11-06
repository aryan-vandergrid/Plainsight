# Uniswap developer feedback

Project: **Plainsight**, built for ETHGlobal Mumbai 2026 (Uniswap Foundation, "Build with Uniswap").
Stack used: **Continuous Clearing Auction v2.1.0**, **Uniswap v4** (custom hook, StateView, Quoter), **Universal Router**, **Permit2**, on Ethereum Sepolia.

## What we built on Uniswap

| Piece | Where |
|---|---|
| CCA created per launch through the official factory | [`AuctionDeployer.deploy`](contracts/src/AuctionDeployer.sol#L56) |
| CCA address recomputed to prove the live auction matches the disclosed terms | [`AuctionDeployer.expectedAuction`](contracts/src/AuctionDeployer.sol#L68), [`Launcher._auctionOk`](contracts/src/Launcher.sol#L139) |
| v4 pool opened at the auction's final price | [`GreenshoeVault._openPool`](contracts/src/GreenshoeVault.sol#L249) |
| v4 hook: fees, fake-volume accounting, halts, locked liquidity | [`PlainsightHook`](contracts/src/PlainsightHook.sol) |
| Swaps through the Universal Router | [`TradePage.tsx`](web/components/launch/TradePage.tsx), [`trade.ts`](web/lib/trade.ts) |

## What worked well

- **CCA's deterministic address.** `getAddress` on the factory let us verify, on-chain, that a running auction was built from exactly the terms the issuer disclosed. That became one of our eight launch checks.
- **A contract as the CCA recipient.** Setting our vault as the funds and token recipient made the post-auction flow (sweep, split, open the pool) fully on-chain, with no operator step.
- **Hook permissions as a first-class concept.** Encoding permissions in the hook address made it easy to verify a deployed hook has exactly the callbacks we intended.
- **Transient storage in a hook.** It was a clean way to track what a trader bought and sold within one transaction.

## Friction and requests

1. **Identifying the real trader in a hook.** A hook sees the router as `sender`. We call the router's `msgSender()` (see [`PlainsightHook.sol#L397`](contracts/src/PlainsightHook.sol#L397)) with a bounded gas `staticcall`, and fall back to treating the router as the trader when it doesn't expose it. Per-wallet hook rules only work if more routers expose `msgSender()`. A standard interface for this would help every hook that needs per-user logic.
2. **CCA to v4 with a custom hook.** There is no direct path from a finished CCA into a v4 pool that uses a custom hook. We wrote that bridge ourselves in the vault. A documented pattern, or a hook-aware graduation step, would remove a lot of custom code.
3. **Combining hooks.** A pool has one hook. Permissioned pools decide who can trade, while our hook decides what a clean launch looks like. We'd like a recommended way to combine the two.
4. **CCA configuration data.** Building the auction parameters (price grid in Q96 and the step schedule) took the most time. We ended up writing helpers ([`priceGrid`](contracts/src/AuctionDeployer.sol#L119), [`schedule`](contracts/src/AuctionDeployer.sol#L127)). A reference builder for common shapes, or worked examples in the docs, would help.
5. **Testing.** Our unit tests needed local builds of the CCA, Permit2 and v4 (see `contracts/test/utils/`). Official test fixtures for these would save every team the same work.

## Developer experience

- Sepolia deployments for CCA, v4 and the Universal Router were available and stable for our fork tests.
- Error decoding was harder than it needed to be: bid and swap reverts bubble up from several contracts (Permit2, CCA, token), so we merge their error ABIs on the client ([`abis/index.ts`](web/lib/abis/index.ts)) to show readable messages.
