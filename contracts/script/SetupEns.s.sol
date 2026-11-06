// SPDX-License-Identifier: MIT
pragma solidity 0.8.25;

import {Script, console2} from "forge-std/Script.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IVerifiableFactory} from "@ensdomains/verifiable-factory/IVerifiableFactory.sol";
import {Grant, IEACGrantInitializable} from "@ensdomains/contracts-v2/access-control/interfaces/IEACGrantInitializable.sol";
import {IEnhancedAccessControl} from "@ensdomains/contracts-v2/access-control/interfaces/IEnhancedAccessControl.sol";
import {IETHRegistrar} from "@ensdomains/contracts-v2/registrar/interfaces/IETHRegistrar.sol";
import {IPermissionedRegistry} from "@ensdomains/contracts-v2/registry/interfaces/IPermissionedRegistry.sol";
import {IRegistry} from "@ensdomains/contracts-v2/registry/interfaces/IRegistry.sol";
import {IPermissionedResolverInitializable} from
    "@ensdomains/contracts-v2/resolver/interfaces/IPermissionedResolverInitializable.sol";

import {PlainsightEnsRoles} from "../src/ens/PlainsightEnsRoles.sol";
import {EnsConfig} from "./EnsConfig.sol";

interface IMintable {
    function mint(address to, uint256 amount) external;
}

contract SetupEns is Script {
    IVerifiableFactory internal constant FACTORY = IVerifiableFactory(EnsConfig.VERIFIABLE_FACTORY);
    IETHRegistrar internal constant REGISTRAR = IETHRegistrar(EnsConfig.ETH_REGISTRAR);

    function preflight() external view {
        address deployer = vm.addr(vm.envUint("DEPLOYER_PK"));
        address issuer = vm.addr(vm.envUint("ISSUER_PK"));
        console2.log("deployer", deployer, "ETH (wei)", deployer.balance);
        console2.log("issuer  ", issuer, "ETH (wei)", issuer.balance);
        console2.log("deployer is plain EOA", deployer.code.length == 0);
        console2.log("deployer != issuer", deployer != issuer);
        bool available = REGISTRAR.isAvailable(EnsConfig.PARENT_LABEL);
        address owner = IPermissionedRegistry(EnsConfig.ETH_REGISTRY).findOwner(EnsConfig.PARENT_LABEL);
        console2.log("plainsight.eth available", available);
        if (available) {
            (uint256 base, uint256 premium) =
                REGISTRAR.getRegisterPrice(EnsConfig.PARENT_LABEL, EnsConfig.REGISTER_DURATION, IERC20(EnsConfig.MOCK_USDC));
            console2.log("plainsight.eth 1y price (MockUSDC units, minted by commit())", base + premium);
        } else {
            console2.log("plainsight.eth owner", owner);
            require(owner == deployer, "plainsight.eth is owned by someone else: pick another parent name");
        }
        console2.log("deployer MockUSDC balance", IERC20(EnsConfig.MOCK_USDC).balanceOf(deployer));
        require(deployer.balance >= 0.05 ether, "deployer needs >= 0.05 Sepolia ETH");
        require(issuer.balance >= 0.02 ether, "issuer needs >= 0.02 Sepolia ETH");
        require(deployer.code.length == 0 && deployer != issuer, "deployer must be a plain EOA distinct from issuer");
        console2.log("preflight OK");
    }

    function commit() external {
        uint256 pk = vm.envUint("DEPLOYER_PK");
        address deployer = vm.addr(pk);
        (address plainsightRegistry, address resolver) = ensAddresses(deployer);

        require(deployer.code.length == 0, "DEPLOYER_PK must be a plain EOA (no code / 7702 delegation)");
        require(REGISTRAR.isAvailable(EnsConfig.PARENT_LABEL), "plainsight.eth is not available");
        (uint256 base, uint256 premium) =
            REGISTRAR.getRegisterPrice(EnsConfig.PARENT_LABEL, EnsConfig.REGISTER_DURATION, IERC20(EnsConfig.MOCK_USDC));
        console2.log("deployer", deployer);
        console2.log("price (MockUSDC base units)", base + premium);

        vm.startBroadcast(pk);
        if (plainsightRegistry.code.length == 0) {
            Grant[] memory g = new Grant[](1);
            g[0] = Grant({account: deployer, roleBitmap: PlainsightEnsRoles.DEPLOYER_REGISTRY_ROLES});
            FACTORY.deployProxy(
                EnsConfig.USER_REGISTRY_IMPL,
                EnsConfig.plainsightRegistrySalt(_version()),
                abi.encodeCall(IEACGrantInitializable.initialize, (g))
            );
        }
        if (resolver.code.length == 0) {
            Grant[] memory g = new Grant[](1);
            g[0] = Grant({account: deployer, roleBitmap: PlainsightEnsRoles.DEPLOYER_RESOLVER_ROLES});
            FACTORY.deployProxy(
                EnsConfig.PERMISSIONED_RESOLVER_IMPL,
                EnsConfig.resolverSalt(deployer, _version()),
                abi.encodeCall(IPermissionedResolverInitializable.initialize, (g, new bytes[](0)))
            );
        }
        IMintable(EnsConfig.MOCK_USDC).mint(deployer, base + premium);
        IERC20(EnsConfig.MOCK_USDC).approve(address(REGISTRAR), base + premium);
        REGISTRAR.commit(_commitment(pk, deployer, plainsightRegistry, resolver));
        vm.stopBroadcast();

        console2.log("PlainsightRegistry", plainsightRegistry);
        console2.log("PermissionedResolver", resolver);
        console2.log("Committed. Wait 60s, then run SetupEns without --sig to register plainsight.eth.");
    }

    function run() external {
        uint256 pk = vm.envUint("DEPLOYER_PK");
        address deployer = vm.addr(pk);
        (address plainsightRegistry, address resolver) = ensAddresses(deployer);
        require(plainsightRegistry.code.length > 0 && resolver.code.length > 0, "run commit() first");

        vm.startBroadcast(pk);
        REGISTRAR.register(
            EnsConfig.PARENT_LABEL,
            deployer,
            _secret(pk),
            IRegistry(plainsightRegistry),
            resolver,
            EnsConfig.REGISTER_DURATION,
            IERC20(EnsConfig.MOCK_USDC),
            bytes32(0)
        );
        IPermissionedRegistry(plainsightRegistry).setParent(IRegistry(EnsConfig.ETH_REGISTRY), EnsConfig.PARENT_LABEL);
        vm.stopBroadcast();

        IPermissionedRegistry eth = IPermissionedRegistry(EnsConfig.ETH_REGISTRY);
        require(eth.findOwner(EnsConfig.PARENT_LABEL) == deployer, "plainsight.eth owner");
        require(address(eth.getSubregistry(EnsConfig.PARENT_LABEL)) == plainsightRegistry, "subregistry");
        console2.log("plainsight.eth registered; subregistry", plainsightRegistry);
    }

    function renounceAdmin() external {
        uint256 pk = vm.envUint("DEPLOYER_PK");
        address deployer = vm.addr(pk);
        (address plainsightRegistry, address resolver) = ensAddresses(deployer);
        vm.startBroadcast(pk);
        IPermissionedRegistry(plainsightRegistry).revokeRootRoles(PlainsightEnsRoles.DEPLOYER_REGISTRY_ROLES, deployer);
        IEnhancedAccessControl(resolver).revokeRootRoles(PlainsightEnsRoles.DEPLOYER_RESOLVER_ROLES, deployer);
        vm.stopBroadcast();
        require(IEnhancedAccessControl(resolver).roles(0, deployer) == 0, "resolver roles left");
        require(IPermissionedRegistry(plainsightRegistry).roles(0, deployer) == 0, "registry roles left");
        console2.log("Deployer ENS admin roles renounced.");
    }

    function ensAddresses(address deployer) public view returns (address plainsightRegistry, address resolver) {
        plainsightRegistry = FACTORY.predictProxyAddress(deployer, EnsConfig.plainsightRegistrySalt(_version()));
        resolver = FACTORY.predictProxyAddress(deployer, EnsConfig.resolverSalt(deployer, _version()));
    }

    function _commitment(uint256 pk, address deployer, address plainsightRegistry, address resolver)
        internal
        view
        returns (bytes32)
    {
        return REGISTRAR.makeCommitment(
            EnsConfig.PARENT_LABEL,
            deployer,
            _secret(pk),
            IRegistry(plainsightRegistry),
            resolver,
            EnsConfig.REGISTER_DURATION,
            bytes32(0)
        );
    }

    function _secret(uint256 pk) internal pure returns (bytes32) {
        return keccak256(abi.encode(pk, "plainsight.eth commit-reveal"));
    }

    function _version() internal view returns (uint256) {
        return vm.envOr("ENS_SETUP_VERSION", uint256(0));
    }
}
