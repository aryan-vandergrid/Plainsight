// SPDX-License-Identifier: MIT
pragma solidity 0.8.25;

import {Script, console2} from "forge-std/Script.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {StateLibrary} from "@uniswap/v4-core/src/libraries/StateLibrary.sol";
import {TickMath} from "@uniswap/v4-core/src/libraries/TickMath.sol";
import {PoolModifyLiquidityTest} from "@uniswap/v4-core/src/test/PoolModifyLiquidityTest.sol";
import {ModifyLiquidityParams} from "@uniswap/v4-core/src/types/PoolOperation.sol";

import {PlainsightHook} from "../../src/PlainsightHook.sol";
import {UniswapConfig} from "../UniswapConfig.sol";
import {DemoPools} from "./DemoPools.sol";
import {IUniversalRouter, UniversalRouterSwap} from "./UniversalRouterSwap.sol";

contract Pause is Script {
    using StateLibrary for IPoolManager;

    bytes32 internal constant REASON = "VOLATILITY";

    function run(string calldata label) external {
        pause(label);
        _swapFails(label);
        _withdrawWorks(label);
        unpause(label);
    }

    function resume(string calldata label) external {
        DemoPools.Pools memory p = DemoPools.load(label, false);
        require(p.hook.paused(p.key.toId()), "pool isn't paused");
        _withdrawWorks(label);
        unpause(label);
    }

    function pause(string calldata label) public {
        DemoPools.Pools memory p = DemoPools.load(label, false);
        uint256 agentPk = DemoPools.demoKey(label, "agent");
        _gas(vm.addr(agentPk));
        vm.startBroadcast(agentPk);
        p.hook.pause(p.key.toId(), REASON, "Agent halt: abnormal sell pressure, reviewing flow");
        vm.stopBroadcast();
        console2.log("paused:", p.hook.paused(p.key.toId()));
    }

    function unpause(string calldata label) public {
        DemoPools.Pools memory p = DemoPools.load(label, false);
        vm.startBroadcast(DemoPools.demoKey(label, "agent"));
        p.hook.unpause(p.key.toId());
        vm.stopBroadcast();
        console2.log("paused:", p.hook.paused(p.key.toId()));
    }

    function _swapFails(string calldata label) internal {
        DemoPools.Pools memory p = DemoPools.load(label, false);
        (bytes memory commands, bytes[] memory inputs) = UniversalRouterSwap.single(p.key, p.token > p.usdc, 1_000e6, 0);
        address me = vm.addr(vm.envUint("DEPLOYER_PK"));
        uint64 nonce = vm.getNonce(me);
        vm.prank(me);
        try IUniversalRouter(UniversalRouterSwap.ROUTER).execute(commands, inputs, block.timestamp + 600) {
            revert("swap went through while paused");
        } catch {
            console2.log("swap while paused: reverted (PoolPaused)");
        }
        vm.setNonceUnsafe(me, nonce);
    }

    function _withdrawWorks(string calldata label) internal {
        DemoPools.Pools memory p = DemoPools.load(label, false);
        int24 lo = TickMath.minUsableTick(60);
        int24 hi = TickMath.maxUsableTick(60);
        (uint128 liq,,) = IPoolManager(UniswapConfig.POOL_MANAGER).getPositionInfo(
            p.key.toId(), UniswapConfig.LIQUIDITY_ROUTER, lo, hi, bytes32(0)
        );
        require(liq > 0, "no demo LP to withdraw: run demo/Dump.s.sol first");
        vm.startBroadcast(vm.envUint("DEPLOYER_PK"));
        PoolModifyLiquidityTest(UniswapConfig.LIQUIDITY_ROUTER).modifyLiquidity(
            p.key, ModifyLiquidityParams(lo, hi, -int256(uint256(liq / 10)), bytes32(0)), ""
        );
        vm.stopBroadcast();
        console2.log("LP withdrawal while paused: done (10% of the demo liquidity)");
    }

    function _gas(address who) internal {
        if (who.balance >= 0.005 ether) return;
        vm.startBroadcast(vm.envUint("DEPLOYER_PK"));
        payable(who).transfer(0.01 ether);
        vm.stopBroadcast();
    }
}
