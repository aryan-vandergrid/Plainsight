// SPDX-License-Identifier: MIT
pragma solidity 0.8.25;

import {Script, console2} from "forge-std/Script.sol";
import {IHooks} from "@uniswap/v4-core/src/interfaces/IHooks.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {PoolId} from "@uniswap/v4-core/src/types/PoolId.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";

import {GreenshoeVault} from "../../src/GreenshoeVault.sol";
import {ManifestRegistry} from "../../src/ManifestRegistry.sol";
import {MockToken} from "../../src/mocks/MockToken.sol";
import {UniswapConfig} from "../UniswapConfig.sol";

function plainKey(address token, address usdc) pure returns (PoolKey memory) {
    (address c0, address c1) = token < usdc ? (token, usdc) : (usdc, token);
    return PoolKey(Currency.wrap(c0), Currency.wrap(c1), 3000, 60, IHooks(address(0)));
}

contract PlainLaunch is Script {
    function run(string calldata label) external {
        string memory json = vm.readFile("./addresses.json");
        ManifestRegistry registry = ManifestRegistry(vm.parseJsonAddress(json, ".manifestRegistry"));
        GreenshoeVault vault = GreenshoeVault(vm.parseJsonAddress(json, ".greenshoeVault"));
        address usdc = vm.parseJsonAddress(json, ".usdc");
        GreenshoeVault.Sale memory s = vault.sale(registry.idOf(label));
        require(s.poolOpened, "collectAndPlace first: the Plainsight pool isn't open");

        vm.startBroadcast(vm.envUint("DEPLOYER_PK"));
        MockToken pln = new MockToken("Plain Launch", "PLN", vm.addr(vm.envUint("DEPLOYER_PK")), 0);
        PoolKey memory key = plainKey(address(pln), usdc);
        IPoolManager(UniswapConfig.POOL_MANAGER).initialize(key, sqrtPriceAt(s.clearingPriceQ96, address(pln) < usdc));
        vm.stopBroadcast();

        PoolId pid = key.toId();
        string memory o = "plain";
        vm.serializeAddress(o, "token", address(pln));
        vm.serializeString(o, "label", label);
        string memory out = vm.serializeBytes32(o, "poolId", PoolId.unwrap(pid));
        vm.writeJson(out, "./compare.json");
        vm.writeJson(out, "../web/lib/compare.json");
        console2.log("Plain Launch (PLN)", address(pln));
        console2.log("Plain pool id");
        console2.logBytes32(PoolId.unwrap(pid));
    }

    function sqrtPriceAt(uint256 q, bool tokenIs0) public pure returns (uint160) {
        return uint160(tokenIs0 ? Math.sqrt(q << 96) : Math.sqrt((uint256(1) << 192) / q) << 48);
    }
}
