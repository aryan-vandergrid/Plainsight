// SPDX-License-Identifier: MIT
pragma solidity 0.8.25;

import {Test} from "forge-std/Test.sol";
import {IHooks} from "@uniswap/v4-core/src/interfaces/IHooks.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {Hooks} from "@uniswap/v4-core/src/libraries/Hooks.sol";
import {LPFeeLibrary} from "@uniswap/v4-core/src/libraries/LPFeeLibrary.sol";
import {TickMath} from "@uniswap/v4-core/src/libraries/TickMath.sol";
import {PoolModifyLiquidityTest} from "@uniswap/v4-core/src/test/PoolModifyLiquidityTest.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {ModifyLiquidityParams} from "@uniswap/v4-core/src/types/PoolOperation.sol";

import {PlainsightHook} from "../../src/PlainsightHook.sol";
import {MockToken} from "../../src/mocks/MockToken.sol";
import {TestUSDC} from "../../src/mocks/TestUSDC.sol";
import {IPermit2Allowance} from "../../src/interfaces/ICCA.sol";
import {IUniversalRouter, UniversalRouterSwap} from "../../script/demo/UniversalRouterSwap.sol";

contract UniversalRouterForkTest is Test {
    address internal constant PM = 0xE03A1074c86CFeDd5C142C4F04F1a1536e203543;
    address internal constant LP_ROUTER = 0x0C478023803a644c94c4CE1C1e7b9A087e411B0A;
    address internal constant PERMIT2 = 0x000000000022D473030F116dDEE9F6B43aC78BA3;
    uint160 internal constant FLAGS = Hooks.BEFORE_INITIALIZE_FLAG | Hooks.BEFORE_ADD_LIQUIDITY_FLAG
        | Hooks.AFTER_ADD_LIQUIDITY_FLAG | Hooks.BEFORE_REMOVE_LIQUIDITY_FLAG | Hooks.AFTER_REMOVE_LIQUIDITY_FLAG
        | Hooks.BEFORE_SWAP_FLAG | Hooks.AFTER_SWAP_FLAG | Hooks.AFTER_SWAP_RETURNS_DELTA_FLAG;

    PlainsightHook internal hook;
    PoolKey internal key;
    MockToken internal tok;
    TestUSDC internal usdc;
    address internal insider = makeAddr("insider");
    address internal bot = makeAddr("bot");
    address internal treasury = makeAddr("treasury");

    function isInsider(bytes32, address w) external view returns (bool) {
        return w == insider;
    }

    function setUp() public {
        if (block.chainid != 11155111) vm.skip(true, "needs --fork-url <Sepolia RPC>");
        tok = new MockToken("Fork", "FRK", address(this), 0);
        usdc = new TestUSDC();
        address h = address(uint160(0x5555) << 144 | FLAGS);
        deployCodeTo("PlainsightHook.sol:PlainsightHook", abi.encode(PM, address(this), address(this), treasury, address(this)), h);
        hook = PlainsightHook(h);
        (address c0, address c1) = address(tok) < address(usdc) ? (address(tok), address(usdc)) : (address(usdc), address(tok));
        key = PoolKey(Currency.wrap(c0), Currency.wrap(c1), LPFeeLibrary.DYNAMIC_FEE_FLAG, 60, IHooks(h));
        IPoolManager(PM).initialize(key, address(tok) < address(usdc) ? uint160(1 << 96) / 1e6 : uint160(1 << 96) * 1e6);
        hook.registerPool(key, bytes32("fork"), address(tok), address(this), uint64(block.timestamp + 30 days), 1 days, 300);

        tok.mint(address(this), 10_000_000 ether);
        deal(address(usdc), address(this), 10_000_000e6);
        tok.approve(LP_ROUTER, type(uint256).max);
        usdc.approve(LP_ROUTER, type(uint256).max);
        PoolModifyLiquidityTest(LP_ROUTER).modifyLiquidity(
            key, ModifyLiquidityParams(TickMath.minUsableTick(60), TickMath.maxUsableTick(60), 1e18, 0), ""
        );
    }

    function test_washBotThroughUniversalRouter_isFakeAndPenalised() public {
        deal(address(usdc), bot, 1_000_000e6);
        vm.startPrank(bot);
        usdc.approve(PERMIT2, type(uint256).max);
        IPermit2Allowance(PERMIT2).approve(address(usdc), UniversalRouterSwap.ROUTER, type(uint160).max, type(uint48).max);
        (bytes memory c, bytes[] memory i) = UniversalRouterSwap.roundTrips(key, address(tok) < address(usdc), 100_000e6, 5);
        IUniversalRouter(UniversalRouterSwap.ROUTER).execute(c, i, block.timestamp + 60);
        vm.stopPrank();

        PlainsightHook.Totals memory t = hook.stats(key.toId());
        assertEq(t.roundTrips, 5, "every round trip flagged");
        assertEq(t.realVolume, 0);
        assertGt(t.fakeVolume, 900_000e6, "~$1M of legs, all fake");
        assertGt(t.penaltyUsdc, 0);
        assertEq(usdc.balanceOf(treasury), t.penaltyUsdc);
        assertEq(tok.balanceOf(bot), 0, "the bot ends flat in the token");
    }

    function test_insiderSellThroughUniversalRouter_paysInsiderFee() public {
        uint256 snap = vm.snapshotState();
        uint256 asOutsider = _sell(makeAddr("outsider"));
        vm.revertToState(snap);
        uint256 asInsider = _sell(insider);
        assertEq(hook.stats(key.toId()).insiderSells, 1, "the router told the hook who was selling");
        assertApproxEqRel(asInsider * 10_000 / asOutsider, 9730, 0.002e18);
    }

    function _sell(address who) internal returns (uint256) {
        tok.mint(who, 10_000 ether);
        vm.startPrank(who);
        tok.approve(PERMIT2, type(uint256).max);
        IPermit2Allowance(PERMIT2).approve(address(tok), UniversalRouterSwap.ROUTER, type(uint160).max, type(uint48).max);
        (bytes memory c, bytes[] memory i) = UniversalRouterSwap.single(key, address(tok) < address(usdc), 10_000 ether, 0);
        IUniversalRouter(UniversalRouterSwap.ROUTER).execute(c, i, block.timestamp + 60);
        vm.stopPrank();
        return usdc.balanceOf(who);
    }

    function test_pauseBlocksRouterSwaps() public {
        hook.pause(key.toId(), "TEST", "fork");
        deal(address(usdc), bot, 1_000e6);
        vm.startPrank(bot);
        usdc.approve(PERMIT2, type(uint256).max);
        IPermit2Allowance(PERMIT2).approve(address(usdc), UniversalRouterSwap.ROUTER, type(uint160).max, type(uint48).max);
        (bytes memory c, bytes[] memory i) = UniversalRouterSwap.single(key, address(usdc) < address(tok), 1_000e6, 0);
        vm.expectRevert();
        IUniversalRouter(UniversalRouterSwap.ROUTER).execute(c, i, block.timestamp + 60);
        vm.stopPrank();
    }
}
