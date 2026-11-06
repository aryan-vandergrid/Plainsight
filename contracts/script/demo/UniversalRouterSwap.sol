// SPDX-License-Identifier: MIT
pragma solidity 0.8.25;

import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";

struct ExactInputSingleParams {
    PoolKey poolKey;
    bool zeroForOne;
    uint128 amountIn;
    uint128 amountOutMinimum;
    bytes hookData;
}

interface IUniversalRouter {
    function execute(bytes calldata commands, bytes[] calldata inputs, uint256 deadline) external payable;
}

library UniversalRouterSwap {
    address internal constant ROUTER = 0x3A9D48AB9751398BbFa63ad67599Bb04e4BdF98b;
    uint8 internal constant V4_SWAP = 0x10;
    uint8 internal constant SWAP_EXACT_IN_SINGLE = 0x06;
    uint8 internal constant SETTLE = 0x0b;
    uint8 internal constant SETTLE_ALL = 0x0c;
    uint8 internal constant TAKE_ALL = 0x0f;

    function single(PoolKey memory key, bool zeroForOne, uint128 amountIn, uint128 minOut)
        internal
        pure
        returns (bytes memory commands, bytes[] memory inputs)
    {
        bytes[] memory params = new bytes[](3);
        params[0] = abi.encode(ExactInputSingleParams(key, zeroForOne, amountIn, minOut, ""));
        (Currency cin, Currency cout) = zeroForOne ? (key.currency0, key.currency1) : (key.currency1, key.currency0);
        params[1] = abi.encode(cin, uint256(amountIn));
        params[2] = abi.encode(cout, uint256(minOut));
        return _wrap(abi.encodePacked(SWAP_EXACT_IN_SINGLE, SETTLE_ALL, TAKE_ALL), params);
    }

    function roundTrips(PoolKey memory key, bool tokenIs0, uint128 usdcIn, uint256 n)
        internal
        pure
        returns (bytes memory commands, bytes[] memory inputs)
    {
        Currency usdc = tokenIs0 ? key.currency1 : key.currency0;
        bool buy = !tokenIs0;
        bytes memory actions = abi.encodePacked(SETTLE);
        bytes[] memory params = new bytes[](2 * n + 2);
        params[0] = abi.encode(usdc, uint256(usdcIn), true);
        for (uint256 i; i < n; ++i) {
            params[1 + 2 * i] = abi.encode(ExactInputSingleParams(key, buy, 0, 0, ""));
            params[2 + 2 * i] = abi.encode(ExactInputSingleParams(key, !buy, 0, 0, ""));
            actions = abi.encodePacked(actions, SWAP_EXACT_IN_SINGLE, SWAP_EXACT_IN_SINGLE);
        }
        params[2 * n + 1] = abi.encode(usdc, uint256(0));
        return _wrap(abi.encodePacked(actions, TAKE_ALL), params);
    }

    function _wrap(bytes memory actions, bytes[] memory params) private pure returns (bytes memory commands, bytes[] memory inputs) {
        commands = abi.encodePacked(V4_SWAP);
        inputs = new bytes[](1);
        inputs[0] = abi.encode(actions, params);
    }
}
