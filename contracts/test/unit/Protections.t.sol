// SPDX-License-Identifier: MIT
pragma solidity 0.8.25;

import {TickMath} from "@uniswap/v4-core/src/libraries/TickMath.sol";
import {StateLibrary} from "@uniswap/v4-core/src/libraries/StateLibrary.sol";
import {PoolSwapTest} from "@uniswap/v4-core/src/test/PoolSwapTest.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {PoolId} from "@uniswap/v4-core/src/types/PoolId.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {ModifyLiquidityParams, SwapParams} from "@uniswap/v4-core/src/types/PoolOperation.sol";
import {LiquidityAmounts} from "v4-periphery/src/libraries/LiquidityAmounts.sol";

import {IFlagRegistry, PlainsightHook} from "../../src/PlainsightHook.sol";
import {MsgSenderRouter} from "../utils/MsgSenderRouter.sol";
import {PoolStack} from "../utils/PoolStack.sol";

contract FlagsMock is IFlagRegistry {
    mapping(address => bool) public flagged;

    function set(address w) external {
        flagged[w] = true;
    }

    function isFlagged(bytes32, address w) external view returns (bool) {
        return flagged[w];
    }
}

contract ProtectionsTest is PoolStack {
    using StateLibrary for *;

    MsgSenderRouter internal router;
    bytes32 internal id;
    PoolKey internal key;
    PoolId internal pid;
    bool internal tokenIs0;
    address internal trader = makeAddr("trader");

    function setUp() public {
        _deployPoolStack();
        router = new MsgSenderRouter(poolManager);
        (id,) = _graduate(abc, "abc");
        key = vault.poolKey(id);
        pid = key.toId();
        tokenIs0 = Currency.unwrap(key.currency0) == address(abc);
        (uint160 open,,,) = poolManager.getSlot0(pid);
        _addFullRange(key, address(abc), 500_000 ether, open);
        _fund(trader);
    }

    function test_singleBuy_isRealVolume() public {
        _run(trader, _ops1(_buy(10_000e6)));
        PlainsightHook.Totals memory t = hook.stats(pid);
        assertApproxEqAbs(t.realVolume, 10_000e6, 1);
        assertEq(t.fakeVolume, 0);
        assertEq(t.roundTrips, 0);
    }

    function test_roundTripInOneTx_isFakeAndPenalised() public {
        uint256 tokensOut = _quoteBuy(10_000e6);
        uint256 treasuryUsdc = usdc.balanceOf(treasury);
        uint256 usdcBefore = usdc.balanceOf(trader);

        MsgSenderRouter.Op[] memory ops = new MsgSenderRouter.Op[](2);
        ops[0] = _buy(10_000e6);
        ops[1] = _sell(tokensOut);
        _run(trader, ops);

        PlainsightHook.Totals memory t = hook.stats(pid);
        assertEq(t.realVolume, 0, "nothing real");
        assertApproxEqRel(t.fakeVolume, 20_000e6, 0.02e18, "both legs fake");
        assertEq(t.roundTrips, 1);
        assertGt(t.penaltyUsdc, 0, "the closing leg paid in USDC");
        assertEq(usdc.balanceOf(treasury) - treasuryUsdc, t.penaltyUsdc, "penalty goes to the treasury, not LPs");
        uint256 lost = usdcBefore - usdc.balanceOf(trader);
        assertGt(lost, 10_000e6 * 150 / 10_000);
        assertEq(hook.fakeVolume(pid, 0), t.fakeVolume);
    }

    /// forge-config: default.isolate = true
    function test_buyThenSellLater_isReal() public {
        uint256 tokensOut = _quoteBuy(10_000e6);
        _run(trader, _ops1(_buy(10_000e6)));
        _run(trader, _ops1(_sell(tokensOut)));
        PlainsightHook.Totals memory t = hook.stats(pid);
        assertEq(t.fakeVolume, 0);
        assertEq(t.roundTrips, 0);
        assertApproxEqRel(t.realVolume, 20_000e6, 0.02e18);
        assertEq(t.penaltyUsdc + t.penaltyToken, 0);
    }

    function test_partialSellInSameTx_countsTheMatchedHalf() public {
        uint256 tokensOut = _quoteBuy(10_000e6);
        MsgSenderRouter.Op[] memory ops = new MsgSenderRouter.Op[](2);
        ops[0] = _buy(10_000e6);
        ops[1] = _sell(tokensOut / 2);
        _run(trader, ops);
        PlainsightHook.Totals memory t = hook.stats(pid);
        assertEq(t.roundTrips, 1);
        assertApproxEqRel(t.fakeVolume, 10_000e6, 0.02e18, "half the buy + the whole sell");
        assertApproxEqRel(t.realVolume, 5_000e6, 0.02e18, "the unmatched half of the buy");
        assertGt(t.penaltyUsdc, 0);
    }

    function test_nearRoundTrip_cantDodgeAThreshold() public {
        uint256 tokensOut = _quoteBuy(10_000e6);
        MsgSenderRouter.Op[] memory ops = new MsgSenderRouter.Op[](2);
        ops[0] = _buy(10_000e6);
        ops[1] = _sell(tokensOut * 98 / 100);
        _run(trader, ops);
        PlainsightHook.Totals memory t = hook.stats(pid);
        assertApproxEqRel(t.fakeVolume, 19_600e6, 0.02e18);
        assertApproxEqRel(t.realVolume, 200e6, 0.05e18);
    }

    function test_phantomSwap_liquidityClosesTheSwap() public {
        uint256 tokensOut = _quoteBuy(10_000e6);
        (int24 lo, int24 hi, uint128 liq) = _tokenOnlyRange(tokensOut);
        MsgSenderRouter.Op[] memory ops = new MsgSenderRouter.Op[](2);
        ops[0] = _buy(10_000e6);
        ops[1] = MsgSenderRouter.Op(false, false, int256(uint256(liq)), lo, hi);
        _run(trader, ops);
        PlainsightHook.Totals memory t = hook.stats(pid);
        assertApproxEqAbs(t.realVolume, 0, 10, "liquidity rounds the parked amount down by a few wei");
        assertApproxEqAbs(t.fakeVolume, 10_000e6, 10);
        assertEq(t.roundTrips, 1);
    }

    function test_vaultWall_isNotVolume() public view {
        PlainsightHook.Totals memory t = hook.stats(pid);
        assertEq(t.realVolume + t.fakeVolume, 0, "placing the wall and LP adds aren't trades");
    }

    function test_insiderSellInsideWindow_paysInsiderFee() public {
        address team = teamWallet;
        _fund(team);
        uint256 asTrader = _sellAndMeasure(trader, 20_000 ether);
        uint256 asTeam = _sellAndMeasure(team, 20_000 ether);
        assertApproxEqRel(asTeam * 10_000 / asTrader, 9730, 0.002e18);
        PlainsightHook.Totals memory t = hook.stats(pid);
        assertEq(t.insiderSells, 1);
        assertGt(t.insiderFeeVolume, 0);
        assertEq(hook.feeFor(pid, team, tokenIs0), 30_000, "3% in pips");
        assertEq(hook.feeFor(pid, team, !tokenIs0), 3000, "buys pay the pool fee");
        assertEq(hook.feeFor(pid, trader, tokenIs0), 3000);
    }

    function test_insiderFee_endsWithWindow() public {
        vm.warp(hook.lockedUntil(pid));
        assertEq(hook.feeFor(pid, teamWallet, tokenIs0), 3000);
    }

    function test_unresolvableRouter_isTheTrader() public {
        uint256 before = hook.stats(pid).insiderSells;
        _dump(key, abc, 1_000 ether);
        assertEq(hook.stats(pid).insiderSells, before, "an unflagged router pays the pool fee");
        assertEq(hook.feeFor(pid, address(swapRouter), tokenIs0), 3000);

        FlagsMock f = new FlagsMock();
        hook.setFlagRegistry(f);
        f.set(address(swapRouter));
        assertEq(hook.feeFor(pid, address(swapRouter), tokenIs0), 30_000);
        _dump(key, abc, 1_000 ether);
        assertEq(hook.stats(pid).insiderSells, before + 1, "the flagged contract pays the insider fee");
    }

    function test_flaggedWallet_paysInsiderFee() public {
        FlagsMock f = new FlagsMock();
        vm.prank(makeAddr("not admin"));
        vm.expectRevert(PlainsightHook.OnlyAdmin.selector);
        hook.setFlagRegistry(f);
        hook.setFlagRegistry(f);
        vm.expectRevert(PlainsightHook.AlreadySet.selector);
        hook.setFlagRegistry(f);
        assertEq(hook.feeFor(pid, trader, tokenIs0), 3000);
        f.set(trader);
        assertEq(hook.feeFor(pid, trader, tokenIs0), 30_000);
    }

    function test_pause_blocksSwaps_notWithdrawals() public {
        vm.expectRevert(PlainsightHook.OnlyAgent.selector);
        hook.pause(pid, "DUMP", "halting");

        vm.prank(agentWallet);
        hook.pause(pid, "ORACLE", "price feed incident");
        assertTrue(hook.paused(pid));

        vm.prank(trader);
        vm.expectRevert();
        router.run(key, _ops1(_buy(1_000e6)));

        int24 lo = TickMath.minUsableTick(60);
        int24 hi = TickMath.maxUsableTick(60);
        (uint128 liq,,) = poolManager.getPositionInfo(pid, address(lpRouter), lo, hi, bytes32(0));
        vm.prank(lp);
        lpRouter.modifyLiquidity(key, ModifyLiquidityParams(lo, hi, -int256(uint256(liq / 2)), 0), "");

        vm.prank(agentWallet);
        hook.unpause(pid);
        _run(trader, _ops1(_buy(1_000e6)));
        assertGt(hook.stats(pid).realVolume, 0);
    }

    function test_pause_liftsAfterMaxPause_andCantBeChained() public {
        vm.prank(agentWallet);
        hook.pause(pid, "ORACLE", "price feed incident");
        uint64 until = hook.pausedUntil(pid);
        assertEq(until, block.timestamp + 24 hours);

        vm.prank(agentWallet);
        vm.expectRevert(abi.encodeWithSelector(PlainsightHook.AlreadyPaused.selector, until));
        hook.pause(pid, "ORACLE", "again");

        vm.warp(until - 1);
        vm.prank(trader);
        vm.expectRevert();
        router.run(key, _ops1(_buy(1_000e6)));

        vm.warp(until);
        assertFalse(hook.paused(pid));
        assertEq(hook.pausedUntil(pid), 0);
        _run(trader, _ops1(_buy(1_000e6)));

        vm.prank(agentWallet);
        vm.expectRevert(abi.encodeWithSelector(PlainsightHook.PauseCooldown.selector, until + 24 hours));
        hook.pause(pid, "ORACLE", "chained");
        vm.warp(until + 24 hours);
        vm.prank(agentWallet);
        hook.pause(pid, "ORACLE", "a new incident");
        assertTrue(hook.paused(pid));
    }

    function _fund(address who) internal {
        abc.mint(who, 1_000_000 ether);
        deal(address(usdc), who, 1_000_000e6);
        vm.startPrank(who);
        abc.approve(address(router), type(uint256).max);
        usdc.approve(address(router), type(uint256).max);
        vm.stopPrank();
    }

    function _run(address who, MsgSenderRouter.Op[] memory ops) internal {
        vm.prank(who);
        router.run(key, ops);
    }

    function _ops1(MsgSenderRouter.Op memory o) internal pure returns (MsgSenderRouter.Op[] memory ops) {
        ops = new MsgSenderRouter.Op[](1);
        ops[0] = o;
    }

    function _buy(uint256 usdcIn) internal view returns (MsgSenderRouter.Op memory) {
        return MsgSenderRouter.Op(true, !tokenIs0, int256(usdcIn), 0, 0);
    }

    function _sell(uint256 tokensIn) internal view returns (MsgSenderRouter.Op memory) {
        return MsgSenderRouter.Op(true, tokenIs0, int256(tokensIn), 0, 0);
    }

    function _quoteBuy(uint256 usdcIn) internal returns (uint256 out) {
        uint256 snap = vm.snapshotState();
        address q = makeAddr("quoter");
        _fund(q);
        uint256 before = abc.balanceOf(q);
        _run(q, _ops1(_buy(usdcIn)));
        out = abc.balanceOf(q) - before;
        vm.revertToState(snap);
    }

    function _sellAndMeasure(address who, uint256 tokens) internal returns (uint256 got) {
        uint256 snap = vm.snapshotState();
        uint256 before = usdc.balanceOf(who);
        _run(who, _ops1(_sell(tokens)));
        got = usdc.balanceOf(who) - before;
        if (who != teamWallet) vm.revertToState(snap);
    }

    function _tokenOnlyRange(uint256 tokens) internal view returns (int24 lo, int24 hi, uint128 liq) {
        (, int24 tick,,) = poolManager.getSlot0(pid);
        int24 base = (tick / 60) * 60;
        if (tokenIs0) {
            lo = base + 3000;
            hi = lo + 600;
            liq = LiquidityAmounts.getLiquidityForAmount0(TickMath.getSqrtPriceAtTick(lo), TickMath.getSqrtPriceAtTick(hi), tokens);
        } else {
            hi = base - 3000;
            lo = hi - 600;
            liq = LiquidityAmounts.getLiquidityForAmount1(TickMath.getSqrtPriceAtTick(lo), TickMath.getSqrtPriceAtTick(hi), tokens);
        }
    }
}
