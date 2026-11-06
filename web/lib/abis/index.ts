import { launcherAbi } from "./Launcher";
import { manifestRegistryAbi } from "./ManifestRegistry";
import { mockTokenAbi } from "./MockToken";
import { launchTokenAbi, launchTokenBytecode } from "./LaunchToken";
import { auctionDeployerAbi } from "./AuctionDeployer";
import { greenshoeVaultAbi } from "./GreenshoeVault";
import { testUSDCAbi } from "./TestUSDC";
import { continuousClearingAuctionAbi } from "./ContinuousClearingAuction";
import { cCALensAbi } from "./CCALens";
import { permit2Abi } from "./Permit2";
import { plainsightHookAbi } from "./PlainsightHook";
import { stateViewAbi } from "./StateView";
import { v4QuoterAbi } from "./V4Quoter";

export {
  launcherAbi,
  manifestRegistryAbi,
  mockTokenAbi,
  launchTokenAbi,
  launchTokenBytecode,
  auctionDeployerAbi,
  greenshoeVaultAbi,
  testUSDCAbi as usdcAbi,
  continuousClearingAuctionAbi as ccaAbi,
  cCALensAbi as ccaLensAbi,
  permit2Abi,
  plainsightHookAbi,
  stateViewAbi,
  v4QuoterAbi,
};

// postManifest bubbles up registry errors (InvalidLabel, DuplicateAllocation…) and token errors
// (ERC20InsufficientBalance…); include them so viem can decode.
export const launcherWithErrorsAbi = [
  ...launcherAbi,
  ...manifestRegistryAbi.filter((x) => x.type === "error"),
  ...mockTokenAbi.filter((x) => x.type === "error"),
  // launch() bubbles up AuctionDeployer's term checks, the vault and the CCA constructor.
  ...auctionDeployerAbi.filter((x) => x.type === "error"),
  ...greenshoeVaultAbi.filter((x) => x.type === "error"),
  ...continuousClearingAuctionAbi.filter((x) => x.type === "error"),
] as const;

// Bids pull USDC through Permit2, so its and the token's errors can surface from submitBid.
export const ccaWithErrorsAbi = [
  ...continuousClearingAuctionAbi,
  ...permit2Abi.filter((x) => x.type === "error"),
  ...testUSDCAbi.filter((x) => x.type === "error"),
] as const;
