// SPDX-License-Identifier: MIT
pragma solidity 0.8.25;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {VestingWallet} from "@openzeppelin/contracts/finance/VestingWallet.sol";
import {ERC1155Holder} from "@openzeppelin/contracts/token/ERC1155/utils/ERC1155Holder.sol";
import {IVerifiableFactory} from "@ensdomains/verifiable-factory/IVerifiableFactory.sol";
import {IPermissionedRegistry} from "@ensdomains/contracts-v2/registry/interfaces/IPermissionedRegistry.sol";

import {PlainsightEnsWriter} from "./ens/PlainsightEnsWriter.sol";
import {AuctionDeployer} from "./AuctionDeployer.sol";
import {GreenshoeVault} from "./GreenshoeVault.sol";
import {VestingWalletFactory} from "./VestingWalletFactory.sol";
import {ManifestRecords} from "./libraries/ManifestRecords.sol";
import {IContinuousClearingAuction} from "./interfaces/ICCA.sol";
import {IManifestRegistry} from "./interfaces/IManifestRegistry.sol";
import {AuctionInfo, CheckStatus, EnsRecord, ILauncher, LaunchTerms} from "./interfaces/ILauncher.sol";
import {Allocation, Manifest, ManifestStatus} from "./interfaces/IManifest.sol";

contract Launcher is ILauncher, PlainsightEnsWriter, ERC1155Holder {
    using SafeERC20 for IERC20;

    struct VerifyResult {
        bool ok;
        uint8 failedCheck;
        uint64 at;
    }

    uint8 internal constant REQUIRED_CHECKS = 8;

    IManifestRegistry public immutable REGISTRY;
    VestingWalletFactory public immutable VESTING_FACTORY;
    AuctionDeployer public immutable AUCTIONS;
    GreenshoeVault public immutable VAULT;

    mapping(bytes32 id => VerifyResult) public lastVerify;
    mapping(bytes32 id => AuctionInfo) internal _auctions;

    constructor(
        IManifestRegistry registry,
        VestingWalletFactory vestingFactory,
        AuctionDeployer auctions,
        IVerifiableFactory factory,
        address userRegistryImpl,
        IPermissionedRegistry ethRegistry,
        IPermissionedRegistry plainsightRegistry,
        address resolver
    ) PlainsightEnsWriter(factory, userRegistryImpl, ethRegistry, plainsightRegistry, resolver) {
        REGISTRY = registry;
        VESTING_FACTORY = vestingFactory;
        AUCTIONS = auctions;
        VAULT = GreenshoeVault(auctions.VAULT());
    }

    function postManifest(Manifest calldata m) external returns (bytes32 id) {
        if (msg.sender != m.issuer) revert NotIssuer();
        id = REGISTRY.idOf(m.ensLabel);
        if (REGISTRY.status(id) != ManifestStatus.None) revert AlreadyPosted(id);

        Manifest memory mm = m;
        address treasury = VAULT.hook().TREASURY();
        if (mm.treasury == address(0)) mm.treasury = treasury;
        else if (mm.treasury != treasury) revert WrongTreasury(mm.treasury);
        for (uint256 i; i < mm.allocations.length; ++i) {
            Allocation memory a = mm.allocations[i];
            if (a.vesting != address(0)) revert VestingMustBeEmpty(i);
            address dest = a.wallet;
            if (a.unlockDate > block.timestamp) {
                dest = VESTING_FACTORY.create(a.wallet, a.unlockDate, a.vestingDuration);
                mm.allocations[i].vesting = dest;
                emit VestingDeployed(id, a.label, a.wallet, dest, a.amount, a.unlockDate);
            }
            IERC20(mm.token).safeTransferFrom(msg.sender, dest, a.amount);
        }

        REGISTRY.register(mm);

        EnsRecord[] memory recs = ManifestRecords.build(mm);
        IPermissionedRegistry tokenRegistry = _createNames(id, mm.ensLabel, _subLabels(recs));
        for (uint256 i; i < recs.length; ++i) {
            if (recs[i].wallet != address(0)) _setAddr(recs[i].name, recs[i].wallet);
            for (uint256 k; k < recs[i].keys.length; ++k) {
                _setText(recs[i].name, recs[i].keys[k], recs[i].values[k]);
            }
        }

        emit ManifestPosted(id, mm.issuer, mm.token, mm.ensLabel, address(tokenRegistry));
    }

    function verify(bytes32 id) external returns (bool ok, uint8 failedCheck) {
        CheckStatus[8] memory st = checks(id);
        (ok, failedCheck) = _evaluate(st);
        lastVerify[id] = VerifyResult({ok: ok, failedCheck: failedCheck, at: uint64(block.timestamp)});
        emit Verified(id, ok, failedCheck, st);
    }

    function checks(bytes32 id) public view returns (CheckStatus[8] memory st) {
        if (REGISTRY.status(id) == ManifestStatus.None) revert ManifestMissing(id);
        Manifest memory m = REGISTRY.get(id);
        EnsRecord[] memory recs = ManifestRecords.build(m);
        string[] memory subs = _subLabels(recs);

        st[0] = _status(m.manifestHash != bytes32(0));
        st[1] = _status(_treeIntact(id, m.ensLabel, subs));
        st[2] = _status(st[1] == CheckStatus.Passed && _recordsMatch(recs));
        st[3] = _status(_holdsNoRoles(id, m.issuer, m.ensLabel, subs, _allKeys(recs)));
        st[4] = _status(_vestingOk(m, REGISTRY.postedAt(id)));
        st[5] = _status(m.agent != address(0) && m.agent != m.issuer && bytes(m.agentOperator).length > 0);
        st[6] = _status(_auctionOk(id, m));
        st[7] = _status(VAULT.hookReady());
    }

    function launch(bytes32 id, LaunchTerms calldata terms) external returns (address auction) {
        if (_auctions[id].auction != address(0)) revert AlreadyLaunched(id);
        CheckStatus[8] memory st = checks(id);
        (bool ok, uint8 failedCheck) = _evaluate(st);
        if (!ok) revert NotVerified(id, failedCheck);
        Manifest memory m = REGISTRY.get(id);
        if (msg.sender != m.issuer) revert NotIssuer();

        uint128 supply;
        uint64 startBlock;
        uint64 endBlock;
        (auction, supply, startBlock, endBlock) = AUCTIONS.deploy(id, m.token, m.greenshoeBps, m.minRaise, terms);
        _auctions[id] = AuctionInfo({auction: auction, supply: supply, startBlock: startBlock, endBlock: endBlock, terms: terms});
        REGISTRY.lock(id);
        VAULT.register(id, auction, m.issuer, m.token, m.greenshoeBps, m.windowSecs);

        IERC20(m.token).safeTransferFrom(msg.sender, auction, supply);
        IContinuousClearingAuction(auction).onTokensReceived();
        emit AuctionStarted(id, auction, supply, terms.saleAmount, terms.floorPriceUsdc, m.minRaise, startBlock, endBlock);
    }

    function auctionInfo(bytes32 id) external view returns (AuctionInfo memory) {
        return _auctions[id];
    }

    function _auctionOk(bytes32 id, Manifest memory m) internal view returns (bool) {
        AuctionInfo memory a = _auctions[id];
        if (a.auction == address(0)) return AUCTIONS.manifestValid(m.greenshoeBps, m.minRaise);
        try AUCTIONS.expectedAuction(id, m.token, m.greenshoeBps, m.minRaise, a.terms, a.startBlock) returns (address e) {
            return e == a.auction && a.auction.code.length > 0;
        } catch {
            return false;
        }
    }

    function expectedRecords(bytes32 id) external view returns (EnsRecord[] memory) {
        if (REGISTRY.status(id) == ManifestStatus.None) revert ManifestMissing(id);
        return ManifestRecords.build(REGISTRY.get(id));
    }

    function _recordsMatch(EnsRecord[] memory recs) internal view returns (bool) {
        for (uint256 i; i < recs.length; ++i) {
            if (recs[i].wallet != address(0) && _readAddr(recs[i].name) != recs[i].wallet) return false;
            for (uint256 k; k < recs[i].keys.length; ++k) {
                if (keccak256(bytes(_readText(recs[i].name, recs[i].keys[k]))) != keccak256(bytes(recs[i].values[k]))) {
                    return false;
                }
            }
        }
        return true;
    }

    function _vestingOk(Manifest memory m, uint64 postedAt) internal view returns (bool) {
        for (uint256 i; i < m.allocations.length; ++i) {
            Allocation memory a = m.allocations[i];
            if (a.vesting == address(0)) {
                if (a.unlockDate > postedAt) return false;
                continue;
            }
            if (!VESTING_FACTORY.isVestingWallet(a.vesting)) return false;
            VestingWallet v = VestingWallet(payable(a.vesting));
            if (v.owner() != a.wallet || v.start() != a.unlockDate || v.duration() != a.vestingDuration) return false;
            if (IERC20(m.token).balanceOf(a.vesting) + v.released(m.token) < a.amount) return false;
        }
        return true;
    }

    function _evaluate(CheckStatus[8] memory st) internal pure returns (bool ok, uint8 failedCheck) {
        for (uint8 i; i < REQUIRED_CHECKS; ++i) {
            if (st[i] != CheckStatus.Passed) return (false, i + 1);
        }
        for (uint8 i = REQUIRED_CHECKS; i < 8; ++i) {
            if (st[i] == CheckStatus.Failed) return (false, i + 1);
        }
        return (true, 0);
    }

    function _status(bool passed) internal pure returns (CheckStatus) {
        return passed ? CheckStatus.Passed : CheckStatus.Failed;
    }

    function _subLabels(EnsRecord[] memory recs) internal pure returns (string[] memory subs) {
        subs = new string[](recs.length - 1);
        for (uint256 i = 1; i < recs.length; ++i) {
            subs[i - 1] = recs[i].label;
        }
    }

    function _allKeys(EnsRecord[] memory recs) internal pure returns (string[] memory keys) {
        uint256 n;
        for (uint256 i; i < recs.length; ++i) {
            n += recs[i].keys.length;
        }
        keys = new string[](n);
        uint256 j;
        for (uint256 i; i < recs.length; ++i) {
            for (uint256 k; k < recs[i].keys.length; ++k) {
                keys[j++] = recs[i].keys[k];
            }
        }
    }
}
