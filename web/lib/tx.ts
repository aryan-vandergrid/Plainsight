import { BaseError, ContractFunctionRevertedError } from "viem";

const HINTS: Record<string, string> = {
  NotIssuer: "The connected wallet must be the issuer.",
  AlreadyPosted: "This ENS name already has a launch.",
  DuplicateAllocation: "Two allocations use the same category.",
  ReservedLabel: '"mm" and "agent" are reserved names.',
  TooManyAllocations: "Too many allocations for one launch.",
  InvalidLabel: "The ENS name can only use lowercase letters, numbers and hyphens.",
  ERC20InsufficientBalance: "Your wallet doesn't hold enough tokens.",
  ERC20InsufficientAllowance: "The token approval is too low. Try again to re-approve.",
  NotVerified: "A check is failing, so the auction can't start. Fix it and verify again.",
  AlreadyLaunched: "This auction has already started.",
  InvalidSaleAmount: "Enter how many tokens to sell.",
  InvalidDuration: "Pick a duration between 2 minutes and 7 days.",
  FloorPriceTooLow: "The starting price is too low for this token.",
  FloorPriceTooHigh: "The starting price is too high.",
  SupplyTooLarge: "That sale is larger than the auction supports.",
  UnsupportedTokenDecimals: "The auction needs a token with 6 to 18 decimals.",
  MinRaiseRequired: "The manifest has no minimum raise.",
  InvalidGreenshoe: "The manifest's extra supply must be between 0.01% and 50%.",
  InvalidTokenAmountReceived: "The auction received fewer tokens than sent. Fee-on-transfer tokens aren't supported.",
  BidMustBeAboveClearingPrice: "The price moved above your max. Raise your max price and try again.",
  AuctionNotStarted: "The auction hasn't started yet.",
  AuctionIsOver: "The auction has ended.",
  AuctionSoldOut: "Every token in the auction has been sold.",
  InvalidBidPriceTooHigh: "That max price is above what this auction allows.",
  BidAmountTooSmall: "Enter an amount to spend.",
  TransferFromFailed: "USDC couldn't be moved. Check your balance and approvals.",
  AllowanceExpired: "Your USDC approval for this auction expired. Try again to renew it.",
  InsufficientAllowance: "Your USDC approval for this auction is too low. Try again to raise it.",
  BidAlreadyExited: "This bid has already been settled.",
  CannotExitBid: "This bid can't be settled yet.",
  CannotPartiallyExitBidBeforeEndBlock: "Wait for the auction to end to settle this bid.",
  CannotPartiallyExitBidBeforeGraduation: "Outbid refunds open once the minimum raise is reached, or at the end.",
  InvalidLastFullyFilledCheckpointHint: "The auction state moved. Refresh and try again.",
  InvalidOutbidBlockCheckpointHint: "The auction state moved. Refresh and try again.",
  NotClaimable: "Tokens can be claimed once the auction ends.",
  NotGraduated: "The minimum raise wasn't met, so there are no tokens to claim. Your USDC is refundable.",
  BidNotExited: "Settle the bid before claiming.",
  AlreadyCollected: "The proceeds have already been collected.",
  AuctionIsNotOver: "The auction hasn't ended yet.",
  WindowOpen: "The price-support window is still open.",
  MintCapExceeded: "That's more test USDC than one request allows.",
};

export function explainError(e: unknown): string {
  if (e instanceof BaseError) {
    if (e.walk((x) => (x as { code?: number }).code === 4001)) return "You rejected the transaction in your wallet.";
    const revert = e.walk((x) => x instanceof ContractFunctionRevertedError);
    if (revert instanceof ContractFunctionRevertedError && revert.data?.errorName) {
      return HINTS[revert.data.errorName] ?? `The transaction would fail (${revert.data.errorName}).`;
    }
    return e.shortMessage;
  }
  return e instanceof Error ? e.message : String(e);
}

export const isRejection = (e: unknown) => e instanceof BaseError && !!e.walk((x) => (x as { code?: number }).code === 4001);
