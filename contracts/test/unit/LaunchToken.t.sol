// SPDX-License-Identifier: MIT
pragma solidity 0.8.25;

import {Test} from "forge-std/Test.sol";
import {LaunchToken} from "../../src/LaunchToken.sol";

contract LaunchTokenTest is Test {
    function test_mintsWholeSupplyToDeployer() public {
        address issuer = makeAddr("issuer");
        vm.prank(issuer);
        LaunchToken t = new LaunchToken("My Token", "MYT", 1_000_000 ether);
        assertEq(t.name(), "My Token");
        assertEq(t.symbol(), "MYT");
        assertEq(t.decimals(), 18);
        assertEq(t.totalSupply(), 1_000_000 ether);
        assertEq(t.balanceOf(issuer), 1_000_000 ether);
    }
}
