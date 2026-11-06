// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

struct AuctionParameters {
    address currency;
    address tokensRecipient;
    address fundsRecipient;
    uint64 startBlock;
    uint64 endBlock;
    uint64 claimBlock;
    uint256 tickSpacing;
    address validationHook;
    uint256 floorPrice;
    uint128 requiredCurrencyRaised;
    bytes auctionStepsData;
}

interface IContinuousClearingAuctionFactory {
    function create(address token, uint256 amount, bytes calldata configData, bytes32 salt)
        external
        returns (address auction);

    function getAddress(address token, uint256 amount, bytes calldata configData, bytes32 salt, address sender)
        external
        view
        returns (address auction);
}

interface IContinuousClearingAuction {
    function onTokensReceived() external;
    function sweepCurrency() external;
    function sweepUnsoldTokens() external;

    function isGraduated() external view returns (bool);
    function clearingPrice() external view returns (uint256);
    function currencyRaised() external view returns (uint256);
    function totalCleared() external view returns (uint256);

    function token() external view returns (address);
    function currency() external view returns (address);
    function totalSupply() external view returns (uint128);
    function tokensRecipient() external view returns (address);
    function fundsRecipient() external view returns (address);
    function startBlock() external view returns (uint64);
    function endBlock() external view returns (uint64);
    function claimBlock() external view returns (uint64);
    function floorPrice() external view returns (uint256);
    function tickSpacing() external view returns (uint256);
}

struct CcaCheckpoint {
    uint256 clearingPrice;
    uint256 currencyRaisedAtClearingPriceQ96X7;
    uint256 cumulativeMpsPerPrice;
    uint24 cumulativeMps;
    uint64 prev;
    uint64 next;
}

struct CcaBid {
    uint64 startBlock;
    uint24 startCumulativeMps;
    uint64 exitedBlock;
    uint256 maxPrice;
    address owner;
    uint256 amountQ96;
    uint256 tokensFilled;
}

interface ICcaBidder {
    function submitBid(uint256 maxPrice, uint128 amount, address owner, uint256 prevTickPrice, bytes calldata hookData)
        external
        payable
        returns (uint256 bidId);
    function checkpoint() external returns (CcaCheckpoint memory);
    function exitBid(uint256 bidId) external;
    function exitPartiallyFilledBid(uint256 bidId, uint64 lastFullyFilledCheckpointBlock, uint64 outbidBlock) external;
    function claimTokens(uint256 bidId) external;
    function claimTokensBatch(address owner, uint256[] calldata bidIds) external;

    function nextBidId() external view returns (uint256);
    function bids(uint256 bidId) external view returns (CcaBid memory);
    function lastCheckpointedBlock() external view returns (uint64);
    function checkpoints(uint64 blockNumber) external view returns (CcaCheckpoint memory);
}

interface IPermit2Allowance {
    function approve(address token, address spender, uint160 amount, uint48 expiration) external;
    function allowance(address owner, address token, address spender)
        external
        view
        returns (uint160 amount, uint48 expiration, uint48 nonce);
}
