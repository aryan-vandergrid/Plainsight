// SPDX-License-Identifier: MIT
pragma solidity 0.8.25;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {IHooks} from "@uniswap/v4-core/src/interfaces/IHooks.sol";
import {IUnlockCallback} from "@uniswap/v4-core/src/interfaces/callback/IUnlockCallback.sol";
import {LPFeeLibrary} from "@uniswap/v4-core/src/libraries/LPFeeLibrary.sol";
import {SqrtPriceMath} from "@uniswap/v4-core/src/libraries/SqrtPriceMath.sol";
import {StateLibrary} from "@uniswap/v4-core/src/libraries/StateLibrary.sol";
import {TickMath} from "@uniswap/v4-core/src/libraries/TickMath.sol";
import {BalanceDelta} from "@uniswap/v4-core/src/types/BalanceDelta.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {PoolId} from "@uniswap/v4-core/src/types/PoolId.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {ModifyLiquidityParams} from "@uniswap/v4-core/src/types/PoolOperation.sol";
import {LiquidityAmounts} from "v4-periphery/src/libraries/LiquidityAmounts.sol";

import {PlainsightHook} from "./PlainsightHook.sol";
import {IContinuousClearingAuction} from "./interfaces/ICCA.sol";
import {IManifestRegistry} from "./interfaces/IManifestRegistry.sol";
import {Manifest} from "./interfaces/IManifest.sol";

interface ILauncherRegistry {
    function REGISTRY() external view returns (IManifestRegistry);
}

contract GreenshoeVault is ReentrancyGuard, IUnlockCallback {
    using SafeERC20 for IERC20;
    using StateLibrary for IPoolManager;

    struct Rung {
        int24 tickLower;
        int24 tickUpper;
        uint128 liquidity;
        uint128 usdc;
    }

    struct Sale {
        address auction;
        address issuer;
        address token;
        uint16 greenshoeBps;
        uint32 windowSecs;
        bool collected;
        bool graduated;
        bool settled;
        uint64 collectedAt;
        uint256 received;
        uint256 toIssuer;
        uint256 reserve;
        uint256 unsoldTokens;
        bool poolOpened;
        uint160 openSqrtPriceX96;
        uint256 clearingPriceQ96;
        uint16 rangeDepthBps;
        uint8 rungCount;
        uint8 rungsPlaced;
        uint256 usdcReturned;
        uint256 tokensBurned;
    }

    struct Status {
        uint256 usdcInWall;
        uint256 usdcUnplaced;
        uint256 tokensBought;
        uint64 lockedUntil;
        uint64 nextRungAt;
        uint8 rungsPlaced;
        uint8 rungCount;
    }

    uint8 public constant RUNGS = 10;
    uint16 public constant FIRST_DAY_BPS = 6000;
    uint32 public constant DAYS_PER_WINDOW = 30;
    uint32 public constant MIN_DAY_SECS = 60;
    address public constant BURN = 0x000000000000000000000000000000000000dEaD;

    IERC20 public immutable USDC;
    IPoolManager public immutable POOL_MANAGER;
    address public immutable deployer;
    address public launcher;
    PlainsightHook public hook;

    mapping(bytes32 id => Sale) internal sales;
    mapping(bytes32 id => Rung[]) internal rungs;

    event LauncherSet(address launcher);
    event HookSet(address hook);
    event SaleRegistered(bytes32 indexed id, address indexed auction, address indexed issuer);
    event Collected(
        bytes32 indexed id, bool graduated, uint256 received, uint256 toIssuer, uint256 reserve, uint256 unsoldTokens
    );
    event PoolOpened(bytes32 indexed id, PoolId indexed poolId, uint256 clearingPriceQ96, uint160 sqrtPriceX96, int24 tick);
    event RungPlaced(bytes32 indexed id, uint8 index, int24 tickLower, int24 tickUpper, uint128 liquidity, uint256 usdc);
    event Settled(bytes32 indexed id, uint256 burned, uint256 returned);

    error NotDeployer();
    error NotLauncher();
    error AlreadySet();
    error HookNotSet();
    error UnknownSale(bytes32 id);
    error SaleExists(bytes32 id);
    error AlreadyCollected(bytes32 id);
    error NotCollected(bytes32 id);
    error AlreadySettled(bytes32 id);
    error WindowOpen(uint64 endsAt);
    error NotPoolManager();

    constructor(IERC20 usdc, IPoolManager poolManager) {
        USDC = usdc;
        POOL_MANAGER = poolManager;
        deployer = msg.sender;
    }

    function setLauncher(address launcher_) external {
        if (msg.sender != deployer) revert NotDeployer();
        if (launcher != address(0)) revert AlreadySet();
        launcher = launcher_;
        emit LauncherSet(launcher_);
    }

    function setHook(PlainsightHook hook_) external {
        if (msg.sender != deployer) revert NotDeployer();
        if (address(hook) != address(0)) revert AlreadySet();
        hook = hook_;
        emit HookSet(address(hook_));
    }

    function hookReady() external view returns (bool) {
        PlainsightHook h = hook;
        if (address(h) == address(0) || h.VAULT() != address(this) || address(h.poolManager()) != address(POOL_MANAGER)) {
            return false;
        }
        return uint160(address(h)) & ((1 << 14) - 1) == _flags();
    }

    function register(bytes32 id, address auction, address issuer, address token, uint16 greenshoeBps, uint32 windowSecs)
        external
    {
        if (msg.sender != launcher) revert NotLauncher();
        if (sales[id].auction != address(0)) revert SaleExists(id);
        Sale storage s = sales[id];
        (s.auction, s.issuer, s.token, s.greenshoeBps, s.windowSecs) = (auction, issuer, token, greenshoeBps, windowSecs);
        emit SaleRegistered(id, auction, issuer);
    }

    function collectAndPlace(bytes32 id) external nonReentrant {
        Sale storage s = sales[id];
        if (s.auction == address(0)) revert UnknownSale(id);
        if (s.collected) revert AlreadyCollected(id);
        if (address(hook) == address(0)) revert HookNotSet();
        s.collected = true;
        s.collectedAt = uint64(block.timestamp);

        IContinuousClearingAuction a = IContinuousClearingAuction(s.auction);
        IERC20 token = IERC20(s.token);
        uint256 usdc0 = USDC.balanceOf(address(this));
        uint256 tok0 = token.balanceOf(address(this));
        a.sweepCurrency();
        a.sweepUnsoldTokens();
        uint256 received = USDC.balanceOf(address(this)) - usdc0;
        uint256 unsold = token.balanceOf(address(this)) - tok0;

        uint256 toIssuer = received * 10_000 / (10_000 + uint256(s.greenshoeBps));
        s.graduated = a.isGraduated();
        s.received = received;
        s.toIssuer = toIssuer;
        s.reserve = received - toIssuer;
        s.unsoldTokens = unsold;

        if (toIssuer > 0) USDC.safeTransfer(s.issuer, toIssuer);
        if (unsold > 0) token.safeTransfer(s.issuer, unsold);
        emit Collected(id, s.graduated, received, toIssuer, s.reserve, unsold);

        if (s.graduated && s.reserve > 0) _openPool(id, s, a.clearingPrice());
    }

    function replenish(bytes32 id) external nonReentrant {
        Sale storage s = sales[id];
        if (!s.poolOpened || s.settled) revert NotCollected(id);
        _placeRungs(id, s);
    }

    function settle(bytes32 id) external nonReentrant {
        Sale storage s = sales[id];
        if (s.auction == address(0)) revert UnknownSale(id);
        if (!s.collected) revert NotCollected(id);
        if (s.settled) revert AlreadySettled(id);
        uint64 endsAt = s.collectedAt + s.windowSecs;
        if (block.timestamp < endsAt) revert WindowOpen(endsAt);
        s.settled = true;

        uint256 usdcBack = s.reserve - _placedUsdc(id);
        uint256 tokens;
        Rung[] storage r = rungs[id];
        for (uint256 i; i < r.length; ++i) {
            if (r[i].liquidity == 0) continue;
            (uint256 u, uint256 t) = _modify(s, r[i].tickLower, r[i].tickUpper, -int256(uint256(r[i].liquidity)), id);
            usdcBack += u;
            tokens += t;
        }
        s.usdcReturned = usdcBack;
        s.tokensBurned = tokens;
        if (usdcBack > 0) USDC.safeTransfer(s.issuer, usdcBack);
        if (tokens > 0) IERC20(s.token).safeTransfer(BURN, tokens);
        emit Settled(id, tokens, usdcBack);
    }

    function sale(bytes32 id) external view returns (Sale memory) {
        return sales[id];
    }

    function rungsOf(bytes32 id) external view returns (Rung[] memory) {
        return rungs[id];
    }

    function poolKey(bytes32 id) public view returns (PoolKey memory key) {
        return _key(sales[id].token);
    }

    function status(bytes32 id) external view returns (Status memory st) {
        Sale storage s = sales[id];
        st.rungCount = s.rungCount;
        st.rungsPlaced = s.rungsPlaced;
        if (!s.poolOpened) {
            st.usdcUnplaced = s.settled ? 0 : s.reserve;
            return st;
        }
        st.lockedUntil = s.collectedAt + s.windowSecs;
        if (s.settled) return st;
        st.usdcUnplaced = s.reserve - _placedUsdc(id);
        PoolKey memory key = _key(s.token);
        (uint160 sqrtP,,,) = POOL_MANAGER.getSlot0(key.toId());
        bool usdcIs0 = Currency.unwrap(key.currency0) == address(USDC);
        Rung[] storage r = rungs[id];
        for (uint256 i; i < r.length; ++i) {
            (uint256 a0, uint256 a1) = _amounts(sqrtP, r[i].tickLower, r[i].tickUpper, r[i].liquidity);
            (uint256 u, uint256 t) = usdcIs0 ? (a0, a1) : (a1, a0);
            st.usdcInWall += u;
            st.tokensBought += t;
        }
        if (s.rungsPlaced < s.rungCount) st.nextRungAt = uint64(s.collectedAt + _dayFor(s, _planned(s, s.rungsPlaced + 1)) * _dayLength(s));
    }

    function _openPool(bytes32 id, Sale storage s, uint256 clearingQ96) internal {
        PoolKey memory key = _key(s.token);
        PoolId pid = key.toId();
        (uint160 existing,,,) = POOL_MANAGER.getSlot0(pid);
        if (existing != 0) return;

        Manifest memory m = ILauncherRegistry(launcher).REGISTRY().get(id);
        uint160 sqrtP = _sqrtPriceAt(clearingQ96, Currency.unwrap(key.currency0) == s.token);
        int24 tick = POOL_MANAGER.initialize(key, sqrtP);
        s.poolOpened = true;
        s.openSqrtPriceX96 = sqrtP;
        s.clearingPriceQ96 = clearingQ96;
        s.rangeDepthBps = m.rangeDepthBps;
        s.rungCount = RUNGS;
        _registerWithHook(key, id, s, m.agent, m.insiderFeeBps);
        emit PoolOpened(id, pid, clearingQ96, sqrtP, tick);
        _placeRungs(id, s);
    }

    function _registerWithHook(PoolKey memory key, bytes32 id, Sale storage s, address agent, uint16 insiderFeeBps) internal {
        hook.registerPool(key, id, s.token, agent, s.collectedAt + s.windowSecs, uint32(_dayLength(s)), insiderFeeBps);
    }

    function _placeRungs(bytes32 id, Sale storage s) internal {
        if (block.timestamp >= s.collectedAt + s.windowSecs) return;
        uint256 released = _released(s, (block.timestamp - s.collectedAt) / _dayLength(s));
        (, int24 current,,) = POOL_MANAGER.getSlot0(_key(s.token).toId());
        while (s.rungsPlaced < s.rungCount) {
            uint8 i = s.rungsPlaced;
            uint256 upTo = _planned(s, i + 1);
            if (upTo > released) break;
            if (!_placeOne(id, s, i, upTo - _planned(s, i), current)) break;
            s.rungsPlaced = i + 1;
        }
    }

    function _planned(Sale storage s, uint256 n) internal view returns (uint256) {
        return n >= s.rungCount ? s.reserve : s.reserve / s.rungCount * n;
    }

    function _days(Sale storage s) internal view returns (uint256) {
        return Math.max(s.windowSecs / _dayLength(s), 1);
    }

    function _released(Sale storage s, uint256 day) internal view returns (uint256) {
        uint256 n = _days(s);
        if (day + 1 >= n) return s.reserve;
        return s.reserve * (FIRST_DAY_BPS + (10_000 - uint256(FIRST_DAY_BPS)) * day / (n - 1)) / 10_000;
    }

    function _dayFor(Sale storage s, uint256 amount) internal view returns (uint256) {
        if (s.reserve == 0 || amount * 10_000 <= s.reserve * FIRST_DAY_BPS) return 0;
        uint256 need = Math.ceilDiv(amount * 10_000, s.reserve) - FIRST_DAY_BPS;
        return Math.min(Math.ceilDiv(need * (_days(s) - 1), 10_000 - uint256(FIRST_DAY_BPS)), _days(s) - 1);
    }

    function _placeOne(bytes32 id, Sale storage s, uint8 i, uint256 amount, int24 current) internal returns (bool) {
        (int24 lo, int24 hi, bool ok) = _clampToWall(s, _rungTicks(s, i), current);
        if (!ok) return false;
        uint128 liq = _liquidityFor(s, lo, hi, amount);
        uint256 paid;
        if (liq > 0) (paid,) = _modify(s, lo, hi, int256(uint256(liq)), id);
        rungs[id].push(Rung({tickLower: lo, tickUpper: hi, liquidity: liq, usdc: uint128(paid)}));
        emit RungPlaced(id, i, lo, hi, liq, paid);
        return true;
    }

    function _rungTicks(Sale storage s, uint8 i) internal view returns (int24[2] memory t) {
        int24 lo;
        int24 hi;
        bool tokenIs0 = s.token < address(USDC);
        int24 spacing = PlainsightHook(address(hook)).TICK_SPACING();
        int24 open = TickMath.getTickAtSqrtPrice(s.openSqrtPriceX96);
        int24 a = _tickAt(s, i, tokenIs0);
        int24 b = _tickAt(s, i + 1, tokenIs0);
        if (tokenIs0) {
            hi = _floor(i == 0 ? open : a, spacing);
            if (hi > _floor(open, spacing)) hi = _floor(open, spacing);
            lo = _floor(b, spacing);
            if (lo >= hi) lo = hi - spacing;
        } else {
            lo = _ceil(i == 0 ? open + 1 : a, spacing);
            if (lo <= open) lo = _ceil(open + 1, spacing);
            hi = _ceil(b, spacing);
            if (hi <= lo) hi = lo + spacing;
        }
        t = [lo, hi];
    }

    function _clampToWall(Sale storage s, int24[2] memory r, int24 current) internal view returns (int24 lo, int24 hi, bool ok) {
        int24 spacing = PlainsightHook(address(hook)).TICK_SPACING();
        bool tokenIs0 = s.token < address(USDC);
        int24 bandEnd = _tickAt(s, s.rungCount, tokenIs0);
        (lo, hi) = (r[0], r[1]);
        if (tokenIs0) {
            int24 edge = _floor(current, spacing);
            if (lo >= edge) (lo, hi) = (_floor(bandEnd, spacing), edge);
            else if (hi > edge) hi = edge;
            ok = lo < hi;
        } else {
            int24 edge = _ceil(current + 1, spacing);
            if (hi <= edge) (lo, hi) = (edge, _ceil(bandEnd, spacing));
            else if (lo < edge) lo = edge;
            ok = lo < hi;
        }
    }

    function _tickAt(Sale storage s, uint8 k, bool tokenIs0) internal view returns (int24) {
        uint256 q = s.clearingPriceQ96 * (uint256(10_000) * s.rungCount - uint256(s.rangeDepthBps) * k)
            / (uint256(10_000) * s.rungCount);
        return TickMath.getTickAtSqrtPrice(_sqrtPriceAt(q, tokenIs0));
    }

    function _liquidityFor(Sale storage s, int24 lo, int24 hi, uint256 usdc) internal view returns (uint128) {
        uint160 a = TickMath.getSqrtPriceAtTick(lo);
        uint160 b = TickMath.getSqrtPriceAtTick(hi);
        return s.token < address(USDC)
            ? LiquidityAmounts.getLiquidityForAmount1(a, b, usdc)
            : LiquidityAmounts.getLiquidityForAmount0(a, b, usdc);
    }

    function _sqrtPriceAt(uint256 q, bool tokenIs0) internal pure returns (uint160 p) {
        uint256 r = tokenIs0 ? Math.sqrt(q << 96) : Math.sqrt((uint256(1) << 192) / q) << 48;
        if (r < TickMath.MIN_SQRT_PRICE) r = TickMath.MIN_SQRT_PRICE;
        if (r >= TickMath.MAX_SQRT_PRICE) r = TickMath.MAX_SQRT_PRICE - 1;
        p = uint160(r);
    }

    function _amounts(uint160 sqrtP, int24 lo, int24 hi, uint128 liq) internal pure returns (uint256 a0, uint256 a1) {
        uint160 a = TickMath.getSqrtPriceAtTick(lo);
        uint160 b = TickMath.getSqrtPriceAtTick(hi);
        if (sqrtP <= a) {
            a0 = SqrtPriceMath.getAmount0Delta(a, b, liq, false);
        } else if (sqrtP < b) {
            a0 = SqrtPriceMath.getAmount0Delta(sqrtP, b, liq, false);
            a1 = SqrtPriceMath.getAmount1Delta(a, sqrtP, liq, false);
        } else {
            a1 = SqrtPriceMath.getAmount1Delta(a, b, liq, false);
        }
    }

    function _placedUsdc(bytes32 id) internal view returns (uint256 total) {
        Rung[] storage r = rungs[id];
        for (uint256 i; i < r.length; ++i) {
            total += r[i].usdc;
        }
    }

    function _dayLength(Sale storage s) internal view returns (uint256) {
        return Math.max(s.windowSecs / DAYS_PER_WINDOW, MIN_DAY_SECS);
    }

    function _key(address token) internal view returns (PoolKey memory key) {
        (address c0, address c1) = token < address(USDC) ? (token, address(USDC)) : (address(USDC), token);
        key = PoolKey({
            currency0: Currency.wrap(c0),
            currency1: Currency.wrap(c1),
            fee: LPFeeLibrary.DYNAMIC_FEE_FLAG,
            tickSpacing: PlainsightHook(address(hook)).TICK_SPACING(),
            hooks: IHooks(address(hook))
        });
    }

    function _flags() internal pure returns (uint160) {
        return (1 << 13) | (1 << 11) | (1 << 10) | (1 << 9) | (1 << 8) | (1 << 7) | (1 << 6) | (1 << 2);
    }

    function _floor(int24 t, int24 spacing) internal pure returns (int24) {
        int24 c = t / spacing;
        if (t < 0 && t % spacing != 0) c -= 1;
        return c * spacing;
    }

    function _ceil(int24 t, int24 spacing) internal pure returns (int24) {
        int24 c = t / spacing;
        if (t > 0 && t % spacing != 0) c += 1;
        return c * spacing;
    }

    function _modify(Sale storage s, int24 lo, int24 hi, int256 delta, bytes32 id) internal returns (uint256 usdc, uint256 tokens) {
        bytes memory out = POOL_MANAGER.unlock(abi.encode(s.token, lo, hi, delta, id));
        (usdc, tokens) = abi.decode(out, (uint256, uint256));
    }

    function unlockCallback(bytes calldata data) external returns (bytes memory) {
        if (msg.sender != address(POOL_MANAGER)) revert NotPoolManager();
        (address token, int24 lo, int24 hi, int256 delta, bytes32 id) = abi.decode(data, (address, int24, int24, int256, bytes32));
        PoolKey memory key = _key(token);
        (BalanceDelta d,) = POOL_MANAGER.modifyLiquidity(
            key, ModifyLiquidityParams({tickLower: lo, tickUpper: hi, liquidityDelta: delta, salt: id}), ""
        );
        (uint256 got0, uint256 got1) = (_settleOrTake(key.currency0, d.amount0()), _settleOrTake(key.currency1, d.amount1()));
        return Currency.unwrap(key.currency0) == address(USDC) ? abi.encode(got0, got1) : abi.encode(got1, got0);
    }

    function _settleOrTake(Currency c, int128 amount) internal returns (uint256) {
        if (amount < 0) {
            uint256 owed = uint256(uint128(-amount));
            POOL_MANAGER.sync(c);
            IERC20(Currency.unwrap(c)).safeTransfer(address(POOL_MANAGER), owed);
            POOL_MANAGER.settle();
            return owed;
        }
        if (amount > 0) POOL_MANAGER.take(c, address(this), uint256(uint128(amount)));
        return uint256(uint128(amount));
    }
}
