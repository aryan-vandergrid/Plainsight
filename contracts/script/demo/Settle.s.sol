// SPDX-License-Identifier: MIT
pragma solidity 0.8.25;

import {Script, console2} from "forge-std/Script.sol";

import {GreenshoeVault} from "../../src/GreenshoeVault.sol";
import {ManifestRegistry} from "../../src/ManifestRegistry.sol";

contract Settle is Script {
    function preview(string calldata label) public view returns (bool ready) {
        (GreenshoeVault vault, bytes32 id) = _load(label);
        GreenshoeVault.Sale memory s = vault.sale(id);
        GreenshoeVault.Status memory st = vault.status(id);
        uint256 endsAt = uint256(s.collectedAt) + s.windowSecs;
        console2.log("reserve (USDC base units):", s.reserve);
        console2.log("  standing in the wall:   ", st.usdcInWall);
        console2.log("  never placed:           ", st.usdcUnplaced);
        console2.log("tokens bought back (to burn):", st.tokensBought);
        if (s.settled) {
            console2.log("already settled: burned / returned", s.tokensBurned, s.usdcReturned);
            return false;
        }
        ready = block.timestamp >= endsAt;
        if (ready) console2.log("window over: settle is open");
        else console2.log("window open for another (seconds):", endsAt - block.timestamp);
    }

    function run(string calldata label) external {
        require(preview(label), "nothing to settle yet (see the preview above)");
        (GreenshoeVault vault, bytes32 id) = _load(label);
        vm.startBroadcast(vm.envUint("DEPLOYER_PK"));
        vault.settle(id);
        vm.stopBroadcast();
        GreenshoeVault.Sale memory s = vault.sale(id);
        console2.log("Settled. Tokens burned (to 0x...dEaD):", s.tokensBurned);
        console2.log("USDC returned to the issuer (base units):", s.usdcReturned);
    }

    function _load(string calldata label) internal view returns (GreenshoeVault vault, bytes32 id) {
        string memory json = vm.readFile("./addresses.json");
        vault = GreenshoeVault(vm.parseJsonAddress(json, ".greenshoeVault"));
        id = ManifestRegistry(vm.parseJsonAddress(json, ".manifestRegistry")).idOf(label);
        require(vault.sale(id).collected, "the auction hasn't been collected: run Bidders settle first");
    }
}
