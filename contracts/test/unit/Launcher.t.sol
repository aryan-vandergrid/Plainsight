// SPDX-License-Identifier: MIT
pragma solidity 0.8.25;

import {NameCoder} from "@ens/contracts/utils/NameCoder.sol";
import {IAddrResolver} from "@ens/contracts/resolvers/profiles/IAddrResolver.sol";
import {ITextResolver} from "@ens/contracts/resolvers/profiles/ITextResolver.sol";
import {IExtendedResolver} from "@ens/contracts/resolvers/profiles/IExtendedResolver.sol";
import {IEnhancedAccessControl} from "@ensdomains/contracts-v2/access-control/interfaces/IEnhancedAccessControl.sol";
import {IPermissionedRegistry} from "@ensdomains/contracts-v2/registry/interfaces/IPermissionedRegistry.sol";
import {IRegistry} from "@ensdomains/contracts-v2/registry/interfaces/IRegistry.sol";
import {IAddressSetter} from "@ensdomains/contracts-v2/resolver/interfaces/setters/IAddressSetter.sol";
import {ITextSetter} from "@ensdomains/contracts-v2/resolver/interfaces/setters/ITextSetter.sol";
import {RegistryRolesLib} from "@ensdomains/contracts-v2/registry/libraries/RegistryRolesLib.sol";
import {VestingWallet} from "@openzeppelin/contracts/finance/VestingWallet.sol";

import {PlainsightEnsRoles} from "../../src/ens/PlainsightEnsRoles.sol";
import {CheckStatus, EnsRecord, ILauncher} from "../../src/interfaces/ILauncher.sol";
import {Allocation, Manifest} from "../../src/interfaces/IManifest.sol";
import {LaunchStack} from "../utils/LaunchStack.sol";

contract LauncherTest is LaunchStack {
    function setUp() public {
        _deployStack();
    }

    function _addr(string memory name) internal view returns (address) {
        bytes memory dns = NameCoder.encode(name);
        return abi.decode(
            IExtendedResolver(resolver).resolve(dns, abi.encodeCall(IAddrResolver.addr, (NameCoder.namehash(dns, 0)))),
            (address)
        );
    }

    function _text(string memory name, string memory key) internal view returns (string memory) {
        bytes memory dns = NameCoder.encode(name);
        return abi.decode(
            IExtendedResolver(resolver).resolve(dns, abi.encodeCall(ITextResolver.text, (NameCoder.namehash(dns, 0), key))),
            (string)
        );
    }

    function test_postManifest_createsNamesRecordsAndVesting() public {
        bytes32 id = _post();

        assertEq(_addr("team.abc.plainsight.eth"), teamWallet);
        assertEq(_addr("investors.abc.plainsight.eth"), investorWallet);
        assertEq(_addr("mm.abc.plainsight.eth"), mmWallet);
        assertEq(_addr("agent.abc.plainsight.eth"), agentWallet);
        assertEq(_text("team.abc.plainsight.eth", "amount"), "200000 ABC");
        assertEq(_text("mm.abc.plainsight.eth", "loan"), "50000 ABC");
        assertEq(_text("mm.abc.plainsight.eth", "strike"), "1.2 USDC");
        assertEq(_text("agent.abc.plainsight.eth", "greenshoe"), "15%");
        assertEq(_text("agent.abc.plainsight.eth", "rangeDepth"), "10%");
        assertEq(_text("abc.plainsight.eth", "manifest"), vm.toString(keccak256("abc-manifest-v1")));

        Manifest memory m = registry.get(id);
        VestingWallet team = VestingWallet(payable(m.allocations[0].vesting));
        assertEq(team.owner(), teamWallet);
        assertEq(team.start(), m.allocations[0].unlockDate);
        assertEq(team.duration(), 0);
        assertEq(abc.balanceOf(address(team)), 200_000 ether);
        assertEq(abc.balanceOf(m.allocations[1].vesting), 100_000 ether);

        IPermissionedRegistry tokenRegistry = launcher.tokenRegistryOf(id);
        assertEq(address(plainsightRegistry.getSubregistry("abc")), address(tokenRegistry));
        assertEq(tokenRegistry.findOwner("team"), address(launcher));
    }

    function test_postManifest_onlyIssuer() public {
        Manifest memory m = _abcManifest(address(abc), "abc");
        vm.expectRevert(ILauncher.NotIssuer.selector);
        launcher.postManifest(m);
    }

    function test_postManifest_twiceReverts() public {
        bytes32 id = _post();
        Manifest memory m = _abcManifest(address(abc), "abc");
        vm.expectRevert(abi.encodeWithSelector(ILauncher.AlreadyPosted.selector, id));
        vm.prank(issuer);
        launcher.postManifest(m);
    }

    function test_issuerHoldsNoRolesOnSubnames() public {
        bytes32 id = _post();
        IPermissionedRegistry tokenRegistry = launcher.tokenRegistryOf(id);
        string[4] memory subs = ["team", "investors", "mm", "agent"];
        for (uint256 i; i < subs.length; ++i) {
            uint256 labelId = uint256(keccak256(bytes(subs[i])));
            assertEq(tokenRegistry.roles(labelId, issuer), 0, subs[i]);
            assertEq(tokenRegistry.findOwner(subs[i]), address(launcher), subs[i]);
        }
        assertEq(tokenRegistry.roles(0, issuer), 0, "token registry root");
        assertEq(plainsightRegistry.roles(uint256(keccak256("abc")), issuer), 0, "abc name");
        assertEq(plainsightRegistry.roles(0, issuer), 0, "plainsight registry root");
        assertEq(IEnhancedAccessControl(resolver).roles(0, issuer), 0, "resolver root");
        assertEq(uint8(launcher.checks(id)[3]), uint8(CheckStatus.Passed));
    }

    function test_issuerCannotChangeNamesOrRecords() public {
        bytes32 id = _post();
        IPermissionedRegistry tokenRegistry = launcher.tokenRegistryOf(id);
        bytes memory teamDns = NameCoder.encode("team.abc.plainsight.eth");

        vm.startPrank(issuer);
        vm.expectRevert();
        IAddressSetter(resolver).setAddress(teamDns, 60, abi.encodePacked(issuer));
        vm.expectRevert();
        ITextSetter(resolver).setText(teamDns, "amount", "0 ABC");
        vm.expectRevert();
        tokenRegistry.setResolver(uint256(keccak256("team")), issuer);
        vm.expectRevert();
        tokenRegistry.register("team2", issuer, IRegistry(address(0)), resolver, 0, type(uint64).max);
        vm.expectRevert();
        plainsightRegistry.setSubregistry(uint256(keccak256("abc")), IRegistry(issuer));
        vm.expectRevert();
        plainsightRegistry.unregister(uint256(keccak256("abc")));
        vm.stopPrank();

        assertEq(_addr("team.abc.plainsight.eth"), teamWallet);
        (bool ok,) = launcher.verify(id);
        assertTrue(ok);
    }

    function test_verify_passesOnMatchingData() public {
        bytes32 id = _post();
        CheckStatus[8] memory st = launcher.checks(id);
        for (uint256 i; i < 8; ++i) {
            assertEq(uint8(st[i]), uint8(CheckStatus.Passed), string.concat("check ", vm.toString(i + 1)));
        }

        (bool ok, uint8 failed) = launcher.verify(id);
        assertTrue(ok);
        assertEq(failed, 0);
        (bool stored,,) = launcher.lastVerify(id);
        assertTrue(stored);
    }

    function test_verify_failsCheck3OnEnsAddrMismatch() public {
        bytes32 id = _post();
        vm.prank(ensDeployer);
        IAddressSetter(resolver).setAddress(NameCoder.encode("team.abc.plainsight.eth"), 60, abi.encodePacked(address(0xBAD)));

        (bool ok, uint8 failed) = launcher.verify(id);
        assertFalse(ok);
        assertEq(failed, 3);
        (bool stored,,) = launcher.lastVerify(id);
        assertFalse(stored);
        vm.expectRevert(abi.encodeWithSelector(ILauncher.NotVerified.selector, id, uint8(3)));
        launcher.launch(id, _terms(100));
    }

    function test_verify_failsCheck3OnEnsTextMismatch() public {
        bytes32 id = _post();
        vm.prank(ensDeployer);
        ITextSetter(resolver).setText(NameCoder.encode("mm.abc.plainsight.eth"), "loan", "0 ABC");
        (, uint8 failed) = launcher.verify(id);
        assertEq(failed, 3);
    }

    function test_verify_failsCheck5OnVestingAmountMismatch() public {
        bytes32 id = _post();
        address teamVesting = registry.get(id).allocations[0].vesting;
        deal(address(abc), teamVesting, 150_000 ether);

        (bool ok, uint8 failed) = launcher.verify(id);
        assertFalse(ok);
        assertEq(failed, 5);
    }

    function test_verify_failsCheck6WhenAgentIsIssuer() public {
        Manifest memory m = _abcManifest(address(abc), "abc");
        m.agent = issuer;
        vm.startPrank(issuer);
        abc.approve(address(launcher), 300_000 ether);
        bytes32 id = launcher.postManifest(m);
        vm.stopPrank();
        (, uint8 failed) = launcher.verify(id);
        assertEq(failed, 6);
    }

    function test_verify_failsCheck6WithoutOperator() public {
        Manifest memory m = _abcManifest(address(abc), "abc");
        m.agentOperator = "";
        vm.startPrank(issuer);
        abc.approve(address(launcher), 300_000 ether);
        bytes32 id = launcher.postManifest(m);
        vm.stopPrank();
        (, uint8 failed) = launcher.verify(id);
        assertEq(failed, 6);
    }

    function test_postManifest_treasuryIsTheProtocolTreasury() public {
        bytes32 id = _post();
        assertEq(registry.get(id).treasury, treasury);
        assertEq(_text("abc.plainsight.eth", "treasury"), vm.toString(treasury));
        assertEq(_text("agent.abc.plainsight.eth", "operator"), "Vandergrid");

        Manifest memory m = _abcManifest(address(abc), "abd");
        m.treasury = issuer;
        vm.startPrank(issuer);
        abc.approve(address(launcher), 300_000 ether);
        vm.expectRevert(abi.encodeWithSelector(ILauncher.WrongTreasury.selector, issuer));
        launcher.postManifest(m);
        vm.stopPrank();
    }

    function test_noManifest_verifyAndLaunchRevert() public {
        bytes32 id = keccak256("nope");
        vm.expectRevert(abi.encodeWithSelector(ILauncher.ManifestMissing.selector, id));
        launcher.verify(id);
        vm.expectRevert(abi.encodeWithSelector(ILauncher.ManifestMissing.selector, id));
        launcher.launch(id, _terms(100));
    }

    function test_renounceAdmin_leavesLauncherAsOnlyWriter() public {
        bytes32 id = _post();
        vm.startPrank(ensDeployer);
        plainsightRegistry.revokeRootRoles(PlainsightEnsRoles.DEPLOYER_REGISTRY_ROLES, ensDeployer);
        IEnhancedAccessControl(resolver).revokeRootRoles(PlainsightEnsRoles.DEPLOYER_RESOLVER_ROLES, ensDeployer);
        vm.expectRevert();
        IAddressSetter(resolver).setAddress(NameCoder.encode("team.abc.plainsight.eth"), 60, abi.encodePacked(address(0xBAD)));
        vm.stopPrank();
        assertEq(IEnhancedAccessControl(resolver).roles(0, ensDeployer), 0);
        assertTrue(IEnhancedAccessControl(resolver).hasRootRoles(PlainsightEnsRoles.LAUNCHER_RESOLVER_ROLES, address(launcher)));
        (bool ok,) = launcher.verify(id);
        assertTrue(ok);
    }

    function test_expectedRecords_layout() public {
        bytes32 id = _post();
        EnsRecord[] memory r = launcher.expectedRecords(id);
        assertEq(r.length, 5);
        assertEq(r[0].name, "abc.plainsight.eth");
        assertEq(r[1].name, "team.abc.plainsight.eth");
        assertEq(r[2].name, "investors.abc.plainsight.eth");
        assertEq(r[3].name, "mm.abc.plainsight.eth");
        assertEq(r[4].name, "agent.abc.plainsight.eth");
        assertEq(r[1].values[1], "cliff 1971-01-01T00:00:01Z");
        assertEq(r[1].keys[2], "insider");
        assertEq(r[1].values[2], "yes");
        assertEq(r[3].values[2], "2% depth, 99% uptime");
        assertEq(r[0].keys[3], "treasury");
        assertEq(r[4].keys[2], "operator");
        assertEq(r[4].values[2], "Vandergrid");
    }

    function test_postManifest_customTokenomics() public {
        Manifest memory m = _abcManifest(address(abc), "abc");
        uint64 inYear = uint64(block.timestamp + 365 days);
        Allocation[] memory a = new Allocation[](6);
        a[0] = Allocation("team", true, teamWallet, 150_000 ether, address(0), inYear, 730 days);
        a[1] = Allocation("advisors", true, address(0xAD), 20_000 ether, address(0), inYear, 0);
        a[2] = Allocation("seed", true, investorWallet, 100_000 ether, address(0), inYear, 0);
        a[3] = Allocation("treasury", true, address(0x7EA5), 250_000 ether, address(0), inYear, 0);
        a[4] = Allocation("community-airdrop", false, address(0xA1D), 80_000 ether, address(0), 0, 0);
        a[5] = Allocation("partners-fund", true, address(0xFA), 30_000 ether, address(0), inYear, 0);
        m.allocations = a;

        vm.startPrank(issuer);
        abc.approve(address(launcher), 630_000 ether);
        bytes32 id = launcher.postManifest(m);
        vm.stopPrank();

        assertEq(_addr("advisors.abc.plainsight.eth"), address(0xAD));
        assertEq(_addr("partners-fund.abc.plainsight.eth"), address(0xFA));
        assertEq(_text("team.abc.plainsight.eth", "vesting"), "linear 1971-01-01T00:00:01Z +63072000s");
        assertEq(_text("community-airdrop.abc.plainsight.eth", "vesting"), "unlocked");
        assertEq(_text("community-airdrop.abc.plainsight.eth", "insider"), "no");
        assertEq(abc.balanceOf(address(0xA1D)), 80_000 ether, "unlocked allocation goes straight to its wallet");
        assertTrue(registry.isInsider(id, address(0xFA)));
        assertFalse(registry.isInsider(id, address(0xA1D)));

        (bool ok, uint8 failed) = launcher.verify(id);
        assertTrue(ok);
        assertEq(failed, 0);
        assertEq(launcher.expectedRecords(id).length, 1 + 6 + 2);
    }
}
