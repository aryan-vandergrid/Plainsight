// SPDX-License-Identifier: MIT
pragma solidity 0.8.25;

import {IHooks} from "@uniswap/v4-core/src/interfaces/IHooks.sol";
import {LPFeeLibrary} from "@uniswap/v4-core/src/libraries/LPFeeLibrary.sol";
import {StateLibrary} from "@uniswap/v4-core/src/libraries/StateLibrary.sol";
import {TickMath} from "@uniswap/v4-core/src/libraries/TickMath.sol";
import {PoolModifyLiquidityTest} from "@uniswap/v4-core/src/test/PoolModifyLiquidityTest.sol";
import {PoolSwapTest} from "@uniswap/v4-core/src/test/PoolSwapTest.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {PoolId} from "@uniswap/v4-core/src/types/PoolId.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {ModifyLiquidityParams, SwapParams} from "@uniswap/v4-core/src/types/PoolOperation.sol";
import {LiquidityAmounts} from "v4-periphery/src/libraries/LiquidityAmounts.sol";

import {GreenshoeVault} from "../../src/GreenshoeVault.sol";
import {PlainsightHook} from "../../src/PlainsightHook.sol";
import {MockToken} from "../../src/mocks/MockToken.sol";
import {IContinuousClearingAuction} from "../../src/interfaces/ICCA.sol";
import {CheckStatus} from "../../src/interfaces/ILauncher.sol";
import {Manifest} from "../../src/interfaces/IManifest.sol";
import {PoolStack} from "../utils/PoolStack.sol";

contract PoolTest is PoolStack {
    function setUp() public {
        _deployPoolStack();
    }

    using StateLibrary for *;

    function test_collectAndPlace_opensPoolAtClearingPrice() public {
        (bytes32 id, IContinuousClearingAuction a) = _graduate(abc, "abc");
        GreenshoeVault.Sale memory s = vault.sale(id);
        assertTrue(s.poolOpened);
        PoolKey memory key = vault.poolKey(id);
        assertEq(address(key.hooks), address(hook));
        assertEq(key.fee, LPFeeLibrary.DYNAMIC_FEE_FLAG);

        (uint160 sqrtP,,, uint24 lpFee) = poolManager.getSlot0(key.toId());
        assertEq(sqrtP, s.openSqrtPriceX96);
        assertApproxEqRel(_usdPrice(key, sqrtP, address(abc)), _q96ToUsd(a.clearingPrice()), 1e13, "pool opens at the clearing price");
        assertEq(lpFee, 0);
        assertEq(hook.lockedUntil(key.toId()), s.collectedAt + 30 days);
        assertEq(uint8(launcher.checks(id)[7]), uint8(CheckStatus.Passed), "check 8: hook wired and flagged");
    }

    function test_rungsAreSingleSidedUsdc_tokenBelowUsdc() public {
        _assertSingleSided(_tokenAt(address(uint160(address(usdc)) - 1), "LOW"), "low");
    }

    function test_rungsAreSingleSidedUsdc_tokenAboveUsdc() public {
        _assertSingleSided(_tokenAt(address(uint160(address(usdc)) + 1), "HIGH"), "high");
    }

    function _assertSingleSided(MockToken t, string memory label) internal {
        (bytes32 id,) = _graduate(t, label);
        GreenshoeVault.Sale memory s = vault.sale(id);
        GreenshoeVault.Rung[] memory r = vault.rungsOf(id);
        GreenshoeVault.Status memory st = vault.status(id);
        assertEq(s.rungCount, 10, "ten equal rungs of 15k");
        assertEq(r.length, 6, "day 0: 60% of the reserve, the top six rungs");
        assertEq(st.tokensBought, 0, "no tokens in the wall before any sell");
        assertApproxEqAbs(st.usdcInWall, 90_000e6, 10);
        assertApproxEqAbs(st.usdcUnplaced, s.reserve - 90_000e6, 10);
        (, int24 tick,,) = poolManager.getSlot0(vault.poolKey(id).toId());
        bool tokenIs0 = address(t) < address(usdc);
        for (uint256 i; i < r.length; ++i) {
            assertGt(r[i].liquidity, 0);
            if (tokenIs0) assertLe(r[i].tickUpper, tick, "wall below the price");
            else assertGt(r[i].tickLower, tick, "wall above the tick (USD price below)");
            if (i > 0) assertEq(tokenIs0 ? r[i].tickUpper : r[i].tickLower, tokenIs0 ? r[i - 1].tickLower : r[i - 1].tickUpper, "rungs are contiguous");
        }
        int24 span = tokenIs0 ? r[0].tickUpper - r[r.length - 1].tickLower : r[r.length - 1].tickUpper - r[0].tickLower;
        assertApproxEqAbs(uint256(int256(span)), 619, 61, "6 of 10 rungs cover ~6% below the price");
    }

    function test_onlyVaultCanCreatePools() public {
        (bytes32 id,) = _graduate(abc, "abc");
        PoolKey memory key = vault.poolKey(id);
        key.tickSpacing = 10;
        vm.expectRevert();
        poolManager.initialize(key, TickMath.getSqrtPriceAtTick(0));
    }

    function test_vaultLiquidityLockedUntilWindowEnds() public {
        (bytes32 id,) = _graduate(abc, "abc");
        PoolKey memory key = vault.poolKey(id);
        GreenshoeVault.Rung memory r = vault.rungsOf(id)[0];
        ModifyLiquidityParams memory p = ModifyLiquidityParams(r.tickLower, r.tickUpper, -int256(uint256(r.liquidity)), id);
        uint64 until = hook.lockedUntil(key.toId());

        vm.prank(address(poolManager));
        vm.expectRevert(abi.encodeWithSelector(PlainsightHook.VaultLiquidityLocked.selector, until));
        hook.beforeRemoveLiquidity(address(vault), key, p, "");
        vm.prank(address(poolManager));
        assertEq(hook.beforeRemoveLiquidity(lp, key, p, ""), IHooks.beforeRemoveLiquidity.selector);
        vm.expectRevert(abi.encodeWithSelector(GreenshoeVault.WindowOpen.selector, until));
        vault.settle(id);
        vm.expectRevert(PlainsightHook.OnlyVault.selector);
        hook.registerPool(key, id, address(abc), address(this), 0, 1, 0);
    }

    function test_frontLoaded_replenishFollowsTheSchedule() public {
        (bytes32 id,) = _graduate(abc, "abc");
        uint64 t0 = vault.sale(id).collectedAt;
        vault.replenish(id);
        assertEq(vault.rungsOf(id).length, 6);
        GreenshoeVault.Status memory st = vault.status(id);
        assertEq(st.nextRungAt, t0 + 8 days, "70% is released on day 8");

        vm.warp(st.nextRungAt - 1);
        vault.replenish(id);
        assertEq(vault.rungsOf(id).length, 6, "not before");
        vm.warp(st.nextRungAt);
        vault.replenish(id);
        assertEq(vault.rungsOf(id).length, 7);
        assertEq(vault.status(id).nextRungAt, t0 + 15 days);

        vm.warp(t0 + 28 days);
        vault.replenish(id);
        assertEq(vault.rungsOf(id).length, 9, "the last rung waits for the last day");
        vm.warp(t0 + 29 days);
        vault.replenish(id);
        assertEq(vault.rungsOf(id).length, 10);
        st = vault.status(id);
        assertApproxEqAbs(st.usdcUnplaced, 0, 10);
        assertEq(st.nextRungAt, 0);
    }

    function test_replenishAfterDump_placesBelowCurrentPrice() public {
        (bytes32 id,) = _graduate(abc, "abc");
        PoolKey memory key = vault.poolKey(id);
        (uint160 open,,,) = poolManager.getSlot0(key.toId());
        _addFullRange(key, address(abc), 150_000 ether, open);
        _dump(key, abc, 100_000 ether);
        (uint160 sqrtP, int24 tick,,) = poolManager.getSlot0(key.toId());
        uint256 before = _usdPrice(key, sqrtP, address(abc));

        vm.warp(vault.status(id).nextRungAt);
        vault.replenish(id);
        GreenshoeVault.Rung[] memory r = vault.rungsOf(id);
        assertEq(r.length, 7, "day 8's rung placed");
        bool tokenIs0 = address(abc) < address(usdc);
        for (uint256 i = 6; i < 7; ++i) {
            assertGt(r[i].usdc, 0);
            if (tokenIs0) assertLe(r[i].tickUpper, tick, "below the current price");
            else assertGt(r[i].tickLower, tick, "below the current price");
        }
        (uint160 sqrtAfter,,,) = poolManager.getSlot0(key.toId());
        assertEq(sqrtAfter, sqrtP, "placing single-sided liquidity doesn't move the price");
        assertGe(before, 0.9e18, "still inside the band");
        assertApproxEqAbs(vault.status(id).usdcInWall, 15_000e6, 10, "the new 15k stands under the price");
    }

    function test_replenishBelowBandFloor_waits() public {
        (bytes32 id,) = _graduate(abc, "abc");
        PoolKey memory key = vault.poolKey(id);
        (uint160 open,,,) = poolManager.getSlot0(key.toId());
        _addFullRange(key, address(abc), 50_000 ether, open);
        _dump(key, abc, 400_000 ether);
        vm.warp(vault.status(id).nextRungAt);
        vault.replenish(id);
        assertEq(vault.rungsOf(id).length, 6, "nothing to place inside the band");
    }

    function test_dump_absorbedByWall_plainPoolCrashes() public {
        (bytes32 id,) = _graduate(abc, "abc");
        PoolKey memory key = vault.poolKey(id);
        (uint160 open,,,) = poolManager.getSlot0(key.toId());
        uint256 openUsd = _usdPrice(key, open, address(abc));

        MockToken pln = _tokenAt(_mirror(address(abc)), "PLN");
        PoolKey memory plain = _plainKey(address(pln));
        poolManager.initialize(plain, _mirrorSqrt(open, address(abc), address(pln)));

        _addFullRange(key, address(abc), 150_000 ether, open);
        _addFullRange(plain, address(pln), 150_000 ether, _mirrorSqrt(open, address(abc), address(pln)));

        _dump(key, abc, 100_000 ether);
        _dump(plain, pln, 100_000 ether);

        (uint160 afterP,,,) = poolManager.getSlot0(key.toId());
        (uint160 afterPlain,,,) = poolManager.getSlot0(plain.toId());
        uint256 pUsd = _usdPrice(key, afterP, address(abc));
        uint256 plainUsd = _usdPrice(plain, afterPlain, address(pln));
        emit log_named_decimal_uint("opening price      ", openUsd, 18);
        emit log_named_decimal_uint("Plainsight after   ", pUsd, 18);
        emit log_named_decimal_uint("plain pool after   ", plainUsd, 18);

        assertGe(pUsd, openUsd * 90 / 100, "holds inside the 10% band");
        assertLe(plainUsd, openUsd * 45 / 100, "plain pool drops more than half");
        GreenshoeVault.Status memory st = vault.status(id);
        assertGt(st.tokensBought, 20_000 ether, "the wall bought tokens back");
        assertLt(st.usdcInWall, 90_000e6, "and spent USDC doing it");
    }

    function test_settle_burnsBuybacksAndReturnsUsdc() public {
        (bytes32 id,) = _graduate(abc, "abc");
        PoolKey memory key = vault.poolKey(id);
        (uint160 open,,,) = poolManager.getSlot0(key.toId());
        _addFullRange(key, address(abc), 150_000 ether, open);
        _dump(key, abc, 60_000 ether);
        GreenshoeVault.Status memory before = vault.status(id);
        GreenshoeVault.Sale memory s = vault.sale(id);

        vm.warp(s.collectedAt + s.windowSecs);
        uint256 issuerUsdc = usdc.balanceOf(issuer);
        vault.settle(id);
        s = vault.sale(id);
        assertTrue(s.settled);
        assertGe(s.tokensBurned, before.tokensBought, "every token bought back is burned (plus fees)");
        assertEq(abc.balanceOf(vault.BURN()), s.tokensBurned);
        assertEq(usdc.balanceOf(issuer) - issuerUsdc, s.usdcReturned);
        assertGe(s.usdcReturned, before.usdcInWall + before.usdcUnplaced, "wall USDC + fees + unplaced back to the issuer");
        assertLe(usdc.balanceOf(address(vault)), 10, "vault keeps nothing but rounding dust");
        assertLe(abc.balanceOf(address(vault)), 10);
        vm.expectRevert(abi.encodeWithSelector(GreenshoeVault.AlreadySettled.selector, id));
        vault.settle(id);
    }

    function test_strongDemand_settleReturnsFullReserve() public {
        (bytes32 id,) = _graduate(abc, "abc");
        PoolKey memory key = vault.poolKey(id);
        (uint160 open,,,) = poolManager.getSlot0(key.toId());
        _addFullRange(key, address(abc), 150_000 ether, open);
        for (uint256 i; i < 5; ++i) _buy(key, 10_000e6);
        (, int24 tick,,) = poolManager.getSlot0(key.toId());
        assertTrue(address(abc) < address(usdc) ? tick > TickMath.getTickAtSqrtPrice(open) : tick < TickMath.getTickAtSqrtPrice(open), "price rose");

        GreenshoeVault.Sale memory s = vault.sale(id);
        vm.warp(vault.status(id).nextRungAt);
        vault.replenish(id);
        assertEq(vault.status(id).tokensBought, 0, "the wall bought nothing");

        vm.warp(s.collectedAt + s.windowSecs);
        uint256 before = usdc.balanceOf(issuer);
        vault.settle(id);
        s = vault.sale(id);
        assertEq(s.tokensBurned, 0, "nothing to burn");
        assertApproxEqAbs(s.usdcReturned, s.reserve, 10, "the full reserve goes back (v4 rounds each rung by a wei)");
        assertApproxEqAbs(usdc.balanceOf(issuer) - before, 150_000e6, 1_000e6, "about $150k");
        assertEq(abc.balanceOf(vault.BURN()), 0);
    }

    function test_shortDemoWindow_settlesAfterThirtyMinutes() public {
        Manifest memory m = _abcManifest(address(abc), "quick");
        m.windowSecs = 30 minutes;
        vm.startPrank(issuer);
        abc.approve(address(launcher), type(uint256).max);
        bytes32 id = launcher.postManifest(m);
        IContinuousClearingAuction a = IContinuousClearingAuction(launcher.launch(id, _terms(BLOCKS)));
        vm.stopPrank();
        vm.roll(a.startBlock());
        _bid(a, makeAddr("whale-quick"), 120, 1_150_000e6);
        vm.roll(a.endBlock());
        vault.collectAndPlace(id);

        GreenshoeVault.Sale memory s = vault.sale(id);
        assertEq(vault.status(id).nextRungAt, s.collectedAt + 8 minutes, "a demo day is one minute");
        vm.warp(s.collectedAt + 8 minutes);
        vault.replenish(id);
        assertEq(vault.rungsOf(id).length, 7);
        vm.expectRevert(abi.encodeWithSelector(GreenshoeVault.WindowOpen.selector, s.collectedAt + 30 minutes));
        vault.settle(id);
        vm.warp(s.collectedAt + 30 minutes);
        vault.settle(id);
        assertTrue(vault.sale(id).settled);
    }

    function test_secondLaunchOfSameToken_keepsReserveUnplaced() public {
        _graduate(abc, "abc");
        (bytes32 id2,) = _graduate(abc, "abc2");
        GreenshoeVault.Sale memory s = vault.sale(id2);
        assertFalse(s.poolOpened);
        assertGt(s.reserve, 0);
        assertEq(vault.status(id2).usdcUnplaced, s.reserve);
        vm.warp(s.collectedAt + s.windowSecs);
        uint256 before = usdc.balanceOf(issuer);
        vault.settle(id2);
        assertEq(usdc.balanceOf(issuer) - before, s.reserve);
    }

    function test_hookReady_falseWithoutHook() public {
        GreenshoeVault bare = new GreenshoeVault(usdc, poolManager);
        assertFalse(bare.hookReady());
        assertTrue(vault.hookReady());
        vm.expectRevert(GreenshoeVault.AlreadySet.selector);
        vault.setHook(hook);
    }
}
