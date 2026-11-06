// SPDX-License-Identifier: MIT
pragma solidity 0.8.25;

import {Script, console2} from "forge-std/Script.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {PlainsightHook} from "../../src/PlainsightHook.sol";
import {MockToken} from "../../src/mocks/MockToken.sol";
import {DemoPools} from "./DemoPools.sol";
import {IUniversalRouter, UniversalRouterSwap} from "./UniversalRouterSwap.sol";

contract InsiderSell is Script {
    function run(string calldata label) external {
        sell(label, 20_000);
    }

    function sell(string calldata label, uint256 wholeTokens) public {
        DemoPools.Pools memory p = DemoPools.load(label, false);
        uint256 teamPk = DemoPools.demoKey(label, "team");
        address team = vm.addr(teamPk);
        uint128 amount = uint128(wholeTokens * 1 ether);
        bool tokenIs0 = p.token < p.usdc;
        uint24 fee = p.hook.feeFor(p.key.toId(), team, tokenIs0);
        console2.log("team wallet", team);
        console2.log("fee it will pay (pips; 3000 = the pool's 0.30%):", fee);

        vm.startBroadcast(vm.envUint("DEPLOYER_PK"));
        if (team.balance < 0.005 ether) payable(team).transfer(0.01 ether);
        MockToken(p.token).mint(team, amount);
        vm.stopBroadcast();

        uint256 before = IERC20(p.usdc).balanceOf(team);
        vm.startBroadcast(teamPk);
        DemoPools.approveRouter(p.token);
        (bytes memory commands, bytes[] memory inputs) = UniversalRouterSwap.single(p.key, tokenIs0, amount, 0);
        IUniversalRouter(UniversalRouterSwap.ROUTER).execute(commands, inputs, block.timestamp + 600);
        vm.stopBroadcast();

        PlainsightHook.Totals memory t = p.hook.stats(p.key.toId());
        console2.log("USDC received (base units):", IERC20(p.usdc).balanceOf(team) - before);
        console2.log("insider sells logged on the hook:", t.insiderSells);
    }
}
