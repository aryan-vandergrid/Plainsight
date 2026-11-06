// SPDX-License-Identifier: MIT
pragma solidity 0.8.25;

import {Script, console2} from "forge-std/Script.sol";

import {FlagRegistry} from "../src/FlagRegistry.sol";
import {PlainsightHook} from "../src/PlainsightHook.sol";
import {UniswapConfig} from "./UniswapConfig.sol";

contract DeployFlags is Script {
    function run() external returns (address flags) {
        string memory json = vm.readFile("./addresses.json");
        PlainsightHook hook = PlainsightHook(vm.parseJsonAddress(json, ".plainsightHook"));
        require(address(hook.flags()) == address(0), "hook already has a flag registry");
        uint256 pk = vm.envUint("DEPLOYER_PK");

        vm.startBroadcast(pk);
        flags = address(new FlagRegistry(UniswapConfig.CRE_SIM_FORWARDER, UniswapConfig.CRE_FORWARDER, vm.addr(pk)));
        hook.setFlagRegistry(FlagRegistry(flags));
        vm.stopBroadcast();

        vm.serializeJson("root", json);
        string memory out = vm.serializeAddress("root", "flagRegistry", flags);
        vm.writeJson(out, "./addresses.json");
        vm.writeJson(out, "../web/lib/addresses.json");
        console2.log("FlagRegistry:", flags);
        console2.log("wired into hook:", address(hook));
    }
}
