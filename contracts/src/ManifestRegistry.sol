// SPDX-License-Identifier: MIT
pragma solidity 0.8.25;

import {IManifestRegistry} from "./interfaces/IManifestRegistry.sol";
import {Allocation, Amendment, Manifest, ManifestStatus} from "./interfaces/IManifest.sol";

contract ManifestRegistry is IManifestRegistry {
    struct Entry {
        Manifest manifest;
        ManifestStatus status;
        uint64 postedAt;
        Amendment[] amendments;
    }

    uint256 public constant MAX_ALLOCATIONS = 12;

    address public immutable deployer;
    address public launcher;

    mapping(bytes32 id => Entry) private _entries;

    modifier onlyLauncher() {
        if (msg.sender != launcher) revert NotLauncher();
        _;
    }

    constructor() {
        deployer = msg.sender;
    }

    function setLauncher(address launcher_) external {
        if (msg.sender != deployer) revert NotDeployer();
        if (launcher != address(0)) revert LauncherAlreadySet();
        if (launcher_ == address(0)) revert InvalidManifest("launcher");
        launcher = launcher_;
        emit LauncherSet(launcher_);
    }

    function register(Manifest calldata m) external onlyLauncher returns (bytes32 id) {
        _validate(m);
        id = idOf(m.ensLabel);
        Entry storage e = _entries[id];
        if (e.status == ManifestStatus.Locked) revert ManifestIsLocked(id);

        Manifest storage s = e.manifest;
        s.token = m.token;
        s.ensLabel = m.ensLabel;
        s.issuer = m.issuer;
        delete s.allocations;
        for (uint256 i; i < m.allocations.length; ++i) {
            s.allocations.push(m.allocations[i]);
        }
        s.mm = m.mm;
        s.agent = m.agent;
        s.agentOperator = m.agentOperator;
        s.greenshoeBps = m.greenshoeBps;
        s.windowSecs = m.windowSecs;
        s.rangeDepthBps = m.rangeDepthBps;
        s.treasury = m.treasury;
        s.insiderFeeBps = m.insiderFeeBps;
        s.minRaise = m.minRaise;
        s.manifestHash = m.manifestHash;
        s.jsonURI = m.jsonURI;

        e.status = ManifestStatus.Registered;
        e.postedAt = uint64(block.timestamp);
        emit ManifestRegistered(id, m.issuer, m.token, m.ensLabel, m.manifestHash);
    }

    function lock(bytes32 id) external onlyLauncher {
        Entry storage e = _entries[id];
        if (e.status == ManifestStatus.None) revert ManifestMissing(id);
        if (e.status == ManifestStatus.Locked) revert ManifestIsLocked(id);
        e.status = ManifestStatus.Locked;
        emit ManifestLocked(id);
    }

    function amend(bytes32 id, bytes32 newHash, string calldata uri) external {
        Entry storage e = _entries[id];
        if (e.status == ManifestStatus.None) revert ManifestMissing(id);
        if (msg.sender != e.manifest.issuer && msg.sender != launcher) revert NotIssuerOrLauncher();
        e.amendments.push(Amendment({manifestHash: newHash, uri: uri, timestamp: uint64(block.timestamp)}));
        emit ManifestAmended(id, e.amendments.length - 1, newHash, uri);
    }

    function isInsider(bytes32 id, address account) external view returns (bool) {
        if (account == address(0)) return false;
        Manifest storage m = _entries[id].manifest;
        if (account == m.mm.wallet) return true;
        for (uint256 i; i < m.allocations.length; ++i) {
            Allocation storage a = m.allocations[i];
            if (a.insider && (account == a.wallet || account == a.vesting)) return true;
        }
        return false;
    }

    function get(bytes32 id) external view returns (Manifest memory) {
        return _entries[id].manifest;
    }

    function status(bytes32 id) external view returns (ManifestStatus) {
        return _entries[id].status;
    }

    function postedAt(bytes32 id) external view returns (uint64) {
        return _entries[id].postedAt;
    }

    function amendments(bytes32 id) external view returns (Amendment[] memory) {
        return _entries[id].amendments;
    }

    function idOf(string calldata ensLabel) public pure returns (bytes32) {
        return keccak256(bytes(ensLabel));
    }

    function _validate(Manifest calldata m) private pure {
        if (m.token == address(0)) revert InvalidManifest("token");
        if (m.issuer == address(0)) revert InvalidManifest("issuer");
        _validateLabel(m.ensLabel);
        uint256 n = m.allocations.length;
        if (n > MAX_ALLOCATIONS) revert TooManyAllocations(n, MAX_ALLOCATIONS);
        for (uint256 i; i < n; ++i) {
            Allocation calldata a = m.allocations[i];
            _validateLabel(a.label);
            bytes32 h = keccak256(bytes(a.label));
            if (h == keccak256("mm") || h == keccak256("agent")) revert ReservedLabel(a.label);
            for (uint256 j; j < i; ++j) {
                if (keccak256(bytes(m.allocations[j].label)) == h) revert DuplicateAllocation(a.label);
            }
            if (a.wallet == address(0)) revert InvalidManifest("allocation wallet");
            if (a.amount == 0) revert InvalidManifest("allocation amount");
        }
    }

    function _validateLabel(string calldata label) private pure {
        bytes calldata b = bytes(label);
        if (b.length == 0 || b.length > 63 || b[0] == "-" || b[b.length - 1] == "-") revert InvalidLabel(label);
        for (uint256 i; i < b.length; ++i) {
            bytes1 c = b[i];
            bool ok = (c >= "a" && c <= "z") || (c >= "0" && c <= "9") || c == "-";
            if (!ok) revert InvalidLabel(label);
        }
    }
}
