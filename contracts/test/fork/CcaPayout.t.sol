// SPDX-License-Identifier: MIT
pragma solidity 0.8.25;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {Hooks} from "@uniswap/v4-core/src/libraries/Hooks.sol";

import {AuctionDeployer} from "../../src/AuctionDeployer.sol";
import {PlainsightHook} from "../../src/PlainsightHook.sol";
import {GreenshoeVault} from "../../src/GreenshoeVault.sol";
import {MockToken} from "../../src/mocks/MockToken.sol";
import {TestUSDC} from "../../src/mocks/TestUSDC.sol";
import {IContinuousClearingAuction, IContinuousClearingAuctionFactory} from "../../src/interfaces/ICCA.sol";
import {LaunchTerms} from "../../src/interfaces/ILauncher.sol";
import {Manifest} from "../../src/interfaces/IManifest.sol";
import {ICcaBidder, IPermit2Allowance} from "../../src/interfaces/ICCA.sol";

contract CcaPayoutForkTest is Test {
    address internal constant FACTORY = 0x000000001F26a0044BaA66024e7b6599c61963F8;
    address internal constant PERMIT2 = 0x000000000022D473030F116dDEE9F6B43aC78BA3;
    address internal constant POOL_MANAGER = 0xE03A1074c86CFeDd5C142C4F04F1a1536e203543;
    uint160 internal constant HOOK_FLAGS = Hooks.BEFORE_INITIALIZE_FLAG | Hooks.BEFORE_ADD_LIQUIDITY_FLAG
        | Hooks.AFTER_ADD_LIQUIDITY_FLAG | Hooks.BEFORE_REMOVE_LIQUIDITY_FLAG | Hooks.AFTER_REMOVE_LIQUIDITY_FLAG
        | Hooks.BEFORE_SWAP_FLAG | Hooks.AFTER_SWAP_FLAG | Hooks.AFTER_SWAP_RETURNS_DELTA_FLAG;

    function REGISTRY() external view returns (address) {
        return address(this);
    }

    function get(bytes32) external pure returns (Manifest memory m) {
        (m.greenshoeBps, m.windowSecs, m.rangeDepthBps, m.minRaise) = (1500, 30 days, 1000, 800_000e6);
    }

    function isInsider(bytes32, address) external pure returns (bool) {
        return false;
    }

    function setUp() public {
        if (block.chainid != 11155111) vm.skip(true, "needs --fork-url <Sepolia RPC>");
    }

    function test_ccaPaysContractRecipient_andVaultSweeps() public {
        TestUSDC usdc = new TestUSDC();
        MockToken abc = new MockToken("ABC Network", "ABC", address(this), 2_000_000 ether);
        GreenshoeVault vault = new GreenshoeVault(IERC20(address(usdc)), IPoolManager(POOL_MANAGER));
        address hookAddr = address(uint160(0x4444) << 144 | HOOK_FLAGS);
        deployCodeTo(
            "PlainsightHook.sol:PlainsightHook",
            abi.encode(POOL_MANAGER, address(vault), address(this), address(this), address(this)),
            hookAddr
        );
        vault.setHook(PlainsightHook(hookAddr));
        AuctionDeployer deployer = new AuctionDeployer(IContinuousClearingAuctionFactory(FACTORY), address(usdc), address(vault));
        deployer.setLauncher(address(this));
        vault.setLauncher(address(this));

        bytes32 id = keccak256("fork-abc");
        LaunchTerms memory t = LaunchTerms({saleAmount: 1_000_000 ether, floorPriceUsdc: 500_000, durationBlocks: 20});
        (address auction, uint128 supply,,) = deployer.deploy(id, address(abc), 1500, 800_000e6, t);
        IContinuousClearingAuction a = IContinuousClearingAuction(auction);
        assertEq(a.fundsRecipient(), address(vault));
        assertEq(supply, 1_150_000 ether);
        vault.register(id, auction, address(0x15502), address(abc), 1500, 30 days);
        abc.transfer(auction, supply);
        a.onTokensReceived();

        vm.roll(a.startBlock());
        address bidder = makeAddr("bidder");
        usdc.mint(bidder, 1_000_000e6);
        vm.startPrank(bidder);
        usdc.approve(PERMIT2, type(uint256).max);
        IPermit2Allowance(PERMIT2).approve(address(usdc), auction, type(uint160).max, type(uint48).max);
        uint256 maxPrice = (uint256(120e4) << 96) / 1e18;
        maxPrice -= maxPrice % a.tickSpacing();
        uint256 bidId = ICcaBidder(auction).submitBid(maxPrice, 1_000_000e6, bidder, a.floorPrice(), "");
        vm.stopPrank();

        vm.roll(a.endBlock());
        vm.expectRevert();
        a.sweepCurrency();

        vault.collectAndPlace(id);
        GreenshoeVault.Sale memory s = vault.sale(id);
        assertTrue(s.graduated);
        uint256 fee = a.currencyRaised() - s.received;
        emit log_named_uint("currencyRaised (USDC base units)", a.currencyRaised());
        emit log_named_uint("received by vault", s.received);
        emit log_named_uint("protocol fee", fee);
        assertEq(fee, 0, "Sepolia factory has no fee controller");
        assertEq(s.toIssuer + s.reserve, s.received);
        assertTrue(s.poolOpened);
        assertGt(vault.status(id).usdcInWall, 0);
        assertEq(usdc.balanceOf(address(0x15502)), s.toIssuer);

        ICcaBidder(auction).exitBid(bidId);
        ICcaBidder(auction).claimTokens(bidId);
        assertGt(abc.balanceOf(bidder), 0);
    }
}
