// SPDX-License-Identifier: MIT
pragma solidity 0.8.25;

import {Script, console2} from "forge-std/Script.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {StateLibrary} from "@uniswap/v4-core/src/libraries/StateLibrary.sol";
import {TickMath} from "@uniswap/v4-core/src/libraries/TickMath.sol";
import {PoolModifyLiquidityTest} from "@uniswap/v4-core/src/test/PoolModifyLiquidityTest.sol";
import {PoolSwapTest} from "@uniswap/v4-core/src/test/PoolSwapTest.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {ModifyLiquidityParams, SwapParams} from "@uniswap/v4-core/src/types/PoolOperation.sol";
import {LiquidityAmounts} from "v4-periphery/src/libraries/LiquidityAmounts.sol";

import {GreenshoeVault} from "../../src/GreenshoeVault.sol";
import {ManifestRegistry} from "../../src/ManifestRegistry.sol";
import {MockToken} from "../../src/mocks/MockToken.sol";
import {TestUSDC} from "../../src/mocks/TestUSDC.sol";
import {UniswapConfig} from "../UniswapConfig.sol";
import {plainKey} from "./PlainLaunch.s.sol";

contract Dump is Script {
    using StateLibrary for IPoolManager;

    IPoolManager internal constant PM = IPoolManager(UniswapConfig.POOL_MANAGER);

    function run(string calldata label) external {
        (PoolKey memory pk, PoolKey memory plain, MockToken token, MockToken pln) = _keys(label);
        _seed(pk, token, 150_000 ether);
        _seed(plain, pln, 150_000 ether);
        _report("before", label, pk, plain, token, pln);
        _dump(pk, token, 100_000 ether);
        _dump(plain, pln, 100_000 ether);
        _report("after a 100,000-token dump", label, pk, plain, token, pln);
    }

    function seed(string calldata label, uint256 wholeTokens) external {
        (PoolKey memory pk, PoolKey memory plain, MockToken token, MockToken pln) = _keys(label);
        _seed(pk, token, wholeTokens * 1 ether);
        _seed(plain, pln, wholeTokens * 1 ether);
    }

    function dump(string calldata label, uint256 wholeTokens) external {
        (PoolKey memory pk, PoolKey memory plain, MockToken token, MockToken pln) = _keys(label);
        _dump(pk, token, wholeTokens * 1 ether);
        _dump(plain, pln, wholeTokens * 1 ether);
        _report("after the dump", label, pk, plain, token, pln);
    }

    function _keys(string calldata label)
        internal
        view
        returns (PoolKey memory pk, PoolKey memory plain, MockToken token, MockToken pln)
    {
        string memory json = vm.readFile("./addresses.json");
        GreenshoeVault vault = GreenshoeVault(vm.parseJsonAddress(json, ".greenshoeVault"));
        bytes32 id = ManifestRegistry(vm.parseJsonAddress(json, ".manifestRegistry")).idOf(label);
        require(vault.sale(id).poolOpened, "the Plainsight pool isn't open");
        pk = vault.poolKey(id);
        token = MockToken(vault.sale(id).token);
        string memory cmp = vm.readFile("./compare.json");
        require(keccak256(bytes(vm.parseJsonString(cmp, ".label"))) == keccak256(bytes(label)), "run demo/PlainLaunch.s.sol for this label");
        pln = MockToken(vm.parseJsonAddress(cmp, ".token"));
        plain = plainKey(address(pln), vm.parseJsonAddress(json, ".usdc"));
    }

    function _seed(PoolKey memory key, MockToken token, uint256 tokens) internal {
        (uint160 sqrtP,,,) = PM.getSlot0(key.toId());
        bool tokenIs0 = Currency.unwrap(key.currency0) == address(token);
        TestUSDC usdc = TestUSDC(Currency.unwrap(tokenIs0 ? key.currency1 : key.currency0));
        int24 lo = TickMath.minUsableTick(key.tickSpacing);
        int24 hi = TickMath.maxUsableTick(key.tickSpacing);
        uint256 usdcAmt = tokens * _usdcPerToken(sqrtP, tokenIs0) / 1 ether;
        (uint256 a0, uint256 a1) = tokenIs0 ? (tokens, usdcAmt) : (usdcAmt, tokens);
        uint128 liq = LiquidityAmounts.getLiquidityForAmounts(
            sqrtP, TickMath.getSqrtPriceAtTick(lo), TickMath.getSqrtPriceAtTick(hi), a0, a1
        );
        address me = vm.addr(vm.envUint("DEPLOYER_PK"));
        vm.startBroadcast(vm.envUint("DEPLOYER_PK"));
        token.mint(me, tokens + tokens / 100);
        for (uint256 left = usdcAmt + usdcAmt / 100; left > 0;) {
            uint256 m = left > usdc.MAX_MINT() ? usdc.MAX_MINT() : left;
            usdc.mint(me, m);
            left -= m;
        }
        token.approve(UniswapConfig.LIQUIDITY_ROUTER, type(uint256).max);
        usdc.approve(UniswapConfig.LIQUIDITY_ROUTER, type(uint256).max);
        PoolModifyLiquidityTest(UniswapConfig.LIQUIDITY_ROUTER).modifyLiquidity(
            key, ModifyLiquidityParams(lo, hi, int256(uint256(liq)), bytes32(0)), ""
        );
        vm.stopBroadcast();
    }

    function _dump(PoolKey memory key, MockToken token, uint256 amount) internal {
        bool zeroForOne = Currency.unwrap(key.currency0) == address(token);
        vm.startBroadcast(vm.envUint("DEPLOYER_PK"));
        token.mint(vm.addr(vm.envUint("DEPLOYER_PK")), amount);
        token.approve(UniswapConfig.SWAP_ROUTER, type(uint256).max);
        PoolSwapTest(UniswapConfig.SWAP_ROUTER).swap(
            key,
            SwapParams(zeroForOne, -int256(amount), zeroForOne ? TickMath.MIN_SQRT_PRICE + 1 : TickMath.MAX_SQRT_PRICE - 1),
            PoolSwapTest.TestSettings(false, false),
            ""
        );
        vm.stopBroadcast();
    }

    function _report(string memory when, string memory label, PoolKey memory pk, PoolKey memory plain, MockToken token, MockToken pln)
        internal
        view
    {
        (uint160 a,,,) = PM.getSlot0(pk.toId());
        (uint160 b,,,) = PM.getSlot0(plain.toId());
        console2.log(when);
        console2.log(string.concat("  ", label, " (Plainsight) price, USDC base units per token:"), _usdcPerToken(a, Currency.unwrap(pk.currency0) == address(token)));
        console2.log("  PLN (plain) price, USDC base units per token:", _usdcPerToken(b, Currency.unwrap(plain.currency0) == address(pln)));
    }

    function _usdcPerToken(uint160 sqrtP, bool tokenIs0) internal pure returns (uint256) {
        uint256 pX96 = uint256(sqrtP) * uint256(sqrtP) >> 96;
        return tokenIs0 ? (pX96 * 1 ether) >> 96 : (uint256(1) << 96) * 1 ether / pX96;
    }
}
