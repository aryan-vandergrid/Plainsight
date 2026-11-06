// SPDX-License-Identifier: MIT
pragma solidity 0.8.25;

import {Script, console2} from "forge-std/Script.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";

import {PlainsightHook} from "../../src/PlainsightHook.sol";
import {TestUSDC} from "../../src/mocks/TestUSDC.sol";
import {DemoPools} from "./DemoPools.sol";
import {IUniversalRouter, UniversalRouterSwap} from "./UniversalRouterSwap.sol";

contract WashBot is Script {
    function run(string calldata label) external {
        wash(label, 200, 375_000, 20);
    }

    function wash(string calldata label, uint256 roundTrips, uint256 usdcPerTrip, uint256 perTx) public {
        DemoPools.Pools memory p = DemoPools.load(label, true);
        PlainsightHook.Totals memory before = p.hook.stats(p.key.toId());
        address bot = vm.addr(vm.envUint("DEPLOYER_PK"));
        TestUSDC usdc = TestUSDC(p.usdc);
        uint128 stake = uint128(usdcPerTrip * 1e6);
        uint256 txs = (roundTrips + perTx - 1) / perTx;

        vm.startBroadcast(vm.envUint("DEPLOYER_PK"));
        DemoPools.approveRouter(p.usdc);
        for (uint256 have = usdc.balanceOf(bot); have < stake * 2 * txs;) {
            usdc.mint(bot, usdc.MAX_MINT());
            have += usdc.MAX_MINT();
        }
        for (uint256 t; t < txs; ++t) {
            uint256 n = t == txs - 1 ? roundTrips - perTx * t : perTx;
            _trip(p.key, p.token, p.usdc, stake, n);
            _trip(p.plain, p.plainToken, p.usdc, stake, n);
        }
        vm.stopBroadcast();

        PlainsightHook.Totals memory a = p.hook.stats(p.key.toId());
        console2.log("Round trips per pool:", roundTrips);
        console2.log("Plain pool: every leg is reported volume (USDC, whole), about", roundTrips * usdcPerTrip * 2);
        console2.log("Plainsight real volume added (USDC, whole):", (a.realVolume - before.realVolume) / 1e6);
        console2.log("Plainsight fake volume added (USDC, whole):", (a.fakeVolume - before.fakeVolume) / 1e6);
        console2.log("Round trips flagged:", a.roundTrips - before.roundTrips);
        console2.log("Penalties to the treasury (USDC, whole):", (a.penaltyUsdc - before.penaltyUsdc) / 1e6);
    }

    function _trip(PoolKey memory key, address token, address usdc, uint128 stake, uint256 n) internal {
        (bytes memory commands, bytes[] memory inputs) = UniversalRouterSwap.roundTrips(key, token < usdc, stake, n);
        IUniversalRouter(UniversalRouterSwap.ROUTER).execute(commands, inputs, block.timestamp + 600);
    }
}
