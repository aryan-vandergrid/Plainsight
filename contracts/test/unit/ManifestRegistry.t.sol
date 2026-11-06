// SPDX-License-Identifier: MIT
pragma solidity 0.8.25;

import {Test} from "forge-std/Test.sol";
import {ManifestRegistry} from "../../src/ManifestRegistry.sol";
import {IManifestRegistry} from "../../src/interfaces/IManifestRegistry.sol";
import {Allocation, Amendment, Manifest, ManifestStatus} from "../../src/interfaces/IManifest.sol";
import {ManifestFixture} from "../utils/ManifestFixture.sol";

contract ManifestRegistryTest is Test, ManifestFixture {
    ManifestRegistry internal registry;
    address internal launcher = address(0x1A0C);
    address internal token = address(0xABC);

    function setUp() public {
        registry = new ManifestRegistry();
        registry.setLauncher(launcher);
    }

    function _register() internal returns (bytes32 id) {
        vm.prank(launcher);
        id = registry.register(_abcManifest(token, "abc"));
    }

    function test_register_onlyLauncher() public {
        Manifest memory m = _abcManifest(token, "abc");
        vm.expectRevert(IManifestRegistry.NotLauncher.selector);
        vm.prank(issuer);
        registry.register(m);

        vm.expectRevert(IManifestRegistry.NotLauncher.selector);
        registry.register(m);

        bytes32 id = _register();
        assertEq(id, keccak256("abc"));
        assertEq(uint8(registry.status(id)), uint8(ManifestStatus.Registered));
        assertTrue(registry.isInsider(id, teamWallet));
        assertTrue(registry.isInsider(id, mmWallet));
        assertFalse(registry.isInsider(id, agentWallet));
    }

    function test_setLauncher_onlyOnce() public {
        vm.expectRevert(IManifestRegistry.LauncherAlreadySet.selector);
        registry.setLauncher(address(0xBEEF));
    }

    function test_amend_appendsNeverOverwrites() public {
        bytes32 id = _register();
        bytes32 original = registry.get(id).manifestHash;

        vm.warp(1000);
        vm.prank(issuer);
        registry.amend(id, keccak256("v2"), "ipfs://v2");
        vm.warp(2000);
        vm.prank(issuer);
        registry.amend(id, keccak256("v3"), "ipfs://v3");

        Amendment[] memory a = registry.amendments(id);
        assertEq(a.length, 2);
        assertEq(a[0].manifestHash, keccak256("v2"));
        assertEq(a[0].timestamp, 1000);
        assertEq(a[1].manifestHash, keccak256("v3"));
        assertEq(a[1].timestamp, 2000);
        assertEq(registry.get(id).manifestHash, original, "original hash untouched");

        vm.expectRevert(IManifestRegistry.NotIssuerOrLauncher.selector);
        vm.prank(teamWallet);
        registry.amend(id, keccak256("evil"), "");
    }

    function test_lock_blocksRegister() public {
        bytes32 id = _register();

        Manifest memory edited = _abcManifest(token, "abc");
        edited.manifestHash = keccak256("edited");
        vm.prank(launcher);
        registry.register(edited);
        assertEq(registry.get(id).manifestHash, keccak256("edited"));

        vm.prank(launcher);
        registry.lock(id);
        assertEq(uint8(registry.status(id)), uint8(ManifestStatus.Locked));

        vm.expectRevert(abi.encodeWithSelector(IManifestRegistry.ManifestIsLocked.selector, id));
        vm.prank(launcher);
        registry.register(_abcManifest(token, "abc"));

        vm.prank(issuer);
        registry.amend(id, keccak256("post-lock"), "ipfs://post-lock");
        assertEq(registry.amendments(id).length, 1);
    }

    function test_register_rejectsDuplicateAllocation() public {
        Manifest memory m = _abcManifest(token, "abc");
        m.allocations[1].label = "team";
        vm.expectRevert(abi.encodeWithSelector(IManifestRegistry.DuplicateAllocation.selector, "team"));
        vm.prank(launcher);
        registry.register(m);
    }

    function test_register_rejectsReservedAndInvalidAllocationLabels() public {
        Manifest memory m = _abcManifest(token, "abc");
        m.allocations[1].label = "mm";
        vm.expectRevert(abi.encodeWithSelector(IManifestRegistry.ReservedLabel.selector, "mm"));
        vm.prank(launcher);
        registry.register(m);

        m.allocations[1].label = "Seed Round";
        vm.expectRevert(abi.encodeWithSelector(IManifestRegistry.InvalidLabel.selector, "Seed Round"));
        vm.prank(launcher);
        registry.register(m);
    }

    function test_register_capsAllocationCount() public {
        Manifest memory m = _abcManifest(token, "abc");
        uint256 max = registry.MAX_ALLOCATIONS();
        Allocation[] memory many = new Allocation[](max + 1);
        for (uint256 i; i < many.length; ++i) {
            many[i] = m.allocations[0];
            many[i].label = string.concat("bucket-", vm.toString(i));
        }
        m.allocations = many;
        vm.expectRevert(abi.encodeWithSelector(IManifestRegistry.TooManyAllocations.selector, max + 1, max));
        vm.prank(launcher);
        registry.register(m);
    }

    function test_isInsider_onlyFlaggedAllocations() public {
        Manifest memory m = _abcManifest(token, "abc");
        address airdrop = address(0xA1D);
        Allocation[] memory a = new Allocation[](3);
        (a[0], a[1]) = (m.allocations[0], m.allocations[1]);
        a[2] = Allocation({label: "community-airdrop", insider: false, wallet: airdrop, amount: 1 ether, vesting: address(0), unlockDate: 0, vestingDuration: 0});
        m.allocations = a;
        vm.prank(launcher);
        bytes32 id = registry.register(m);
        assertTrue(registry.isInsider(id, teamWallet));
        assertFalse(registry.isInsider(id, airdrop));
    }

    function test_register_rejectsBadLabel() public {
        vm.expectRevert(abi.encodeWithSelector(IManifestRegistry.InvalidLabel.selector, "ABC"));
        vm.prank(launcher);
        registry.register(_abcManifest(token, "ABC"));
    }
}
