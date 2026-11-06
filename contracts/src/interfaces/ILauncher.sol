// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {Manifest} from "./IManifest.sol";

enum CheckStatus {
    Failed,
    Passed,
    NotConfigured
}

struct EnsRecord {
    string name;
    string label;
    address wallet;
    string[] keys;
    string[] values;
}

struct LaunchTerms {
    uint256 saleAmount;
    uint256 floorPriceUsdc;
    uint32 durationBlocks;
}

struct AuctionInfo {
    address auction;
    uint128 supply;
    uint64 startBlock;
    uint64 endBlock;
    LaunchTerms terms;
}

interface ILauncher {
    event ManifestPosted(
        bytes32 indexed id, address indexed issuer, address indexed token, string ensLabel, address tokenRegistry
    );
    event VestingDeployed(
        bytes32 indexed id, string label, address indexed wallet, address vesting, uint256 amount, uint64 unlockDate
    );
    event Verified(bytes32 indexed id, bool ok, uint8 failedCheck, CheckStatus[8] checks);
    event AuctionStarted(
        bytes32 indexed id,
        address indexed auction,
        uint128 supply,
        uint256 saleAmount,
        uint256 floorPriceUsdc,
        uint256 minRaise,
        uint64 startBlock,
        uint64 endBlock
    );

    error NotIssuer();
    error AlreadyPosted(bytes32 id);
    error ManifestMissing(bytes32 id);
    error VestingMustBeEmpty(uint256 index);
    error NotVerified(bytes32 id, uint8 failedCheck);
    error AlreadyLaunched(bytes32 id);
    error WrongTreasury(address treasury);

    function postManifest(Manifest calldata m) external returns (bytes32 id);
    function verify(bytes32 id) external returns (bool ok, uint8 failedCheck);
    function checks(bytes32 id) external view returns (CheckStatus[8] memory);
    function expectedRecords(bytes32 id) external view returns (EnsRecord[] memory);

    function launch(bytes32 id, LaunchTerms calldata terms) external returns (address auction);
    function auctionInfo(bytes32 id) external view returns (AuctionInfo memory);
}
