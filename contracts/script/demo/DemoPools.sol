// SPDX-License-Identifier: MIT
pragma solidity 0.8.25;

import {Vm} from "forge-std/Vm.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";

import {GreenshoeVault} from "../../src/GreenshoeVault.sol";
import {ManifestRegistry} from "../../src/ManifestRegistry.sol";
import {PlainsightHook} from "../../src/PlainsightHook.sol";
import {IPermit2Allowance} from "../../src/interfaces/ICCA.sol";
import {UniswapConfig} from "../UniswapConfig.sol";
import {plainKey} from "./PlainLaunch.s.sol";
import {UniversalRouterSwap} from "./UniversalRouterSwap.sol";

library DemoPools {
    Vm internal constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));

    struct Pools {
        bytes32 id;
        PoolKey key;
        PoolKey plain;
        address token;
        address plainToken;
        address usdc;
        PlainsightHook hook;
    }

    function load(string memory label, bool needPlain) internal view returns (Pools memory p) {
        string memory json = vm.readFile("./addresses.json");
        GreenshoeVault vault = GreenshoeVault(vm.parseJsonAddress(json, ".greenshoeVault"));
        p.id = ManifestRegistry(vm.parseJsonAddress(json, ".manifestRegistry")).idOf(label);
        require(vault.sale(p.id).poolOpened, "the Plainsight pool isn't open");
        p.key = vault.poolKey(p.id);
        p.token = vault.sale(p.id).token;
        p.usdc = vm.parseJsonAddress(json, ".usdc");
        p.hook = PlainsightHook(vm.parseJsonAddress(json, ".plainsightHook"));
        if (needPlain) {
            string memory cmp = vm.readFile("./compare.json");
            require(keccak256(bytes(vm.parseJsonString(cmp, ".label"))) == keccak256(bytes(label)), "run demo/PlainLaunch.s.sol for this label");
            p.plainToken = vm.parseJsonAddress(cmp, ".token");
            p.plain = plainKey(p.plainToken, p.usdc);
        }
    }

    function demoKey(string memory label, string memory role) internal pure returns (uint256) {
        return uint256(keccak256(abi.encodePacked("plainsight-demo/", label, "/", role)));
    }

    function approveRouter(address token) internal {
        IERC20(token).approve(UniswapConfig.PERMIT2, type(uint256).max);
        IPermit2Allowance(UniswapConfig.PERMIT2).approve(token, UniversalRouterSwap.ROUTER, type(uint160).max, type(uint48).max);
    }
}
