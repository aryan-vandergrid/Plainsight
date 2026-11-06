// SPDX-License-Identifier: MIT
pragma solidity 0.8.25;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract TestUSDC is ERC20 {
    uint256 public constant MAX_MINT = 1_000_000e6;

    error MintCapExceeded(uint256 amount, uint256 max);

    constructor() ERC20("USD Coin (Plainsight test)", "USDC") {}

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function mint(address to, uint256 amount) external {
        if (amount > MAX_MINT) revert MintCapExceeded(amount, MAX_MINT);
        _mint(to, amount);
    }
}
