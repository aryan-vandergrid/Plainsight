// SPDX-License-Identifier: MIT
pragma solidity 0.8.25;

import {IERC165} from "@openzeppelin/contracts/utils/introspection/IERC165.sol";

import {IFlagRegistry} from "./PlainsightHook.sol";

interface IReceiver is IERC165 {
    function onReport(bytes calldata metadata, bytes calldata report) external;
}

contract FlagRegistry is IFlagRegistry, IReceiver {
    uint8 public constant KIND_FLAG = 1;
    uint8 public constant KIND_UNFLAG = 2;
    uint8 public constant KIND_REPORT = 3;

    address public immutable SIM_FORWARDER;
    address public immutable FORWARDER;
    address public immutable SIGNER;

    struct Report {
        uint16 day;
        bytes32 hash;
        string uri;
        uint64 at;
    }

    mapping(bytes32 tokenId => mapping(address wallet => bytes32 reason)) public flagReason;
    mapping(bytes32 tokenId => uint256) public flagCount;
    mapping(bytes32 tokenId => Report[]) internal reports;

    event Flagged(bytes32 indexed tokenId, address indexed wallet, bytes32 reasonHash, address indexed via);
    event Unflagged(bytes32 indexed tokenId, address indexed wallet, address indexed via);
    event ReportPublished(bytes32 indexed tokenId, uint16 indexed day, bytes32 reportHash, string uri, address via);

    error NotAuthorized(address caller);
    error UnknownKind(uint8 kind);
    error EmptyReason();

    constructor(address simForwarder, address forwarder, address signer) {
        SIM_FORWARDER = simForwarder;
        FORWARDER = forwarder;
        SIGNER = signer;
    }

    function onReport(bytes calldata, bytes calldata report) external {
        if (msg.sender != FORWARDER && msg.sender != SIM_FORWARDER) revert NotAuthorized(msg.sender);
        (uint8 kind, bytes memory payload) = abi.decode(report, (uint8, bytes));
        if (kind == KIND_FLAG) {
            (bytes32 tokenId, address[] memory wallets, bytes32[] memory reasons) =
                abi.decode(payload, (bytes32, address[], bytes32[]));
            for (uint256 i; i < wallets.length; ++i) {
                _flag(tokenId, wallets[i], reasons[i]);
            }
        } else if (kind == KIND_UNFLAG) {
            (bytes32 tokenId, address[] memory wallets) = abi.decode(payload, (bytes32, address[]));
            for (uint256 i; i < wallets.length; ++i) {
                _unflag(tokenId, wallets[i]);
            }
        } else if (kind == KIND_REPORT) {
            (bytes32 tokenId, uint16 day, bytes32 hash, string memory uri) = abi.decode(payload, (bytes32, uint16, bytes32, string));
            _publish(tokenId, day, hash, uri);
        } else {
            revert UnknownKind(kind);
        }
    }

    function supportsInterface(bytes4 interfaceId) external pure returns (bool) {
        return interfaceId == type(IReceiver).interfaceId || interfaceId == type(IERC165).interfaceId;
    }

    function flag(bytes32 tokenId, address wallet, bytes32 reasonHash) external {
        _onlySigner();
        _flag(tokenId, wallet, reasonHash);
    }

    function unflag(bytes32 tokenId, address wallet) external {
        _onlySigner();
        _unflag(tokenId, wallet);
    }

    function publishReport(bytes32 tokenId, uint16 day, bytes32 hash, string calldata uri) external {
        _onlySigner();
        _publish(tokenId, day, hash, uri);
    }

    function isFlagged(bytes32 tokenId, address wallet) external view returns (bool) {
        return flagReason[tokenId][wallet] != bytes32(0);
    }

    function reportsOf(bytes32 tokenId) external view returns (Report[] memory) {
        return reports[tokenId];
    }

    function _flag(bytes32 tokenId, address wallet, bytes32 reason) internal {
        if (reason == bytes32(0)) revert EmptyReason();
        if (flagReason[tokenId][wallet] == bytes32(0)) flagCount[tokenId] += 1;
        flagReason[tokenId][wallet] = reason;
        emit Flagged(tokenId, wallet, reason, msg.sender);
    }

    function _unflag(bytes32 tokenId, address wallet) internal {
        if (flagReason[tokenId][wallet] == bytes32(0)) return;
        delete flagReason[tokenId][wallet];
        flagCount[tokenId] -= 1;
        emit Unflagged(tokenId, wallet, msg.sender);
    }

    function _publish(bytes32 tokenId, uint16 day, bytes32 hash, string memory uri) internal {
        reports[tokenId].push(Report({day: day, hash: hash, uri: uri, at: uint64(block.timestamp)}));
        emit ReportPublished(tokenId, day, hash, uri, msg.sender);
    }

    function _onlySigner() internal view {
        if (msg.sender != SIGNER) revert NotAuthorized(msg.sender);
    }
}
