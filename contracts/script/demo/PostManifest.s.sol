// SPDX-License-Identifier: MIT
pragma solidity 0.8.25;

import {Script, console2} from "forge-std/Script.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Base64} from "@openzeppelin/contracts/utils/Base64.sol";
import {NameCoder} from "@ens/contracts/utils/NameCoder.sol";
import {IAddressSetter} from "@ensdomains/contracts-v2/resolver/interfaces/setters/IAddressSetter.sol";
import {ITextSetter} from "@ensdomains/contracts-v2/resolver/interfaces/setters/ITextSetter.sol";

import {Launcher} from "../../src/Launcher.sol";
import {MockToken} from "../../src/mocks/MockToken.sol";
import {ManifestRegistry} from "../../src/ManifestRegistry.sol";
import {CheckStatus, ILauncher, LaunchTerms} from "../../src/interfaces/ILauncher.sol";
import {Allocation, Manifest, ManifestStatus, MarketMakerDeal} from "../../src/interfaces/IManifest.sol";

contract PostManifest is Script {
    string internal constant CHECK_NAMES =
        "1 manifest | 2 ENS names | 3 ENS matches | 4 names locked | 5 vesting | 6 agent | 7 auction | 8 hook";

    Launcher internal launcher;
    ManifestRegistry internal registry;
    uint32 internal demoWindowSecs;
    address internal resolver;

    function _load() internal {
        string memory json = vm.readFile("./addresses.json");
        launcher = Launcher(vm.parseJsonAddress(json, ".launcher"));
        registry = ManifestRegistry(vm.parseJsonAddress(json, ".manifestRegistry"));
        resolver = vm.parseJsonAddress(json, ".ens.resolver");
    }

    function run() external {
        _load();
        address token = vm.parseJsonAddress(vm.readFile("./addresses.json"), ".abcToken");
        bytes32 id = _postIfNeeded(_manifest(token, "abc", "ABC Network", "ABC"));
        _verifyAndLog(id, vm.envUint("ISSUER_PK"));
    }

    function post(string calldata label) public {
        _load();
        address token;
        if (registry.status(registry.idOf(label)) == ManifestStatus.None) {
            vm.startBroadcast(vm.envUint("DEPLOYER_PK"));
            token = address(new MockToken(string.concat(_title(label), " Demo"), _upper(label), vm.addr(vm.envUint("ISSUER_PK")), 10_000_000 ether));
            vm.stopBroadcast();
        }
        bytes32 id = _postIfNeeded(_manifest(token, label, string.concat(_title(label), " Demo"), _upper(label)));
        _verifyAndLog(id, vm.envUint("ISSUER_PK"));
    }

    function postWindow(string calldata label, uint32 windowSecs) external {
        demoWindowSecs = windowSecs;
        post(label);
    }

    function mismatch() external {
        _load();
        address token = vm.parseJsonAddress(vm.readFile("./addresses.json"), ".xyzToken");
        bytes32 id = _postIfNeeded(_manifest(token, "xyz", "XYZ Labs", "XYZ"));

        address impostor = vm.addr(uint256(keccak256("xyz-impostor")));
        bytes memory teamDns = NameCoder.encode("team.xyz.plainsight.eth");

        address issuer = vm.addr(vm.envUint("ISSUER_PK"));
        uint64 nonce = vm.getNonce(issuer);
        vm.prank(issuer);
        try IAddressSetter(resolver).setAddress(teamDns, 60, abi.encodePacked(impostor)) {
            revert("issuer was able to change ENS: names are NOT locked");
        } catch (bytes memory err) {
            console2.log("Issuer setAddress(team.xyz) reverted as expected, selector:");
            console2.logBytes4(bytes4(err));
        }
        vm.setNonceUnsafe(issuer, nonce);

        vm.startBroadcast(vm.envUint("DEPLOYER_PK"));
        IAddressSetter(resolver).setAddress(teamDns, 60, abi.encodePacked(impostor));
        vm.stopBroadcast();
        console2.log("DEMO tamper: team.xyz.plainsight.eth now points to", impostor);

        (bool ok, uint8 failed) = _verifyAndLog(id, vm.envUint("ISSUER_PK"));
        require(!ok && failed == 3, "expected verify to fail on check 3");
        try launcher.launch(id, LaunchTerms(1_000_000 ether, 500_000, 100)) {
            revert("launch should be blocked");
        } catch (bytes memory err) {
            console2.log("launch(xyz) reverted (NotVerified), selector:");
            console2.logBytes4(bytes4(err));
        }
    }

    function revertCase() external {
        _load();
        bytes32 id = registry.idOf("nomanifest");
        try launcher.verify(id) {
            revert("verify should revert without a manifest");
        } catch (bytes memory err) {
            console2.log("verify(nomanifest) reverted: ManifestMissing =", bytes4(err) == ILauncher.ManifestMissing.selector);
        }
        try launcher.launch(id, LaunchTerms(1_000_000 ether, 500_000, 100)) {
            revert("launch should revert without a manifest");
        } catch (bytes memory err) {
            console2.log("launch(nomanifest) reverted: ManifestMissing =", bytes4(err) == ILauncher.ManifestMissing.selector);
        }
    }

    function repairXyz() external {
        _load();
        Manifest memory m = registry.get(registry.idOf("xyz"));
        vm.startBroadcast(vm.envUint("DEPLOYER_PK"));
        IAddressSetter(resolver).setAddress(
            NameCoder.encode("team.xyz.plainsight.eth"), 60, abi.encodePacked(m.allocations[0].wallet)
        );
        vm.stopBroadcast();
        _verifyAndLog(registry.idOf("xyz"), vm.envUint("ISSUER_PK"));
    }

    function _postIfNeeded(Manifest memory m) internal returns (bytes32 id) {
        id = registry.idOf(m.ensLabel);
        if (registry.status(id) != ManifestStatus.None) {
            console2.log("Already posted:", string.concat(m.ensLabel, ".plainsight.eth"));
            return id;
        }
        uint256 total;
        for (uint256 i; i < m.allocations.length; ++i) {
            total += m.allocations[i].amount;
        }
        vm.startBroadcast(vm.envUint("ISSUER_PK"));
        IERC20(m.token).approve(address(launcher), total);
        launcher.postManifest(m);
        vm.stopBroadcast();
        console2.log("Posted manifest and ENS names for", string.concat(m.ensLabel, ".plainsight.eth"));
    }

    function _verifyAndLog(bytes32 id, uint256 pk) internal returns (bool ok, uint8 failed) {
        vm.startBroadcast(pk);
        (ok, failed) = launcher.verify(id);
        vm.stopBroadcast();
        CheckStatus[8] memory st = launcher.checks(id);
        console2.log(CHECK_NAMES);
        for (uint256 i; i < 8; ++i) {
            string memory s = st[i] == CheckStatus.Passed ? "passed" : st[i] == CheckStatus.Failed ? "FAILED" : "not configured";
            console2.log(string.concat("  check ", vm.toString(i + 1), ": ", s));
        }
        console2.log(ok ? "verify: OK, launch unblocked" : string.concat("verify: BLOCKED at check ", vm.toString(failed)));
    }

    function _manifest(address token, string memory label, string memory name, string memory symbol)
        internal
        view
        returns (Manifest memory m)
    {
        m.token = token;
        m.ensLabel = label;
        m.issuer = vm.addr(vm.envUint("ISSUER_PK"));
        m.allocations = new Allocation[](2);
        m.allocations[0] = Allocation("team", true, _wallet(label, "team"), 200_000 ether, address(0), uint64(block.timestamp + 365 days), 0);
        m.allocations[1] = Allocation("investors", true, _wallet(label, "investors"), 100_000 ether, address(0), uint64(block.timestamp + 180 days), 0);
        m.mm = MarketMakerDeal({wallet: _wallet(label, "mm"), loanAmount: 50_000 ether, strikeUsdc: 1_200_000, kpis: "2% depth within 1%, 99% uptime"});
        m.agent = _wallet(label, "agent");
        m.greenshoeBps = 1500;
        m.windowSecs = demoWindowSecs == 0 ? 30 days : demoWindowSecs;
        m.rangeDepthBps = 1000;
        m.agentOperator = "Vandergrid";
        m.insiderFeeBps = 300;
        m.minRaise = 800_000e6;

        string memory json = string.concat(
            '{"name":"', name, '","symbol":"', symbol, '","ens":"', label, '.plainsight.eth","token":"', vm.toString(token),
            '","team":"', vm.toString(m.allocations[0].wallet), '","investors":"', vm.toString(m.allocations[1].wallet),
            '","mm":"', vm.toString(m.mm.wallet), '","agent":"', vm.toString(m.agent),
            '","greenshoeBps":1500,"windowSecs":', vm.toString(uint256(m.windowSecs)), ',"rangeDepthBps":1000}'
        );
        m.manifestHash = keccak256(bytes(json));
        m.jsonURI = string.concat("data:application/json;base64,", Base64.encode(bytes(json)));
    }

    function _wallet(string memory label, string memory role) internal pure returns (address) {
        return vm.addr(uint256(keccak256(abi.encodePacked("plainsight-demo/", label, "/", role))));
    }

    function _title(string memory s) internal pure returns (string memory) {
        bytes memory b = bytes(string.concat(s));
        if (b.length > 0 && b[0] >= "a" && b[0] <= "z") b[0] = bytes1(uint8(b[0]) - 32);
        return string(b);
    }

    function _upper(string memory s) internal pure returns (string memory) {
        bytes memory b = bytes(s);
        for (uint256 i; i < b.length; ++i) {
            if (b[i] >= "a" && b[i] <= "z") b[i] = bytes1(uint8(b[i]) - 32);
        }
        return string(b);
    }
}
