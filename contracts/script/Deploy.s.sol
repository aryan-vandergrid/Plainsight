// SPDX-License-Identifier: MIT
pragma solidity 0.8.25;

import {Script, console2} from "forge-std/Script.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IVerifiableFactory} from "@ensdomains/verifiable-factory/IVerifiableFactory.sol";
import {IEnhancedAccessControl} from "@ensdomains/contracts-v2/access-control/interfaces/IEnhancedAccessControl.sol";
import {IPermissionedRegistry} from "@ensdomains/contracts-v2/registry/interfaces/IPermissionedRegistry.sol";

import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {Hooks} from "@uniswap/v4-core/src/libraries/Hooks.sol";
import {HookMiner} from "v4-periphery/src/utils/HookMiner.sol";

import {AuctionDeployer} from "../src/AuctionDeployer.sol";
import {FlagRegistry} from "../src/FlagRegistry.sol";
import {PlainsightHook} from "../src/PlainsightHook.sol";
import {GreenshoeVault} from "../src/GreenshoeVault.sol";
import {Launcher} from "../src/Launcher.sol";
import {ManifestRegistry} from "../src/ManifestRegistry.sol";
import {VestingWalletFactory} from "../src/VestingWalletFactory.sol";
import {MockToken} from "../src/mocks/MockToken.sol";
import {TestUSDC} from "../src/mocks/TestUSDC.sol";
import {PlainsightEnsRoles} from "../src/ens/PlainsightEnsRoles.sol";
import {IContinuousClearingAuctionFactory} from "../src/interfaces/ICCA.sol";
import {EnsConfig} from "./EnsConfig.sol";
import {UniswapConfig} from "./UniswapConfig.sol";

contract Deploy is Script {
    uint256 internal constant DEMO_SUPPLY = 10_000_000 ether;

    struct Deployed {
        address usdc;
        address vault;
        address hook;
        address flags;
        address auctions;
        address registry;
        address vestingFactory;
        address launcher;
        address abc;
        address xyz;
        address plainsightRegistry;
        address resolver;
    }

    function run() external returns (Deployed memory d) {
        uint256 pk = vm.envUint("DEPLOYER_PK");
        address deployer = vm.addr(pk);
        address issuer = vm.addr(vm.envUint("ISSUER_PK"));
        require(issuer != deployer, "ISSUER_PK must differ from DEPLOYER_PK");

        IVerifiableFactory factory = IVerifiableFactory(EnsConfig.VERIFIABLE_FACTORY);
        uint256 version = vm.envOr("ENS_SETUP_VERSION", uint256(0));
        d.plainsightRegistry = factory.predictProxyAddress(deployer, EnsConfig.plainsightRegistrySalt(version));
        d.resolver = factory.predictProxyAddress(deployer, EnsConfig.resolverSalt(deployer, version));
        require(
            address(IPermissionedRegistry(EnsConfig.ETH_REGISTRY).getSubregistry(EnsConfig.PARENT_LABEL))
                == d.plainsightRegistry,
            "run SetupEns.s.sol first (plainsight.eth must point to PlainsightRegistry)"
        );
        require(UniswapConfig.CCA_FACTORY.code.length > 0, "CCA factory missing on this chain");
        require(UniswapConfig.PERMIT2.code.length > 0, "Permit2 missing on this chain");
        require(UniswapConfig.POOL_MANAGER.code.length > 0, "v4 PoolManager missing on this chain");
        address previous = _previousLauncher();

        vm.startBroadcast(pk);
        if (previous != address(0)) _retire(previous, d.plainsightRegistry, d.resolver);

        _deployCore(d, factory);

        d.abc = address(new MockToken("ABC Network", "ABC", issuer, DEMO_SUPPLY));
        d.xyz = address(new MockToken("XYZ Labs", "XYZ", issuer, DEMO_SUPPLY));
        vm.stopBroadcast();

        _write(d);
    }

    function _deployCore(Deployed memory d, IVerifiableFactory factory) internal {
        TestUSDC usdc = new TestUSDC();
        ManifestRegistry registry = new ManifestRegistry();
        (GreenshoeVault vault, PlainsightHook hook) = _deployVaultAndHook(usdc, registry);
        d.hook = address(hook);
        d.flags = _deployFlags(hook);
        AuctionDeployer auctions =
            new AuctionDeployer(IContinuousClearingAuctionFactory(UniswapConfig.CCA_FACTORY), address(usdc), address(vault));
        VestingWalletFactory vestingFactory = new VestingWalletFactory();
        Launcher launcher = new Launcher(
            registry,
            vestingFactory,
            auctions,
            factory,
            EnsConfig.USER_REGISTRY_IMPL,
            IPermissionedRegistry(EnsConfig.ETH_REGISTRY),
            IPermissionedRegistry(d.plainsightRegistry),
            d.resolver
        );
        registry.setLauncher(address(launcher));
        auctions.setLauncher(address(launcher));
        vault.setLauncher(address(launcher));

        IPermissionedRegistry(d.plainsightRegistry).grantRootRoles(
            PlainsightEnsRoles.LAUNCHER_REGISTRY_ROLES, address(launcher)
        );
        IEnhancedAccessControl(d.resolver).grantRootRoles(PlainsightEnsRoles.LAUNCHER_RESOLVER_ROLES, address(launcher));

        d.usdc = address(usdc);
        d.vault = address(vault);
        d.auctions = address(auctions);
        d.registry = address(registry);
        d.vestingFactory = address(vestingFactory);
        d.launcher = address(launcher);
    }

    function _deployVaultAndHook(TestUSDC usdc, ManifestRegistry registry)
        internal
        returns (GreenshoeVault vault, PlainsightHook hook)
    {
        vault = new GreenshoeVault(IERC20(address(usdc)), IPoolManager(UniswapConfig.POOL_MANAGER));
        address me = vm.addr(vm.envUint("DEPLOYER_PK"));
        bytes memory args = abi.encode(UniswapConfig.POOL_MANAGER, address(vault), registry, me, me);
        (address hookAddr, bytes32 salt) =
            HookMiner.find(UniswapConfig.CREATE2_DEPLOYER, _hookFlags(), type(PlainsightHook).creationCode, args);
        hook = new PlainsightHook{salt: salt}(IPoolManager(UniswapConfig.POOL_MANAGER), address(vault), registry, me, me);
        require(address(hook) == hookAddr, "hook address mismatch");
        vault.setHook(hook);
    }

    function _deployFlags(PlainsightHook hook) internal returns (address) {
        FlagRegistry flags = new FlagRegistry(
            UniswapConfig.CRE_SIM_FORWARDER, UniswapConfig.CRE_FORWARDER, vm.addr(vm.envUint("DEPLOYER_PK"))
        );
        hook.setFlagRegistry(flags);
        return address(flags);
    }

    function _hookFlags() internal pure returns (uint160) {
        return Hooks.BEFORE_INITIALIZE_FLAG | Hooks.BEFORE_ADD_LIQUIDITY_FLAG | Hooks.AFTER_ADD_LIQUIDITY_FLAG
            | Hooks.BEFORE_REMOVE_LIQUIDITY_FLAG | Hooks.AFTER_REMOVE_LIQUIDITY_FLAG | Hooks.BEFORE_SWAP_FLAG
            | Hooks.AFTER_SWAP_FLAG | Hooks.AFTER_SWAP_RETURNS_DELTA_FLAG;
    }

    function _previousLauncher() internal view returns (address) {
        try vm.readFile("./addresses.json") returns (string memory json) {
            if (vm.parseJsonUint(json, ".chainId") != block.chainid) return address(0);
            address l = vm.parseJsonAddress(json, ".launcher");
            return l.code.length > 0 ? l : address(0);
        } catch {
            return address(0);
        }
    }

    function _retire(address previous, address plainsightRegistry, address resolver) internal {
        IPermissionedRegistry reg = IPermissionedRegistry(plainsightRegistry);
        if (reg.hasRootRoles(PlainsightEnsRoles.LAUNCHER_REGISTRY_ROLES, previous)) {
            reg.revokeRootRoles(PlainsightEnsRoles.LAUNCHER_REGISTRY_ROLES, previous);
        }
        if (IEnhancedAccessControl(resolver).hasRootRoles(PlainsightEnsRoles.LAUNCHER_RESOLVER_ROLES, previous)) {
            IEnhancedAccessControl(resolver).revokeRootRoles(PlainsightEnsRoles.LAUNCHER_RESOLVER_ROLES, previous);
        }
        string[] memory defaults = new string[](2);
        (defaults[0], defaults[1]) = ("abc", "xyz");
        string[] memory labels = vm.envOr("RELEASE_LABELS", ",", defaults);
        for (uint256 i; i < labels.length; ++i) {
            if (reg.findOwner(labels[i]) != previous) continue;
            reg.unregister(uint256(keccak256(bytes(labels[i]))));
            console2.log("Released", string.concat(labels[i], ".", EnsConfig.PARENT_NAME));
        }
        console2.log("Retired previous Launcher", previous);
    }

    function _write(Deployed memory d) internal {
        string memory ens = "ens";
        vm.serializeString(ens, "parentName", EnsConfig.PARENT_NAME);
        vm.serializeAddress(ens, "ethRegistry", EnsConfig.ETH_REGISTRY);
        vm.serializeAddress(ens, "plainsightRegistry", d.plainsightRegistry);
        vm.serializeAddress(ens, "resolver", d.resolver);
        vm.serializeAddress(ens, "verifiableFactory", EnsConfig.VERIFIABLE_FACTORY);
        string memory ensJson = vm.serializeAddress(ens, "universalResolver", EnsConfig.UNIVERSAL_RESOLVER);

        string memory cca = "cca";
        vm.serializeAddress(cca, "factory", UniswapConfig.CCA_FACTORY);
        vm.serializeAddress(cca, "lens", UniswapConfig.CCA_LENS);
        string memory ccaJson = vm.serializeAddress(cca, "permit2", UniswapConfig.PERMIT2);

        string memory v4 = "v4";
        vm.serializeAddress(v4, "poolManager", UniswapConfig.POOL_MANAGER);
        vm.serializeAddress(v4, "stateView", UniswapConfig.STATE_VIEW);
        vm.serializeAddress(v4, "swapRouter", UniswapConfig.SWAP_ROUTER);
        string memory v4Json = vm.serializeAddress(v4, "liquidityRouter", UniswapConfig.LIQUIDITY_ROUTER);

        string memory root = "root";
        vm.serializeUint(root, "chainId", block.chainid);
        vm.serializeUint(root, "deployBlock", block.number);
        vm.serializeAddress(root, "usdc", d.usdc);
        vm.serializeAddress(root, "greenshoeVault", d.vault);
        vm.serializeAddress(root, "plainsightHook", d.hook);
        vm.serializeAddress(root, "flagRegistry", d.flags);
        vm.serializeString(root, "v4", v4Json);
        vm.serializeAddress(root, "auctionDeployer", d.auctions);
        vm.serializeAddress(root, "manifestRegistry", d.registry);
        vm.serializeAddress(root, "vestingWalletFactory", d.vestingFactory);
        vm.serializeAddress(root, "launcher", d.launcher);
        vm.serializeAddress(root, "abcToken", d.abc);
        vm.serializeAddress(root, "xyzToken", d.xyz);
        vm.serializeString(root, "cca", ccaJson);
        string memory json = vm.serializeString(root, "ens", ensJson);

        vm.writeJson(json, "./addresses.json");
        vm.writeJson(json, "../web/lib/addresses.json");
        console2.log("Launcher", d.launcher);
        console2.log("ManifestRegistry", d.registry);
        console2.log("AuctionDeployer", d.auctions);
        console2.log("GreenshoeVault", d.vault);
        console2.log("PlainsightHook", d.hook);
        console2.log("FlagRegistry", d.flags);
        console2.log("TestUSDC", d.usdc);
        console2.log("ABC", d.abc);
        console2.log("XYZ", d.xyz);
        console2.log("Wrote contracts/addresses.json and web/lib/addresses.json");
    }
}
