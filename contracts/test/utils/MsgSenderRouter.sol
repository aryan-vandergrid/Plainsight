// SPDX-License-Identifier: MIT
pragma solidity 0.8.25;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {IUnlockCallback} from "@uniswap/v4-core/src/interfaces/callback/IUnlockCallback.sol";
import {TickMath} from "@uniswap/v4-core/src/libraries/TickMath.sol";
import {TransientStateLibrary} from "@uniswap/v4-core/src/libraries/TransientStateLibrary.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {ModifyLiquidityParams, SwapParams} from "@uniswap/v4-core/src/types/PoolOperation.sol";
import {IMsgSender} from "v4-periphery/src/interfaces/IMsgSender.sol";

contract MsgSenderRouter is IUnlockCallback, IMsgSender {
    using TransientStateLibrary for IPoolManager;

    struct Op {
        bool isSwap;
        bool zeroForOne;
        int256 amount;
        int24 tickLower;
        int24 tickUpper;
    }

    IPoolManager public immutable PM;
    address internal locker;

    constructor(IPoolManager pm) {
        PM = pm;
    }

    function msgSender() external view returns (address) {
        return locker;
    }

    function run(PoolKey calldata key, Op[] calldata ops) external {
        locker = msg.sender;
        PM.unlock(abi.encode(key, ops));
        locker = address(0);
    }

    function unlockCallback(bytes calldata data) external returns (bytes memory) {
        require(msg.sender == address(PM), "only PM");
        (PoolKey memory key, Op[] memory ops) = abi.decode(data, (PoolKey, Op[]));
        for (uint256 i; i < ops.length; ++i) {
            Op memory o = ops[i];
            if (o.isSwap) {
                PM.swap(
                    key,
                    SwapParams(o.zeroForOne, -o.amount, o.zeroForOne ? TickMath.MIN_SQRT_PRICE + 1 : TickMath.MAX_SQRT_PRICE - 1),
                    ""
                );
            } else {
                PM.modifyLiquidity(key, ModifyLiquidityParams(o.tickLower, o.tickUpper, o.amount, 0), "");
            }
        }
        _settle(key.currency0);
        _settle(key.currency1);
        return "";
    }

    function _settle(Currency c) internal {
        int256 d = PM.currencyDelta(address(this), c);
        if (d < 0) {
            PM.sync(c);
            IERC20(Currency.unwrap(c)).transferFrom(locker, address(PM), uint256(-d));
            PM.settle();
        } else if (d > 0) {
            PM.take(c, locker, uint256(d));
        }
    }
}
