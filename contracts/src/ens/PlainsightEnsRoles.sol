// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {RegistryRolesLib} from "@ensdomains/contracts-v2/registry/libraries/RegistryRolesLib.sol";
import {PermissionedResolverLib} from "@ensdomains/contracts-v2/resolver/libraries/PermissionedResolverLib.sol";

library PlainsightEnsRoles {
    uint256 internal constant DEPLOYER_REGISTRY_ROLES = RegistryRolesLib.ROLE_REGISTRAR
        | RegistryRolesLib.ROLE_REGISTRAR_ADMIN | RegistryRolesLib.ROLE_RENEW | RegistryRolesLib.ROLE_RENEW_ADMIN
        | RegistryRolesLib.ROLE_UNREGISTER | RegistryRolesLib.ROLE_UNREGISTER_ADMIN | RegistryRolesLib.ROLE_SET_PARENT
        | RegistryRolesLib.ROLE_SET_PARENT_ADMIN;

    uint256 internal constant DEPLOYER_RESOLVER_ROLES = PermissionedResolverLib.ROLE_SET_ADDRESS
        | PermissionedResolverLib.ROLE_SET_ADDRESS_ADMIN | PermissionedResolverLib.ROLE_SET_TEXT
        | PermissionedResolverLib.ROLE_SET_TEXT_ADMIN;

    uint256 internal constant LAUNCHER_REGISTRY_ROLES = RegistryRolesLib.ROLE_REGISTRAR | RegistryRolesLib.ROLE_RENEW;
    uint256 internal constant LAUNCHER_RESOLVER_ROLES =
        PermissionedResolverLib.ROLE_SET_ADDRESS | PermissionedResolverLib.ROLE_SET_TEXT;
}
