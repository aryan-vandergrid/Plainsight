// SPDX-License-Identifier: MIT
pragma solidity 0.8.25;

import {Test} from "forge-std/Test.sol";
import {VerifiableFactory} from "@ensdomains/verifiable-factory/VerifiableFactory.sol";
import {IVerifiableFactory} from "@ensdomains/verifiable-factory/IVerifiableFactory.sol";
import {Grant, IEACGrantInitializable} from "@ensdomains/contracts-v2/access-control/interfaces/IEACGrantInitializable.sol";
import {PermissionedRegistry} from "@ensdomains/contracts-v2/registry/PermissionedRegistry.sol";
import {UserRegistry} from "@ensdomains/contracts-v2/registry/UserRegistry.sol";
import {IPermissionedRegistry} from "@ensdomains/contracts-v2/registry/interfaces/IPermissionedRegistry.sol";
import {IRegistry} from "@ensdomains/contracts-v2/registry/interfaces/IRegistry.sol";
import {IRegistryURIRenderer} from "@ensdomains/contracts-v2/registry/interfaces/IRegistryURIRenderer.sol";
import {PermissionedResolver} from "@ensdomains/contracts-v2/resolver/PermissionedResolver.sol";
import {IPermissionedResolverInitializable} from
    "@ensdomains/contracts-v2/resolver/interfaces/IPermissionedResolverInitializable.sol";
import {LabelStore} from "@ensdomains/contracts-v2/utils/LabelStore.sol";
import {IContractNamer} from "@ensdomains/contracts-v2/reverse-registrar/interfaces/IContractNamer.sol";
import {EACBaseRolesLib} from "@ensdomains/contracts-v2/access-control/libraries/EACBaseRolesLib.sol";

import {PlainsightEnsRoles} from "../../src/ens/PlainsightEnsRoles.sol";

abstract contract LocalEns is Test {
    address internal ensDeployer = makeAddr("ensDeployer");

    IVerifiableFactory internal factory;
    address internal userRegistryImpl;
    IPermissionedRegistry internal ethRegistry;
    IPermissionedRegistry internal plainsightRegistry;
    address internal resolver;

    function _deployLocalEns() internal {
        address namer = makeAddr("namer");
        LabelStore labelStore = new LabelStore(IContractNamer(namer));
        factory = IVerifiableFactory(address(new VerifiableFactory()));
        userRegistryImpl = address(new UserRegistry(labelStore, IRegistryURIRenderer(address(0)), namer));
        address resolverImpl = address(new PermissionedResolver(namer));

        ethRegistry = IPermissionedRegistry(address(new PermissionedRegistry(labelStore, address(this), EACBaseRolesLib.ALL_ROLES)));

        vm.startPrank(ensDeployer);
        Grant[] memory g = new Grant[](1);
        g[0] = Grant({account: ensDeployer, roleBitmap: PlainsightEnsRoles.DEPLOYER_REGISTRY_ROLES});
        plainsightRegistry = IPermissionedRegistry(
            factory.deployProxy(userRegistryImpl, 1, abi.encodeCall(IEACGrantInitializable.initialize, (g)))
        );
        g[0] = Grant({account: ensDeployer, roleBitmap: PlainsightEnsRoles.DEPLOYER_RESOLVER_ROLES});
        resolver = factory.deployProxy(
            resolverImpl, 2, abi.encodeCall(IPermissionedResolverInitializable.initialize, (g, new bytes[](0)))
        );
        vm.stopPrank();

        ethRegistry.register("plainsight", ensDeployer, IRegistry(address(plainsightRegistry)), resolver, 0, type(uint64).max);
        vm.prank(ensDeployer);
        plainsightRegistry.setParent(IRegistry(address(ethRegistry)), "plainsight");
    }
}
