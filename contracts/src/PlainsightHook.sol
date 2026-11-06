// SPDX-License-Identifier: MIT
pragma solidity 0.8.25;

import {BaseHook} from "v4-periphery/src/utils/BaseHook.sol";
import {IMsgSender} from "v4-periphery/src/interfaces/IMsgSender.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {Hooks} from "@uniswap/v4-core/src/libraries/Hooks.sol";
import {LPFeeLibrary} from "@uniswap/v4-core/src/libraries/LPFeeLibrary.sol";
import {BalanceDelta, BalanceDeltaLibrary} from "@uniswap/v4-core/src/types/BalanceDelta.sol";
import {BeforeSwapDelta, BeforeSwapDeltaLibrary} from "@uniswap/v4-core/src/types/BeforeSwapDelta.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {PoolId} from "@uniswap/v4-core/src/types/PoolId.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {ModifyLiquidityParams, SwapParams} from "@uniswap/v4-core/src/types/PoolOperation.sol";

import {IManifestRegistry} from "./interfaces/IManifestRegistry.sol";

interface IFlagRegistry {
    function isFlagged(bytes32 tokenId, address wallet) external view returns (bool);
}

contract PlainsightHook is BaseHook {
    uint24 public constant POOL_FEE = 3000;
    int24 public constant TICK_SPACING = 60;
    uint256 public constant ROUND_TRIP_PENALTY_BPS = 100;
    uint64 public constant MAX_PAUSE = 24 hours;
    uint64 public constant PAUSE_COOLDOWN = 24 hours;

    struct Pool {
        bytes32 manifestId;
        address token;
        address agent;
        uint64 openedAt;
        uint64 windowEnd;
        uint32 dayLength;
        uint16 insiderFeeBps;
        bool tokenIs0;
        bool paused;
        bytes32 pauseReason;
        uint64 pausedAt;
        uint64 resumedAt;
    }

    struct Totals {
        uint256 realVolume;
        uint256 fakeVolume;
        uint256 roundTrips;
        uint256 penaltyUsdc;
        uint256 penaltyToken;
        uint256 insiderSells;
        uint256 insiderFeeVolume;
    }

    address public immutable VAULT;
    IManifestRegistry public immutable REGISTRY;
    address public immutable TREASURY;
    address public immutable ADMIN;
    IFlagRegistry public flags;

    mapping(PoolId => Pool) internal pools;
    mapping(PoolId => Totals) internal totals;
    mapping(PoolId => mapping(uint256 day => uint256)) public realVolume;
    mapping(PoolId => mapping(uint256 day => uint256)) public fakeVolume;

    event PoolRegistered(PoolId indexed id, bytes32 indexed manifestId, address agent, uint64 windowEnd);
    event RoundTripFlagged(PoolId indexed id, address indexed trader, uint256 volumeUsdc, uint256 penalty, bool penaltyInUsdc);
    event InsiderFeeCharged(PoolId indexed id, address indexed trader, uint256 volumeUsdc, uint24 feePips);
    event Paused(PoolId indexed id, bytes32 indexed reasonCode, string note);
    event Unpaused(PoolId indexed id);
    event FlagRegistrySet(address flags);

    error OnlyVault();
    error OnlyAgent();
    error OnlyAdmin();
    error AlreadySet();
    error UnknownPool();
    error PoolMustUseDynamicFee();
    error VaultLiquidityLocked(uint64 until);
    error PoolPaused(bytes32 reasonCode);
    error AlreadyPaused(uint64 until);
    error PauseCooldown(uint64 until);

    constructor(IPoolManager manager, address vault, IManifestRegistry registry, address treasury, address admin)
        BaseHook(manager)
    {
        VAULT = vault;
        REGISTRY = registry;
        TREASURY = treasury;
        ADMIN = admin;
    }

    function getHookPermissions() public pure override returns (Hooks.Permissions memory p) {
        p.beforeInitialize = true;
        p.beforeAddLiquidity = true;
        p.afterAddLiquidity = true;
        p.beforeRemoveLiquidity = true;
        p.afterRemoveLiquidity = true;
        p.beforeSwap = true;
        p.afterSwap = true;
        p.afterSwapReturnDelta = true;
    }

    function registerPool(
        PoolKey calldata key,
        bytes32 manifestId,
        address token,
        address agent,
        uint64 windowEnd,
        uint32 dayLength,
        uint16 insiderFeeBps
    ) external {
        if (msg.sender != VAULT) revert OnlyVault();
        PoolId id = key.toId();
        pools[id] = Pool({
            manifestId: manifestId,
            token: token,
            agent: agent,
            openedAt: uint64(block.timestamp),
            windowEnd: windowEnd,
            dayLength: dayLength == 0 ? 1 : dayLength,
            insiderFeeBps: insiderFeeBps,
            tokenIs0: Currency.unwrap(key.currency0) == token,
            paused: false,
            pauseReason: bytes32(0),
            pausedAt: 0,
            resumedAt: 0
        });
        emit PoolRegistered(id, manifestId, agent, windowEnd);
    }

    function setFlagRegistry(IFlagRegistry f) external {
        if (msg.sender != ADMIN) revert OnlyAdmin();
        if (address(flags) != address(0)) revert AlreadySet();
        flags = f;
        emit FlagRegistrySet(address(f));
    }

    function pause(PoolId id, bytes32 reasonCode, string calldata note) external {
        Pool storage p = _agentPool(id);
        if (_isPaused(p)) revert AlreadyPaused(p.pausedAt + MAX_PAUSE);
        uint64 ended = p.paused ? p.pausedAt + MAX_PAUSE : p.resumedAt;
        if (ended != 0 && block.timestamp < ended + PAUSE_COOLDOWN) revert PauseCooldown(ended + PAUSE_COOLDOWN);
        p.paused = true;
        p.pauseReason = reasonCode;
        p.pausedAt = uint64(block.timestamp);
        emit Paused(id, reasonCode, note);
    }

    function unpause(PoolId id) external {
        Pool storage p = _agentPool(id);
        if (!_isPaused(p)) return;
        p.paused = false;
        p.pauseReason = bytes32(0);
        p.resumedAt = uint64(block.timestamp);
        emit Unpaused(id);
    }

    function pool(PoolId id) external view returns (Pool memory) {
        return pools[id];
    }

    function stats(PoolId id) external view returns (Totals memory) {
        return totals[id];
    }

    function lockedUntil(PoolId id) external view returns (uint64) {
        return pools[id].windowEnd;
    }

    function paused(PoolId id) external view returns (bool) {
        return _isPaused(pools[id]);
    }

    function pausedUntil(PoolId id) external view returns (uint64) {
        Pool storage p = pools[id];
        return _isPaused(p) ? p.pausedAt + MAX_PAUSE : 0;
    }

    function currentDay(PoolId id) public view returns (uint256) {
        Pool storage p = pools[id];
        return p.openedAt == 0 ? 0 : (block.timestamp - p.openedAt) / p.dayLength;
    }

    function feeFor(PoolId id, address trader, bool zeroForOne) public view returns (uint24) {
        Pool storage p = pools[id];
        if (trader == address(0) || block.timestamp >= p.windowEnd) return POOL_FEE;
        if (zeroForOne != p.tokenIs0) return POOL_FEE;
        bool insider = REGISTRY.isInsider(p.manifestId, trader)
            || (address(flags) != address(0) && flags.isFlagged(p.manifestId, trader));
        if (!insider) return POOL_FEE;
        uint256 pips = uint256(p.insiderFeeBps) * 100;
        return pips > POOL_FEE && pips <= LPFeeLibrary.MAX_LP_FEE ? uint24(pips) : POOL_FEE;
    }

    function _beforeInitialize(address sender, PoolKey calldata key, uint160) internal view override returns (bytes4) {
        if (sender != VAULT) revert OnlyVault();
        if (key.fee != LPFeeLibrary.DYNAMIC_FEE_FLAG) revert PoolMustUseDynamicFee();
        return this.beforeInitialize.selector;
    }

    function _beforeAddLiquidity(address, PoolKey calldata, ModifyLiquidityParams calldata, bytes calldata)
        internal
        pure
        override
        returns (bytes4)
    {
        return this.beforeAddLiquidity.selector;
    }

    function _afterAddLiquidity(
        address sender,
        PoolKey calldata key,
        ModifyLiquidityParams calldata,
        BalanceDelta delta,
        BalanceDelta,
        bytes calldata
    ) internal override returns (bytes4, BalanceDelta) {
        _trackLiquidity(sender, key, delta);
        return (this.afterAddLiquidity.selector, BalanceDeltaLibrary.ZERO_DELTA);
    }

    function _beforeRemoveLiquidity(address sender, PoolKey calldata key, ModifyLiquidityParams calldata, bytes calldata)
        internal
        view
        override
        returns (bytes4)
    {
        if (sender == VAULT) {
            uint64 until = pools[key.toId()].windowEnd;
            if (block.timestamp < until) revert VaultLiquidityLocked(until);
        }
        return this.beforeRemoveLiquidity.selector;
    }

    function _afterRemoveLiquidity(
        address sender,
        PoolKey calldata key,
        ModifyLiquidityParams calldata,
        BalanceDelta delta,
        BalanceDelta,
        bytes calldata
    ) internal override returns (bytes4, BalanceDelta) {
        _trackLiquidity(sender, key, delta);
        return (this.afterRemoveLiquidity.selector, BalanceDeltaLibrary.ZERO_DELTA);
    }

    function _beforeSwap(address sender, PoolKey calldata key, SwapParams calldata params, bytes calldata)
        internal
        view
        override
        returns (bytes4, BeforeSwapDelta, uint24)
    {
        Pool storage p = pools[key.toId()];
        if (_isPaused(p)) revert PoolPaused(p.pauseReason);
        uint24 fee = feeFor(key.toId(), _trader(sender), params.zeroForOne);
        return (this.beforeSwap.selector, BeforeSwapDeltaLibrary.ZERO_DELTA, fee | LPFeeLibrary.OVERRIDE_FEE_FLAG);
    }

    function _afterSwap(address sender, PoolKey calldata key, SwapParams calldata params, BalanceDelta delta, bytes calldata)
        internal
        override
        returns (bytes4, int128)
    {
        if (pools[key.toId()].openedAt == 0) return (this.afterSwap.selector, 0);
        return (this.afterSwap.selector, _clean(sender, key, params, delta));
    }

    function _logInsider(PoolId id, address trader, bool zeroForOne, uint256 volume) internal {
        uint24 fee = feeFor(id, trader, zeroForOne);
        if (fee == POOL_FEE) return;
        totals[id].insiderSells += 1;
        totals[id].insiderFeeVolume += volume;
        emit InsiderFeeCharged(id, trader, volume, fee);
    }

    function _clean(address sender, PoolKey calldata key, SwapParams calldata params, BalanceDelta delta)
        internal
        returns (int128)
    {
        PoolId id = key.toId();
        address trader = _trader(sender);
        (int128 tok, uint256 volume) = _legs(id, delta);
        _logInsider(id, trader, params.zeroForOne, volume);

        uint256 size = uint256(uint128(tok < 0 ? -tok : tok));
        uint256 matched = _match(id, trader, tok);
        uint256 own = size == 0 ? 0 : volume * matched / size;
        uint256 earlier = _earlierMatched(id, trader, tok > 0, matched);
        _addOpen(id, trader, tok > 0, volume - own, size - matched);
        _count(id, volume - own, own, earlier);
        if (matched == 0) return 0;

        (uint256 penalty, bool inUsdc) = _takePenalty(id, key, params, delta, matched, size);
        emit RoundTripFlagged(id, trader, own + earlier, penalty, inUsdc);
        return int128(int256(penalty));
    }

    function _legs(PoolId id, BalanceDelta delta) internal view returns (int128 tok, uint256 volume) {
        int128 usd;
        (tok, usd) = pools[id].tokenIs0 ? (delta.amount0(), delta.amount1()) : (delta.amount1(), delta.amount0());
        volume = uint256(uint128(usd < 0 ? -usd : usd));
    }

    function _takePenalty(
        PoolId id,
        PoolKey calldata key,
        SwapParams calldata params,
        BalanceDelta delta,
        uint256 matched,
        uint256 size
    ) internal returns (uint256 penalty, bool inUsdc) {
        bool specifiedIs0 = (params.amountSpecified < 0) == params.zeroForOne;
        (Currency c, int128 amt) = specifiedIs0 ? (key.currency1, delta.amount1()) : (key.currency0, delta.amount0());
        inUsdc = Currency.unwrap(c) != pools[id].token;
        penalty = uint256(uint128(amt < 0 ? -amt : amt)) * matched / size * ROUND_TRIP_PENALTY_BPS / 10_000;
        if (penalty == 0) return (0, inUsdc);
        poolManager.take(c, TREASURY, penalty);
        if (inUsdc) totals[id].penaltyUsdc += penalty;
        else totals[id].penaltyToken += penalty;
    }

    function _trackLiquidity(address sender, PoolKey calldata key, BalanceDelta delta) internal {
        if (sender == VAULT) return;
        PoolId id = key.toId();
        Pool storage p = pools[id];
        if (p.openedAt == 0) return;
        address trader = _trader(sender);
        int128 tok = p.tokenIs0 ? delta.amount0() : delta.amount1();
        uint256 earlier = _earlierMatched(id, trader, tok > 0, _match(id, trader, tok));
        if (earlier == 0) return;
        _count(id, 0, 0, earlier);
        emit RoundTripFlagged(id, trader, earlier, 0, true);
    }

    function _count(PoolId id, uint256 real, uint256 fake, uint256 moved) internal {
        uint256 day = currentDay(id);
        Totals storage t = totals[id];
        realVolume[id][day] = realVolume[id][day] + real - moved;
        t.realVolume = t.realVolume + real - moved;
        fakeVolume[id][day] += fake + moved;
        t.fakeVolume += fake + moved;
        if (fake + moved > 0) t.roundTrips += 1;
    }

    function _slot(PoolId id, address trader, uint256 kind) internal pure returns (bytes32) {
        return keccak256(abi.encode(id, trader, kind));
    }

    function _tget(bytes32 s) internal view returns (uint256 v) {
        assembly {
            v := tload(s)
        }
    }

    function _tset(bytes32 s, uint256 v) internal {
        assembly {
            tstore(s, v)
        }
    }

    function _match(PoolId id, address trader, int128 change) internal returns (uint256 matched) {
        if (change == 0) return 0;
        bytes32 sIn = _slot(id, trader, 0);
        bytes32 sOut = _slot(id, trader, 1);
        uint256 acquired = _tget(sIn);
        uint256 disposed = _tget(sOut);
        uint256 before = acquired < disposed ? acquired : disposed;
        if (change > 0) _tset(sIn, acquired += uint256(uint128(change)));
        else _tset(sOut, disposed += uint256(uint128(-change)));
        matched = (acquired < disposed ? acquired : disposed) - before;
    }

    function _earlierMatched(PoolId id, address trader, bool acquiring, uint256 matched) internal returns (uint256 v) {
        if (matched == 0) return 0;
        uint256 k = acquiring ? 4 : 2;
        bytes32 sU = _slot(id, trader, k);
        bytes32 sT = _slot(id, trader, k + 1);
        uint256 usd = _tget(sU);
        uint256 tokens = _tget(sT);
        if (tokens == 0) return 0;
        if (matched > tokens) matched = tokens;
        v = matched == tokens ? usd : usd * matched / tokens;
        _tset(sU, usd - v);
        _tset(sT, tokens - matched);
    }

    function _addOpen(PoolId id, address trader, bool acquiring, uint256 usd, uint256 tokens) internal {
        if (tokens == 0) return;
        uint256 k = acquiring ? 2 : 4;
        bytes32 sU = _slot(id, trader, k);
        bytes32 sT = _slot(id, trader, k + 1);
        _tset(sU, _tget(sU) + usd);
        _tset(sT, _tget(sT) + tokens);
    }

    function _resolved(address sender) internal view returns (address who) {
        (bool ok, bytes memory ret) = sender.staticcall{gas: 30_000}(abi.encodeCall(IMsgSender.msgSender, ()));
        if (ok && ret.length == 32) who = abi.decode(ret, (address));
    }

    function _trader(address sender) internal view returns (address) {
        address who = _resolved(sender);
        return who == address(0) ? sender : who;
    }

    function _isPaused(Pool storage p) internal view returns (bool) {
        return p.paused && block.timestamp < p.pausedAt + MAX_PAUSE;
    }

    function _agentPool(PoolId id) internal view returns (Pool storage p) {
        p = pools[id];
        if (p.openedAt == 0) revert UnknownPool();
        if (msg.sender != p.agent) revert OnlyAgent();
    }
}
