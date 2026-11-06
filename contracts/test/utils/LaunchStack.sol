// SPDX-License-Identifier: MIT
pragma solidity 0.8.25;

import {IEnhancedAccessControl} from "@ensdomains/contracts-v2/access-control/interfaces/IEnhancedAccessControl.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {Hooks} from "@uniswap/v4-core/src/libraries/Hooks.sol";

import {AuctionDeployer} from "../../src/AuctionDeployer.sol";
import {PlainsightHook} from "../../src/PlainsightHook.sol";
import {GreenshoeVault} from "../../src/GreenshoeVault.sol";
import {Launcher} from "../../src/Launcher.sol";
import {ManifestRegistry} from "../../src/ManifestRegistry.sol";
import {VestingWalletFactory} from "../../src/VestingWalletFactory.sol";
import {MockToken} from "../../src/mocks/MockToken.sol";
import {TestUSDC} from "../../src/mocks/TestUSDC.sol";
import {PlainsightEnsRoles} from "../../src/ens/PlainsightEnsRoles.sol";
import {
    ICcaBidder, IContinuousClearingAuction, IContinuousClearingAuctionFactory, IPermit2Allowance
} from "../../src/interfaces/ICCA.sol";
import {LaunchTerms} from "../../src/interfaces/ILauncher.sol";
import {Manifest} from "../../src/interfaces/IManifest.sol";
import {LocalEns} from "./LocalEns.sol";
import {ManifestFixture} from "./ManifestFixture.sol";

abstract contract LaunchStack is LocalEns, ManifestFixture {
    address internal constant PERMIT2 = 0x000000000022D473030F116dDEE9F6B43aC78BA3;

    ManifestRegistry internal registry;
    Launcher internal launcher;
    AuctionDeployer internal auctions;
    GreenshoeVault internal vault;
    TestUSDC internal usdc;
    MockToken internal abc;
    IPoolManager internal poolManager;
    PlainsightHook internal hook;
    address internal treasury = makeAddr("treasury");

    uint160 internal constant HOOK_FLAGS = Hooks.BEFORE_INITIALIZE_FLAG | Hooks.BEFORE_ADD_LIQUIDITY_FLAG
        | Hooks.AFTER_ADD_LIQUIDITY_FLAG | Hooks.BEFORE_REMOVE_LIQUIDITY_FLAG | Hooks.AFTER_REMOVE_LIQUIDITY_FLAG
        | Hooks.BEFORE_SWAP_FLAG | Hooks.AFTER_SWAP_FLAG | Hooks.AFTER_SWAP_RETURNS_DELTA_FLAG;

    function _deployStack() internal {
        _deployLocalEns();
        deployCodeTo("Permit2.sol:Permit2", PERMIT2);
        address ccaFactory = deployCode("ContinuousClearingAuctionFactory.sol:ContinuousClearingAuctionFactory", abi.encode(address(0)));

        poolManager = IPoolManager(deployCode("PoolManager.sol:PoolManager", abi.encode(address(this))));

        usdc = new TestUSDC();
        registry = new ManifestRegistry();
        vault = new GreenshoeVault(IERC20(address(usdc)), poolManager);
        address hookAddr = address(uint160(0x4444) << 144 | HOOK_FLAGS);
        deployCodeTo(
            "PlainsightHook.sol:PlainsightHook", abi.encode(poolManager, address(vault), registry, treasury, address(this)), hookAddr
        );
        hook = PlainsightHook(hookAddr);
        vault.setHook(hook);
        auctions = new AuctionDeployer(IContinuousClearingAuctionFactory(ccaFactory), address(usdc), address(vault));
        launcher = new Launcher(
            registry, new VestingWalletFactory(), auctions, factory, userRegistryImpl, ethRegistry, plainsightRegistry, resolver
        );
        registry.setLauncher(address(launcher));
        auctions.setLauncher(address(launcher));
        vault.setLauncher(address(launcher));

        vm.startPrank(ensDeployer);
        plainsightRegistry.grantRootRoles(PlainsightEnsRoles.LAUNCHER_REGISTRY_ROLES, address(launcher));
        IEnhancedAccessControl(resolver).grantRootRoles(PlainsightEnsRoles.LAUNCHER_RESOLVER_ROLES, address(launcher));
        vm.stopPrank();

        abc = new MockToken("ABC Network", "ABC", issuer, 10_000_000 ether);
    }

    function _post() internal returns (bytes32 id) {
        id = _post(_abcManifest(address(abc), "abc"));
    }

    function _post(Manifest memory m) internal returns (bytes32 id) {
        vm.startPrank(issuer);
        abc.approve(address(launcher), 300_000 ether);
        id = launcher.postManifest(m);
        vm.stopPrank();
    }

    function _terms(uint32 blocks) internal pure returns (LaunchTerms memory) {
        return LaunchTerms({saleAmount: 1_000_000 ether, floorPriceUsdc: 500_000, durationBlocks: blocks});
    }

    function _launch(bytes32 id, LaunchTerms memory t) internal returns (IContinuousClearingAuction a) {
        vm.startPrank(issuer);
        abc.approve(address(launcher), type(uint256).max);
        a = IContinuousClearingAuction(launcher.launch(id, t));
        vm.stopPrank();
    }

    function _price(IContinuousClearingAuction a, uint256 cents) internal view returns (uint256 q) {
        q = (cents * 1e4 << 96) / 1e18;
        q -= q % a.tickSpacing();
    }

    function _bid(IContinuousClearingAuction a, address who, uint256 cents, uint256 usdcAmount) internal returns (uint256 bidId) {
        deal(address(usdc), who, usdc.balanceOf(who) + usdcAmount);
        vm.startPrank(who);
        usdc.approve(PERMIT2, type(uint256).max);
        IPermit2Allowance(PERMIT2).approve(address(usdc), address(a), type(uint160).max, type(uint48).max);
        bidId = ICcaBidder(address(a)).submitBid(_price(a, cents), uint128(usdcAmount), who, a.floorPrice(), "");
        vm.stopPrank();
    }
}
