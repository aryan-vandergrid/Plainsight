// SPDX-License-Identifier: MIT
pragma solidity 0.8.25;

import {IHooks} from "@uniswap/v4-core/src/interfaces/IHooks.sol";
import {TickMath} from "@uniswap/v4-core/src/libraries/TickMath.sol";
import {PoolModifyLiquidityTest} from "@uniswap/v4-core/src/test/PoolModifyLiquidityTest.sol";
import {PoolSwapTest} from "@uniswap/v4-core/src/test/PoolSwapTest.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {ModifyLiquidityParams, SwapParams} from "@uniswap/v4-core/src/types/PoolOperation.sol";
import {LiquidityAmounts} from "v4-periphery/src/libraries/LiquidityAmounts.sol";

import {MockToken} from "../../src/mocks/MockToken.sol";
import {IContinuousClearingAuction} from "../../src/interfaces/ICCA.sol";
import {Manifest} from "../../src/interfaces/IManifest.sol";
import {LaunchStack} from "./LaunchStack.sol";

abstract contract PoolStack is LaunchStack {
    uint256 internal constant Q96 = 1 << 96;
    uint32 internal constant BLOCKS = 100;

    PoolSwapTest internal swapRouter;
    PoolModifyLiquidityTest internal lpRouter;
    address internal lp = makeAddr("lp");
    address internal dumper = makeAddr("dumper");

    function _deployPoolStack() internal {
        _deployStack();
        swapRouter = new PoolSwapTest(poolManager);
        lpRouter = new PoolModifyLiquidityTest(poolManager);
    }

    function _graduate(MockToken token, string memory label) internal returns (bytes32 id, IContinuousClearingAuction a) {
        Manifest memory m = _abcManifest(address(token), label);
        vm.startPrank(issuer);
        token.approve(address(launcher), type(uint256).max);
        id = launcher.postManifest(m);
        a = IContinuousClearingAuction(launcher.launch(id, _terms(BLOCKS)));
        vm.stopPrank();
        vm.roll(a.startBlock());
        _bid(a, makeAddr(string.concat("whale-", label)), 120, 1_150_000e6);
        vm.roll(a.endBlock());
        vault.collectAndPlace(id);
    }

    function _tokenAt(address at, string memory sym) internal returns (MockToken) {
        deployCodeTo("MockToken.sol:MockToken", abi.encode(sym, sym, issuer, 10_000_000 ether), at);
        return MockToken(at);
    }

    function _mirror(address t) internal view returns (address) {
        return t < address(usdc) ? address(uint160(t) - 7) : address(uint160(t) + 7);
    }

    function _mirrorSqrt(uint160 sqrtP, address, address) internal pure returns (uint160) {
        return sqrtP;
    }

    function _plainKey(address token) internal view returns (PoolKey memory) {
        (address c0, address c1) = token < address(usdc) ? (token, address(usdc)) : (address(usdc), token);
        return PoolKey(Currency.wrap(c0), Currency.wrap(c1), 3000, 60, IHooks(address(0)));
    }

    function _addFullRange(PoolKey memory key, address token, uint256 tokens, uint160 sqrtP) internal {
        int24 lo = TickMath.minUsableTick(60);
        int24 hi = TickMath.maxUsableTick(60);
        bool tokenIs0 = Currency.unwrap(key.currency0) == token;
        uint256 usdcAmt = tokens * _q96ToUsdcPerToken(sqrtP, tokenIs0) / 1e18;
        (uint256 a0, uint256 a1) = tokenIs0 ? (tokens, usdcAmt) : (usdcAmt, tokens);
        uint128 liq = LiquidityAmounts.getLiquidityForAmounts(sqrtP, TickMath.getSqrtPriceAtTick(lo), TickMath.getSqrtPriceAtTick(hi), a0, a1);
        MockToken(token).mint(lp, tokens * 2);
        deal(address(usdc), lp, usdc.balanceOf(lp) + usdcAmt * 2);
        vm.startPrank(lp);
        MockToken(token).approve(address(lpRouter), type(uint256).max);
        usdc.approve(address(lpRouter), type(uint256).max);
        lpRouter.modifyLiquidity(key, ModifyLiquidityParams(lo, hi, int256(uint256(liq)), 0), "");
        vm.stopPrank();
    }

    function _dump(PoolKey memory key, MockToken token, uint256 amount) internal {
        token.mint(dumper, amount);
        bool zeroForOne = Currency.unwrap(key.currency0) == address(token);
        vm.startPrank(dumper);
        token.approve(address(swapRouter), type(uint256).max);
        swapRouter.swap(
            key,
            SwapParams(zeroForOne, -int256(amount), zeroForOne ? TickMath.MIN_SQRT_PRICE + 1 : TickMath.MAX_SQRT_PRICE - 1),
            PoolSwapTest.TestSettings(false, false),
            ""
        );
        vm.stopPrank();
    }

    function _buy(PoolKey memory key, uint256 usdcIn) internal {
        deal(address(usdc), dumper, usdc.balanceOf(dumper) + usdcIn);
        bool zeroForOne = Currency.unwrap(key.currency0) == address(usdc);
        vm.startPrank(dumper);
        usdc.approve(address(swapRouter), type(uint256).max);
        swapRouter.swap(
            key,
            SwapParams(zeroForOne, -int256(usdcIn), zeroForOne ? TickMath.MIN_SQRT_PRICE + 1 : TickMath.MAX_SQRT_PRICE - 1),
            PoolSwapTest.TestSettings(false, false),
            ""
        );
        vm.stopPrank();
    }

    function _q96ToUsdcPerToken(uint160 sqrtP, bool tokenIs0) internal pure returns (uint256) {
        uint256 pX96 = uint256(sqrtP) * uint256(sqrtP) / Q96;
        return tokenIs0 ? pX96 * 1e18 / Q96 : Q96 * 1e18 / pX96;
    }

    function _usdPrice(PoolKey memory key, uint160 sqrtP, address token) internal pure returns (uint256) {
        return _q96ToUsdcPerToken(sqrtP, Currency.unwrap(key.currency0) == token) * 1e12;
    }

    function _q96ToUsd(uint256 q) internal pure returns (uint256) {
        return q * 1e18 / Q96 * 1e12;
    }
}
