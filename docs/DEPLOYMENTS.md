# Deployments: Sepolia (chainId 11155111)

Deploy block: `12076365` · ENS parent name: `plainsight.eth`

## Plainsight contracts

| Contract | Address |
|---|---|
| Launcher | `0x0ebc395B33c02A339f440E3a087619FB1C1e172e` |
| ManifestRegistry | `0xA127930a4EEB41A72efacffc9358f08246e45CED` |
| AuctionDeployer | `0x06138F5139E7c39e62fDe86bC7503E8Cf61A11F9` |
| GreenshoeVault | `0xd41a3A2Bb41da6235BeE70fBa67798677860E8f0` |
| PlainsightHook | `0xEC28b1369B53428A962a4b0a6025798Cce43AfC4` |
| FlagRegistry (Chainlink CRE receiver) | `0xe5c58941133124139fe38Fc294Df06e292a650A2` |
| VestingWalletFactory | `0xe700131948FF9d05e19834bf89eF77162d0Bb4E1` |
| TestUSDC | `0x1349A770Cc193840d83ceE2FF4db8F52e2703b88` |
| ABC token (demo) | `0x3D99Be8a04d9D565936fAa44Ba78537eFB0Ac69e` |
| XYZ token (demo) | `0x8368ceb29e95e030eF9224ED450c6Bf47131578B` |
| PlainsightRegistry (ENS) | `0x1581E3106Db36C9aB34af1A2E80070f672b2cdc5` |
| PermissionedResolver (ENS) | `0x4Df4D55743f3932A9Acf3ae550b4f4dDdA3dBEC3` |

## Uniswap

| Contract | Address |
|---|---|
| CCA Factory v2.1.0 | `0x000000001F26a0044BaA66024e7b6599c61963F8` |
| CCALens | `0xc3C65F5453A3674aDb693cbdA3C842545cD30f53` |
| Permit2 | `0x000000000022D473030F116dDEE9F6B43aC78BA3` |
| v4 PoolManager | `0xE03A1074c86CFeDd5C142C4F04F1a1536e203543` |
| StateView | `0xE1Dd9c3fA50EDB962E442f60DfBc432e24537E4C` |
| Universal Router | `0x3A9D48AB9751398BbFa63ad67599Bb04e4BdF98b` |
| v4 Quoter | `0x61B3f2011A92d183C7dbaDBdA940a7555Ccf9227` |
| PoolSwapTest | `0x9B6b46e2c869aa39918Db7f52f5557FE577B6eEe` |
| PoolModifyLiquidityTest | `0x0C478023803a644c94c4CE1C1e7b9A087e411B0A` |

## ENS (ENSv2)

| Contract | Address |
|---|---|
| Universal Resolver | `0xeEeEEEeE14D718C2B47D9923Deab1335E144EeEe` |
| ETHRegistry | `0xD4eBcbBdF463C9c45784603Db0dDD499BC44A8B4` |
| VerifiableFactory | `0xDa70306C98E97eCe36F997a21368e53298572991` |

Where these live in the repo: `web/lib/addresses.json` (frontend), `contracts/addresses.json` (scripts),
`cre/surveillance/config.*.json` (Chainlink workflow: `flagRegistry`, `hook`, `vault`).
