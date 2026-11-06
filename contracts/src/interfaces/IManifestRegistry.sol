// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {Amendment, Manifest, ManifestStatus} from "./IManifest.sol";

interface IManifestRegistry {
    event LauncherSet(address indexed launcher);
    event ManifestRegistered(
        bytes32 indexed id, address indexed issuer, address indexed token, string ensLabel, bytes32 manifestHash
    );
    event ManifestLocked(bytes32 indexed id);
    event ManifestAmended(bytes32 indexed id, uint256 indexed index, bytes32 manifestHash, string uri);

    error NotLauncher();
    error NotDeployer();
    error LauncherAlreadySet();
    error ManifestMissing(bytes32 id);
    error ManifestIsLocked(bytes32 id);
    error NotIssuerOrLauncher();
    error InvalidManifest(string reason);
    error InvalidLabel(string label);
    error DuplicateAllocation(string label);
    error ReservedLabel(string label);
    error TooManyAllocations(uint256 count, uint256 max);

    function register(Manifest calldata m) external returns (bytes32 id);
    function lock(bytes32 id) external;
    function amend(bytes32 id, bytes32 newHash, string calldata uri) external;

    function isInsider(bytes32 id, address account) external view returns (bool);
    function get(bytes32 id) external view returns (Manifest memory);
    function status(bytes32 id) external view returns (ManifestStatus);
    function postedAt(bytes32 id) external view returns (uint64);
    function amendments(bytes32 id) external view returns (Amendment[] memory);
    function idOf(string calldata ensLabel) external pure returns (bytes32);
    function launcher() external view returns (address);
}
