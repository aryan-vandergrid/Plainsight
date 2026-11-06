// SPDX-License-Identifier: MIT
pragma solidity 0.8.25;

import {Script, console2} from "forge-std/Script.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {StateLibrary} from "@uniswap/v4-core/src/libraries/StateLibrary.sol";

import {GreenshoeVault} from "../../src/GreenshoeVault.sol";
import {TestUSDC} from "../../src/mocks/TestUSDC.sol";
import {UniswapConfig} from "../UniswapConfig.sol";
import {DemoPools} from "./DemoPools.sol";
import {IUniversalRouter, UniversalRouterSwap} from "./UniversalRouterSwap.sol";

contract StrongDemand is Script {
    using StateLibrary for IPoolManager;

    function run(string calldata label) external {
        buy(label, 10, 5_000);
    }

    function buy(string calldata label, uint256 n, uint256 usdcEach) public {
        DemoPools.Pools memory p = DemoPools.load(label, false);
        address buyer = vm.addr(vm.envUint("DEPLOYER_PK"));
        TestUSDC usdc = TestUSDC(p.usdc);
        uint128 each = uint128(usdcEach * 1e6);
        (, int24 before,,) = IPoolManager(UniswapConfig.POOL_MANAGER).getSlot0(p.key.toId());

        vm.startBroadcast(vm.envUint("DEPLOYER_PK"));
        DemoPools.approveRouter(p.usdc);
        for (uint256 have = usdc.balanceOf(buyer); have < uint256(each) * n;) {
            usdc.mint(buyer, usdc.MAX_MINT());
            have += usdc.MAX_MINT();
        }
        for (uint256 i; i < n; ++i) {
            (bytes memory c, bytes[] memory inputs) = UniversalRouterSwap.single(p.key, p.usdc < p.token, each, 0);
            IUniversalRouter(UniversalRouterSwap.ROUTER).execute(c, inputs, block.timestamp + 600);
        }
        vm.stopBroadcast();

        (, int24 afterTick,,) = IPoolManager(UniswapConfig.POOL_MANAGER).getSlot0(p.key.toId());
        GreenshoeVault vault = GreenshoeVault(vm.parseJsonAddress(vm.readFile("./addresses.json"), ".greenshoeVault"));
        GreenshoeVault.Status memory st = vault.status(p.id);
        console2.log("buys:", n);
        console2.log("tick before / after:");
        console2.logInt(before);
        console2.logInt(afterTick);
        console2.log("tokens the wall bought back (expect 0):", st.tokensBought);
        console2.log("USDC standing + unplaced (all of it returns at settle):", st.usdcInWall + st.usdcUnplaced);
    }
}
