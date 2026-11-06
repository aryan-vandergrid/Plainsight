// SPDX-License-Identifier: MIT
pragma solidity 0.8.25;

import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {PoolId} from "@uniswap/v4-core/src/types/PoolId.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {StateLibrary} from "@uniswap/v4-core/src/libraries/StateLibrary.sol";

import {FlagRegistry, IReceiver} from "../../src/FlagRegistry.sol";
import {PlainsightHook} from "../../src/PlainsightHook.sol";
import {MsgSenderRouter} from "../utils/MsgSenderRouter.sol";
import {PoolStack} from "../utils/PoolStack.sol";

contract FlagsTest is PoolStack {
    using StateLibrary for *;

    address internal constant SIM_FORWARDER = 0x15fC6ae953E024d975e77382eEeC56A9101f9F88;
    address internal constant FORWARDER = 0xF8344CFd5c43616a4366C34E3EEE75af79a74482;
    FlagRegistry internal flags;
    address internal signer = makeAddr("signer");
    address internal ring = makeAddr("wash ring wallet");
    bytes32 internal id;
    PoolKey internal key;
    PoolId internal pid;
    bool internal tokenIs0;

    function setUp() public {
        _deployPoolStack();
        flags = new FlagRegistry(SIM_FORWARDER, FORWARDER, signer);
        hook.setFlagRegistry(flags);
        (id,) = _graduate(abc, "abc");
        key = vault.poolKey(id);
        pid = key.toId();
        tokenIs0 = Currency.unwrap(key.currency0) == address(abc);
    }

    function _flagReport(address w, bytes32 reason) internal pure returns (bytes memory) {
        address[] memory ws = new address[](1);
        bytes32[] memory rs = new bytes32[](1);
        (ws[0], rs[0]) = (w, reason);
        return abi.encode(uint8(1), abi.encode(bytes32(0), ws, rs));
    }

    function test_onReport_fromForwarders_flags() public {
        bytes memory r = _withToken(_flagReport(ring, keccak256("cross-tx wash ring")));
        vm.prank(SIM_FORWARDER);
        flags.onReport("", r);
        assertTrue(flags.isFlagged(id, ring));
        assertEq(flags.flagCount(id), 1);

        vm.expectRevert(abi.encodeWithSelector(FlagRegistry.NotAuthorized.selector, address(this)));
        flags.onReport("", r);
        assertTrue(flags.supportsInterface(type(IReceiver).interfaceId));
    }

    function test_flaggedSeller_paysInsiderFee() public {
        assertEq(hook.feeFor(pid, ring, tokenIs0), 3000);
        vm.prank(FORWARDER);
        flags.onReport("", _withToken(_flagReport(ring, keccak256("insider funded fresh wallet"))));
        assertEq(hook.feeFor(pid, ring, tokenIs0), 30_000, "3% while flagged");
        assertEq(hook.feeFor(pid, ring, !tokenIs0), 3000, "buys unaffected");

        MsgSenderRouter router = new MsgSenderRouter(poolManager);
        (uint160 open,,,) = poolManager.getSlot0(pid);
        _addFullRange(key, address(abc), 200_000 ether, open);
        abc.mint(ring, 10_000 ether);
        vm.startPrank(ring);
        abc.approve(address(router), type(uint256).max);
        MsgSenderRouter.Op[] memory ops = new MsgSenderRouter.Op[](1);
        ops[0] = MsgSenderRouter.Op(true, tokenIs0, int256(10_000 ether), 0, 0);
        router.run(key, ops);
        vm.stopPrank();
        assertEq(hook.stats(pid).insiderSells, 1);

        vm.prank(signer);
        flags.unflag(id, ring);
        assertEq(hook.feeFor(pid, ring, tokenIs0), 3000, "back to normal once unflagged");
    }

    function test_directSigner_andReports() public {
        vm.expectRevert(abi.encodeWithSelector(FlagRegistry.NotAuthorized.selector, address(this)));
        flags.flag(id, ring, keccak256("x"));
        vm.startPrank(signer);
        flags.flag(id, ring, keccak256("x"));
        vm.expectRevert(FlagRegistry.EmptyReason.selector);
        flags.flag(id, ring, bytes32(0));
        vm.stopPrank();

        bytes memory rep = abi.encode(uint8(3), abi.encode(id, uint16(1), keccak256("day-1 json"), "http://localhost:3000/api/feed/abc"));
        vm.prank(SIM_FORWARDER);
        flags.onReport("", rep);
        FlagRegistry.Report[] memory rs = flags.reportsOf(id);
        assertEq(rs.length, 1);
        assertEq(rs[0].day, 1);
        assertEq(rs[0].hash, keccak256("day-1 json"));

        vm.prank(SIM_FORWARDER);
        vm.expectRevert(abi.encodeWithSelector(FlagRegistry.UnknownKind.selector, 9));
        flags.onReport("", abi.encode(uint8(9), bytes("")));
    }

    function test_hookFlagRegistry_setOnceByAdmin() public {
        vm.expectRevert(PlainsightHook.AlreadySet.selector);
        hook.setFlagRegistry(flags);
    }

    function _withToken(bytes memory report) internal view returns (bytes memory) {
        (uint8 kind, bytes memory payload) = abi.decode(report, (uint8, bytes));
        (, address[] memory ws, bytes32[] memory rs) = abi.decode(payload, (bytes32, address[], bytes32[]));
        return abi.encode(kind, abi.encode(id, ws, rs));
    }
}
