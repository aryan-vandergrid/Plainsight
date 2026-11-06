// SPDX-License-Identifier: MIT
pragma solidity 0.8.25;

import {VestingWallet} from "@openzeppelin/contracts/finance/VestingWallet.sol";

contract VestingWalletFactory {
    event VestingWalletCreated(address indexed vesting, address indexed beneficiary, uint64 start, uint64 duration);

    mapping(address vesting => bool) public isVestingWallet;

    function create(address beneficiary, uint64 start, uint64 duration) external returns (address vesting) {
        vesting = address(new VestingWallet(beneficiary, start, duration));
        isVestingWallet[vesting] = true;
        emit VestingWalletCreated(vesting, beneficiary, start, duration);
    }
}
