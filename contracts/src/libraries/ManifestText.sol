// SPDX-License-Identifier: MIT
pragma solidity 0.8.25;

import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {LibISO8601} from "@ensdomains/contracts-v2/utils/LibISO8601.sol";

library ManifestText {
    using Strings for uint256;

    function tokenAmount(address token, uint256 amount) internal view returns (string memory) {
        IERC20Metadata t = IERC20Metadata(token);
        return string.concat(units(amount, t.decimals()), " ", t.symbol());
    }

    function usdc(uint256 amount) internal pure returns (string memory) {
        return string.concat(units(amount, 6), " USDC");
    }

    function bps(uint256 v) internal pure returns (string memory) {
        return string.concat(units(v, 2), "%");
    }

    function vesting(address vestingWallet, uint64 unlockDate, uint64 duration) internal pure returns (string memory) {
        if (vestingWallet == address(0)) return "unlocked";
        string memory date = LibISO8601.toISO8601(unlockDate);
        if (duration == 0) return string.concat("cliff ", date);
        return string.concat("linear ", date, " +", uint256(duration).toString(), "s");
    }

    function hash(bytes32 h) internal pure returns (string memory) {
        return uint256(h).toHexString(32);
    }

    function units(uint256 amount, uint8 decimals) internal pure returns (string memory) {
        uint256 base = 10 ** decimals;
        string memory whole = (amount / base).toString();
        uint256 frac = amount % base;
        if (frac == 0) return whole;
        uint8 digits = decimals;
        while (frac % 10 == 0) {
            frac /= 10;
            --digits;
        }
        bytes memory f = bytes(frac.toString());
        bytes memory padded = new bytes(digits);
        uint256 pad = digits - f.length;
        for (uint256 i; i < digits; ++i) {
            padded[i] = i < pad ? bytes1("0") : f[i - pad];
        }
        return string.concat(whole, ".", string(padded));
    }
}
