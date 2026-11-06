// SPDX-License-Identifier: MIT
pragma solidity 0.8.25;

import {Script, console2} from "forge-std/Script.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {PlainsightHook} from "../../src/PlainsightHook.sol";
import {MockToken} from "../../src/mocks/MockToken.sol";
import {TestUSDC} from "../../src/mocks/TestUSDC.sol";
import {DemoPools} from "./DemoPools.sol";
import {IUniversalRouter, UniversalRouterSwap} from "./UniversalRouterSwap.sol";

contract FlowTrackDemo is Script {
    function run(string calldata label) external {
        DemoPools.Pools memory p = DemoPools.load(label, false);
        uint256 teamPk = DemoPools.demoKey(label, "team");
        uint256 freshPk = DemoPools.demoKey(label, "fresh-wallet");
        uint256 ringPk = DemoPools.demoKey(label, "wash-ring");
        address team = vm.addr(teamPk);
        address fresh = vm.addr(freshPk);
        address ring = vm.addr(ringPk);
        bool tokenIs0 = p.token < p.usdc;

        vm.startBroadcast(vm.envUint("DEPLOYER_PK"));
        _gas(team);
        _gas(fresh);
        _gas(ring);
        MockToken(p.token).mint(team, 20_000 ether);
        TestUSDC(p.usdc).mint(ring, 5_000e6);
        vm.stopBroadcast();

        vm.startBroadcast(teamPk);
        IERC20(p.token).transfer(fresh, 10_000 ether);
        vm.stopBroadcast();
        vm.startBroadcast(freshPk);
        DemoPools.approveRouter(p.token);
        _swap(p, tokenIs0, 2_000 ether);
        vm.stopBroadcast();

        vm.startBroadcast(ringPk);
        DemoPools.approveRouter(p.usdc);
        DemoPools.approveRouter(p.token);
        _swap(p, !tokenIs0, 5_000e6);
        vm.stopBroadcast();
        uint256 bought = IERC20(p.token).balanceOf(ring);
        vm.startBroadcast(ringPk);
        _swap(p, tokenIs0, uint128(bought));
        vm.stopBroadcast();

        console2.log("fresh wallet (funded by team.):", fresh);
        console2.log("ring wallet (cross-tx round trip):", ring);
        console2.log("fee each would pay to sell now (pips):", p.hook.feeFor(p.key.toId(), fresh, tokenIs0), p.hook.feeFor(p.key.toId(), ring, tokenIs0));
        console2.log("Next: run the CRE flag job, then sellAgain.");
    }

    function sellAgain(string calldata label) external {
        DemoPools.Pools memory p = DemoPools.load(label, false);
        uint256 freshPk = DemoPools.demoKey(label, "fresh-wallet");
        address fresh = vm.addr(freshPk);
        bool tokenIs0 = p.token < p.usdc;
        uint24 fee = p.hook.feeFor(p.key.toId(), fresh, tokenIs0);
        console2.log("fresh wallet fee now (pips; 3000 = pool fee):", fee);
        require(fee > 3000, "not flagged yet: run the CRE flag job first");
        PlainsightHook.Totals memory before = p.hook.stats(p.key.toId());
        vm.startBroadcast(freshPk);
        _swap(p, tokenIs0, 2_000 ether);
        vm.stopBroadcast();
        console2.log("insider-fee sells logged:", p.hook.stats(p.key.toId()).insiderSells - before.insiderSells);
    }

    function _swap(DemoPools.Pools memory p, bool zeroForOne, uint128 amountIn) internal {
        (bytes memory c, bytes[] memory inputs) = UniversalRouterSwap.single(p.key, zeroForOne, amountIn, 0);
        IUniversalRouter(UniversalRouterSwap.ROUTER).execute(c, inputs, block.timestamp + 600);
    }

    function _gas(address who) internal {
        if (who.balance < 0.003 ether) payable(who).transfer(0.005 ether);
    }
}
