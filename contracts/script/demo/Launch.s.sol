// SPDX-License-Identifier: MIT
pragma solidity 0.8.25;

import {Script, console2} from "forge-std/Script.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {AuctionDeployer} from "../../src/AuctionDeployer.sol";
import {Launcher} from "../../src/Launcher.sol";
import {ManifestRegistry} from "../../src/ManifestRegistry.sol";
import {LaunchTerms} from "../../src/interfaces/ILauncher.sol";
import {Manifest} from "../../src/interfaces/IManifest.sol";

contract Launch is Script {
    function run(string calldata label, uint32 blocks) external {
        string memory json = vm.readFile("./addresses.json");
        Launcher launcher = Launcher(vm.parseJsonAddress(json, ".launcher"));
        ManifestRegistry registry = ManifestRegistry(vm.parseJsonAddress(json, ".manifestRegistry"));
        bytes32 id = registry.idOf(label);
        Manifest memory m = registry.get(id);

        LaunchTerms memory t = LaunchTerms({saleAmount: 1_000_000 ether, floorPriceUsdc: 500_000, durationBlocks: blocks});
        AuctionDeployer auctions = launcher.AUCTIONS();
        (uint128 supply,) = auctions.configFor(m.token, m.greenshoeBps, m.minRaise, t, uint64(block.number + 1));

        vm.startBroadcast(vm.envUint("ISSUER_PK"));
        if (IERC20(m.token).allowance(m.issuer, address(launcher)) < supply) {
            IERC20(m.token).approve(address(launcher), supply);
        }
        address auction = launcher.launch(id, t);
        vm.stopBroadcast();

        console2.log("Auction live for", string.concat(label, ".plainsight.eth"));
        console2.log("  CCA", auction);
        console2.log("  supply (whole tokens)", uint256(supply) / 1e18);
        console2.log("  ends at block", launcher.auctionInfo(id).endBlock);
    }
}
