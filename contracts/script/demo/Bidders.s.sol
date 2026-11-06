// SPDX-License-Identifier: MIT
pragma solidity 0.8.25;

import {Script, console2} from "forge-std/Script.sol";

import {GreenshoeVault} from "../../src/GreenshoeVault.sol";
import {Launcher} from "../../src/Launcher.sol";
import {ManifestRegistry} from "../../src/ManifestRegistry.sol";
import {TestUSDC} from "../../src/mocks/TestUSDC.sol";
import {
    CcaBid,
    CcaCheckpoint,
    ICcaBidder,
    IContinuousClearingAuction,
    IPermit2Allowance
} from "../../src/interfaces/ICCA.sol";
import {AuctionInfo} from "../../src/interfaces/ILauncher.sol";
import {UniswapConfig} from "../UniswapConfig.sol";

contract Bidders is Script {
    Launcher internal launcher;
    ManifestRegistry internal registry;
    TestUSDC internal usdc;

    function _load(string calldata label) internal returns (bytes32 id, IContinuousClearingAuction a) {
        string memory json = vm.readFile("./addresses.json");
        launcher = Launcher(vm.parseJsonAddress(json, ".launcher"));
        registry = ManifestRegistry(vm.parseJsonAddress(json, ".manifestRegistry"));
        usdc = TestUSDC(vm.parseJsonAddress(json, ".usdc"));
        id = registry.idOf(label);
        AuctionInfo memory info = launcher.auctionInfo(id);
        require(info.auction != address(0), "not launched: run demo/Launch.s.sol first");
        a = IContinuousClearingAuction(info.auction);
    }

    function _payer() internal view returns (uint256) {
        return vm.envOr("BIDDER_PK", vm.envUint("DEPLOYER_PK"));
    }

    function run(string calldata label) external {
        (, IContinuousClearingAuction a) = _load(label);
        (uint16[30] memory cents, uint32[30] memory thousands) = _book();
        _placeAll(label, a, cents, thousands, 0, 30);
    }

    function resume(string calldata label, uint256 from) external {
        (, IContinuousClearingAuction a) = _load(label);
        (uint16[30] memory cents, uint32[30] memory thousands) = _book();
        _placeAll(label, a, cents, thousands, from, 30);
    }

    function thin(string calldata label) external {
        (, IContinuousClearingAuction a) = _load(label);
        uint16[30] memory cents;
        uint32[30] memory thousands;
        (cents[0], cents[1], cents[2]) = (90, 110, 150);
        (thousands[0], thousands[1], thousands[2]) = (100, 120, 80);
        _placeAll(label, a, cents, thousands, 0, 3);
    }

    function settle(string calldata label) external {
        (bytes32 id, IContinuousClearingAuction a) = _load(label);
        require(block.number >= a.endBlock(), "auction still running");
        GreenshoeVault vault = launcher.VAULT();

        vm.startBroadcast(_payer());
        if (!vault.sale(id).collected) vault.collectAndPlace(id);
        vm.stopBroadcast();

        uint256 n = _exitAndClaimAll(a);
        console2.log("Exited and claimed bids:", n);
    }

    function _exitAndClaimAll(IContinuousClearingAuction a) internal returns (uint256 n) {
        ICcaBidder b = ICcaBidder(address(a));
        uint256 clearing = a.clearingPrice();
        bool graduated = a.isGraduated();
        (uint64[] memory blocks, uint256[] memory prices) = _checkpoints(b);
        n = b.nextBidId();
        console2.log(graduated ? "Graduated. Final price (cents):" : "Did not graduate: refunding every bid. Cents:", _cents(clearing));

        vm.startBroadcast(_payer());
        for (uint256 i; i < n; ++i) {
            CcaBid memory bid = b.bids(i);
            if (bid.exitedBlock == 0) {
                if (!graduated || bid.maxPrice > clearing) {
                    b.exitBid(i);
                } else {
                    (uint64 lastFull, uint64 outbid) = _hints(blocks, prices, bid.maxPrice, clearing);
                    b.exitPartiallyFilledBid(i, lastFull, outbid);
                }
            }
            if (graduated && b.bids(i).tokensFilled > 0) b.claimTokens(i);
        }
        vm.stopBroadcast();
    }

    function _placeAll(
        string calldata label,
        IContinuousClearingAuction a,
        uint16[30] memory cents,
        uint32[30] memory thousands,
        uint256 from,
        uint256 count
    ) internal {
        require(block.number >= a.startBlock() && block.number < a.endBlock(), "auction is not live");
        uint256 total;
        for (uint256 i = from; i < count; ++i) {
            total += uint256(thousands[i]) * 1000e6;
        }
        vm.startBroadcast(_payer());
        _fund(address(a), total);
        uint256 placed = _submit(label, a, cents, thousands, from, count);
        vm.stopBroadcast();
        console2.log("Bids placed:", placed);
        console2.log("USDC committed (whole):", total / 1e6);
    }

    function _fund(address auction, uint256 total) internal {
        address payer = vm.addr(_payer());
        uint256 have = usdc.balanceOf(payer);
        while (have < total) {
            uint256 m = total - have > usdc.MAX_MINT() ? usdc.MAX_MINT() : total - have;
            usdc.mint(payer, m);
            have += m;
        }
        if (usdc.allowance(payer, UniswapConfig.PERMIT2) < total) usdc.approve(UniswapConfig.PERMIT2, type(uint256).max);
        (uint160 allowed, uint48 exp,) = IPermit2Allowance(UniswapConfig.PERMIT2).allowance(payer, address(usdc), auction);
        if (allowed < total || exp < block.timestamp + 1 days) {
            IPermit2Allowance(UniswapConfig.PERMIT2).approve(
                address(usdc), auction, type(uint160).max, uint48(block.timestamp + 30 days)
            );
        }
    }

    function _submit(
        string calldata label,
        IContinuousClearingAuction a,
        uint16[30] memory cents,
        uint32[30] memory thousands,
        uint256 from,
        uint256 count
    ) internal returns (uint256 placed) {
        uint256 hint = a.floorPrice();
        for (uint256 i = from; i < count; ++i) {
            uint256 price = _price(a, cents[i]);
            if (price <= a.clearingPrice()) {
                console2.log("skip: at or below the clearing price (cents)", cents[i]);
                continue;
            }
            ICcaBidder(address(a)).submitBid(price, uint128(uint256(thousands[i]) * 1000e6), bidder(label, i), hint, "");
            ++placed;
        }
    }

    function bidder(string calldata label, uint256 i) public pure returns (address) {
        return vm.addr(uint256(keccak256(abi.encodePacked("plainsight-bidder/", label, "/", vm.toString(i)))));
    }

    function _book() internal pure returns (uint16[30] memory cents, uint32[30] memory thousands) {
        cents = [
            uint16(70), 75, 80, 85, 90, 95, 100, 100, 100, 100, 102, 104, 105, 106, 108, 110, 112, 115, 118, 120, 122,
            125, 128, 130, 135, 140, 145, 150, 155, 160
        ];
        thousands = [
            uint32(60), 50, 70, 40, 50, 30, 50, 40, 35, 25, 80, 70, 60, 55, 65, 75, 50, 70, 45, 80, 40, 60, 35, 70, 45,
            55, 40, 60, 45, 50
        ];
    }

    function _price(IContinuousClearingAuction a, uint256 c) internal view returns (uint256 q) {
        q = (c * 1e4 << 96) / 1e18;
        q -= q % a.tickSpacing();
    }

    function _cents(uint256 q) internal pure returns (uint256) {
        return (q * 1e18 / (1 << 96) + 5e3) / 1e4;
    }

    function _checkpoints(ICcaBidder b) internal view returns (uint64[] memory blocks, uint256[] memory prices) {
        uint256 n;
        for (uint64 k = b.lastCheckpointedBlock(); k != 0; k = b.checkpoints(k).prev) ++n;
        blocks = new uint64[](n);
        prices = new uint256[](n);
        uint64 k = b.lastCheckpointedBlock();
        for (uint256 i = n; i > 0; --i) {
            CcaCheckpoint memory c = b.checkpoints(k);
            (blocks[i - 1], prices[i - 1]) = (k, c.clearingPrice);
            k = c.prev;
        }
    }

    function _hints(uint64[] memory blocks, uint256[] memory prices, uint256 maxPrice, uint256 finalPrice)
        internal
        pure
        returns (uint64 lastFull, uint64 outbid)
    {
        for (uint256 i; i < blocks.length; ++i) {
            if (prices[i] < maxPrice) lastFull = blocks[i];
            if (outbid == 0 && prices[i] > maxPrice) outbid = blocks[i];
        }
        if (finalPrice == maxPrice) outbid = 0;
    }
}
