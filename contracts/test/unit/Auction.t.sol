// SPDX-License-Identifier: MIT
pragma solidity 0.8.25;

import {AuctionDeployer} from "../../src/AuctionDeployer.sol";
import {GreenshoeVault} from "../../src/GreenshoeVault.sol";
import {IContinuousClearingAuction} from "../../src/interfaces/ICCA.sol";
import {AuctionInfo, CheckStatus, ILauncher, LaunchTerms} from "../../src/interfaces/ILauncher.sol";
import {Manifest, ManifestStatus} from "../../src/interfaces/IManifest.sol";
import {LaunchStack} from "../utils/LaunchStack.sol";
import {ICcaBidder} from "../../src/interfaces/ICCA.sol";

contract AuctionTest is LaunchStack {
    uint256 internal constant Q96 = 1 << 96;
    uint32 internal constant BLOCKS = 100;

    bytes32 internal id;

    function setUp() public {
        _deployStack();
        id = _post();
    }

    function test_launch_deploysCcaWithDisclosedParameters() public {
        uint256 before = abc.balanceOf(issuer);
        IContinuousClearingAuction a = _launch(id, _terms(BLOCKS));

        assertEq(a.totalSupply(), 1_150_000 ether, "115% of the planned sale");
        assertEq(abc.balanceOf(address(a)), 1_150_000 ether);
        assertEq(abc.balanceOf(issuer), before - 1_150_000 ether);
        assertEq(a.token(), address(abc));
        assertEq(a.currency(), address(usdc));
        assertEq(a.fundsRecipient(), address(vault));
        assertEq(a.tokensRecipient(), address(vault));
        assertEq(a.startBlock(), block.number + 1);
        assertEq(a.endBlock(), block.number + 1 + BLOCKS);
        assertEq(a.claimBlock(), a.endBlock());
        assertEq(_cents(a.floorPrice()), 50, "floor $0.50");
        assertEq(a.tickSpacing() * 100, a.floorPrice(), "tick = 1% of the floor");

        assertEq(uint8(registry.status(id)), uint8(ManifestStatus.Locked));
        AuctionInfo memory info = launcher.auctionInfo(id);
        assertEq(info.auction, address(a));
        assertEq(info.supply, 1_150_000 ether);
        assertEq(vault.sale(id).auction, address(a));
        assertEq(vault.sale(id).issuer, issuer);

        CheckStatus[8] memory st = launcher.checks(id);
        assertEq(uint8(st[6]), uint8(CheckStatus.Passed), "check 7 holds against the live auction");
        (bool ok,) = launcher.verify(id);
        assertTrue(ok);
    }

    function test_launch_onlyIssuer() public {
        vm.expectRevert(ILauncher.NotIssuer.selector);
        launcher.launch(id, _terms(BLOCKS));
    }

    function test_launch_onlyOnce() public {
        _launch(id, _terms(BLOCKS));
        vm.prank(issuer);
        vm.expectRevert(abi.encodeWithSelector(ILauncher.AlreadyLaunched.selector, id));
        launcher.launch(id, _terms(BLOCKS));
    }

    function test_launch_rejectsBadTerms() public {
        vm.startPrank(issuer);
        abc.approve(address(launcher), type(uint256).max);

        LaunchTerms memory t = _terms(BLOCKS);
        t.saleAmount = 0;
        vm.expectRevert(AuctionDeployer.InvalidSaleAmount.selector);
        launcher.launch(id, t);

        t = _terms(9);
        vm.expectRevert(abi.encodeWithSelector(AuctionDeployer.InvalidDuration.selector, 9, 10, 50_400));
        launcher.launch(id, t);

        t = _terms(50_401);
        vm.expectRevert(abi.encodeWithSelector(AuctionDeployer.InvalidDuration.selector, 50_401, 10, 50_400));
        launcher.launch(id, t);

        t = _terms(BLOCKS);
        t.floorPriceUsdc = 0;
        vm.expectRevert(abi.encodeWithSelector(AuctionDeployer.FloorPriceTooLow.selector, 0));
        launcher.launch(id, t);
        vm.stopPrank();
    }

    function test_launch_revertsWithoutEnoughTokens() public {
        vm.startPrank(issuer);
        abc.transfer(address(0xdead), abc.balanceOf(issuer) - 1_000_000 ether);
        abc.approve(address(launcher), type(uint256).max);
        vm.expectRevert();
        launcher.launch(id, _terms(BLOCKS));
        vm.stopPrank();
        assertEq(launcher.auctionInfo(id).auction, address(0), "nothing launched");
    }

    function test_check7_failsWithoutMinRaise() public {
        Manifest memory m = _abcManifest(address(abc), "nominraise");
        m.minRaise = 0;
        bytes32 bad = _post(m);
        (bool ok, uint8 failed) = launcher.verify(bad);
        assertFalse(ok);
        assertEq(failed, 7);
        vm.prank(issuer);
        vm.expectRevert(abi.encodeWithSelector(ILauncher.NotVerified.selector, bad, uint8(7)));
        launcher.launch(bad, _terms(BLOCKS));
    }

    function test_auction_clearsAroundOneDollar_andVaultSplits() public {
        IContinuousClearingAuction a = _launch(id, _terms(BLOCKS));
        vm.roll(a.startBlock());
        (uint256[] memory ids, address[] memory owners, uint256[] memory maxCents, uint256 totalBid) = _demoBids(a);
        uint64 bidBlock = uint64(block.number);

        vm.roll(a.endBlock());
        vm.expectRevert();
        a.sweepCurrency();

        vault.collectAndPlace(id);
        uint256 clearing = a.clearingPrice();
        uint256 cents = _cents(clearing);
        assertGe(cents, 99, "clears at about $1.00");
        assertLe(cents, 103, "clears at about $1.00");
        assertTrue(a.isGraduated());

        (uint256 refunds, uint256 claimed) = _exitAndClaimAll(a, ids, owners, maxCents, bidBlock);
        GreenshoeVault.Sale memory s = vault.sale(id);
        assertTrue(s.collected && s.graduated);
        assertEq(s.received, a.currencyRaised(), "no protocol fee on this factory");
        assertApproxEqAbs(s.received + refunds, totalBid, 30, "USDC conserved (rounding dust only)");
        assertLe(claimed + s.unsoldTokens, 1_150_000 ether);
        assertApproxEqRel(claimed + s.unsoldTokens, 1_150_000 ether, 1e12, "tokens conserved (rounding dust only)");

        assertEq(s.toIssuer, s.received * 10_000 / 11_500);
        assertEq(s.reserve, s.received - s.toIssuer);
        assertEq(usdc.balanceOf(issuer), s.toIssuer);
        GreenshoeVault.Status memory st = vault.status(id);
        assertEq(usdc.balanceOf(address(vault)), st.usdcUnplaced);
        assertApproxEqAbs(st.usdcInWall + st.usdcUnplaced, s.reserve, 10, "reserve = wall + unplaced");
        assertApproxEqRel(s.received, 1_150_000e6, 0.03e18, "raised about $1.15M");

        vm.expectRevert(abi.encodeWithSelector(GreenshoeVault.AlreadyCollected.selector, id));
        vault.collectAndPlace(id);
    }

    function test_vault_settleReturnsReserveAfterWindow() public {
        IContinuousClearingAuction a = _launch(id, _terms(BLOCKS));
        vm.roll(a.startBlock());
        _bid(a, address(0xB1), 120, 900_000e6);
        vm.roll(a.endBlock());

        vm.expectRevert(abi.encodeWithSelector(GreenshoeVault.NotCollected.selector, id));
        vault.settle(id);
        vault.collectAndPlace(id);
        uint256 reserve = vault.sale(id).reserve;
        assertGt(reserve, 0);

        uint64 endsAt = uint64(block.timestamp + 30 days);
        vm.expectRevert(abi.encodeWithSelector(GreenshoeVault.WindowOpen.selector, endsAt));
        vault.settle(id);

        uint256 before = usdc.balanceOf(issuer);
        vm.warp(endsAt);
        vault.settle(id);
        assertApproxEqAbs(usdc.balanceOf(issuer), before + reserve, 10);
        assertEq(usdc.balanceOf(address(vault)), 0);
        vm.expectRevert(abi.encodeWithSelector(GreenshoeVault.AlreadySettled.selector, id));
        vault.settle(id);
    }

    function test_auction_belowMinRaise_refundsEveryone() public {
        IContinuousClearingAuction a = _launch(id, _terms(BLOCKS));
        vm.roll(a.startBlock());
        uint256 b1 = _bid(a, address(0xA1), 90, 200_000e6);
        uint256 b2 = _bid(a, address(0xA2), 150, 300_000e6);
        vm.roll(a.endBlock());

        assertFalse(a.isGraduated());
        ICcaBidder(address(a)).exitBid(b1);
        ICcaBidder(address(a)).exitBid(b2);
        assertEq(usdc.balanceOf(address(0xA1)), 200_000e6, "full refund");
        assertEq(usdc.balanceOf(address(0xA2)), 300_000e6, "full refund");
        vm.expectRevert();
        ICcaBidder(address(a)).claimTokens(b1);

        uint256 tokensBefore = abc.balanceOf(issuer);
        vault.collectAndPlace(id);
        GreenshoeVault.Sale memory s = vault.sale(id);
        assertFalse(s.graduated);
        assertEq(s.received, 0);
        assertEq(s.toIssuer, 0);
        assertEq(s.reserve, 0, "vault holds nothing");
        assertEq(s.unsoldTokens, 1_150_000 ether, "whole supply returns to the issuer");
        assertEq(abc.balanceOf(issuer), tokensBefore + 1_150_000 ether);
    }

    function test_vault_guards() public {
        vm.expectRevert(abi.encodeWithSelector(GreenshoeVault.UnknownSale.selector, id));
        vault.collectAndPlace(id);
        vm.expectRevert(GreenshoeVault.NotLauncher.selector);
        vault.register(id, address(1), issuer, address(abc), 1500, 30 days);

        IContinuousClearingAuction a = _launch(id, _terms(BLOCKS));
        vm.roll(a.endBlock() - 1);
        vm.expectRevert();
        vault.collectAndPlace(id);
        assertFalse(vault.sale(id).collected, "a reverted collect changes nothing");
    }

    function test_deployer_guards() public {
        vm.expectRevert(AuctionDeployer.NotLauncher.selector);
        auctions.deploy(id, address(abc), 1500, 1, _terms(BLOCKS));
        vm.expectRevert(AuctionDeployer.LauncherAlreadySet.selector);
        auctions.setLauncher(address(this));
    }

    function testFuzz_schedule(uint32 blocks) public view {
        blocks = uint32(bound(blocks, 10, 50_400));
        bytes memory data = auctions.schedule(blocks);
        assertEq(data.length, 16);
        (uint24 mps1, uint40 d1) = _parse(data, 0);
        (uint24 mps2, uint40 d2) = _parse(data, 8);
        assertEq(uint256(mps1) * d1 + mps2, 1e7);
        assertEq(d1 + d2, blocks);
        assertGe(mps2, 3e6);
    }

    function _demoBids(IContinuousClearingAuction a)
        internal
        returns (uint256[] memory ids, address[] memory owners, uint256[] memory cents, uint256 total)
    {
        uint16[30] memory c = [
            uint16(70), 75, 80, 85, 90, 95, 100, 100, 100, 100, 102, 104, 105, 106, 108, 110, 112, 115, 118, 120,
            122, 125, 128, 130, 135, 140, 145, 150, 155, 160
        ];
        uint32[30] memory k = [
            uint32(60), 50, 70, 40, 50, 30, 50, 40, 35, 25, 80, 70, 60, 55, 65, 75, 50, 70, 45, 80, 40, 60, 35, 70,
            45, 55, 40, 60, 45, 50
        ];
        ids = new uint256[](30);
        owners = new address[](30);
        cents = new uint256[](30);
        for (uint256 i; i < 30; ++i) {
            owners[i] = address(uint160(0xB000 + i));
            cents[i] = c[i];
            uint256 amount = uint256(k[i]) * 1000e6;
            total += amount;
            ids[i] = _bid(a, owners[i], c[i], amount);
        }
    }

    function _exitAndClaimAll(
        IContinuousClearingAuction a,
        uint256[] memory ids,
        address[] memory owners,
        uint256[] memory maxCents,
        uint64 bidBlock
    ) internal returns (uint256 refunds, uint256 claimed) {
        uint256 clearing = a.clearingPrice();
        for (uint256 i; i < ids.length; ++i) {
            uint256 usdcBefore = usdc.balanceOf(owners[i]);
            uint256 maxQ = _price(a, maxCents[i]);
            if (maxQ > clearing) ICcaBidder(address(a)).exitBid(ids[i]);
            else if (maxQ == clearing) ICcaBidder(address(a)).exitPartiallyFilledBid(ids[i], bidBlock, 0);
            else ICcaBidder(address(a)).exitPartiallyFilledBid(ids[i], bidBlock, a.endBlock());
            ICcaBidder(address(a)).claimTokens(ids[i]);
            refunds += usdc.balanceOf(owners[i]) - usdcBefore;
            claimed += abc.balanceOf(owners[i]);
            if (maxQ < clearing) assertEq(abc.balanceOf(owners[i]), 0, "outbid bids buy nothing");
        }
    }

    function _cents(uint256 q) internal pure returns (uint256) {
        return (q * 1e18 / Q96 + 5e3) / 1e4;
    }

    function _parse(bytes memory data, uint256 o) internal pure returns (uint24 mps, uint40 delta) {
        uint64 v;
        for (uint256 i; i < 8; ++i) {
            v = (v << 8) | uint8(data[o + i]);
        }
        (mps, delta) = (uint24(v >> 40), uint40(v));
    }
}
