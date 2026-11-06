// SPDX-License-Identifier: MIT
pragma solidity 0.8.25;

import {NameCoder} from "@ens/contracts/utils/NameCoder.sol";
import {IAddrResolver} from "@ens/contracts/resolvers/profiles/IAddrResolver.sol";
import {ITextResolver} from "@ens/contracts/resolvers/profiles/ITextResolver.sol";
import {IExtendedResolver} from "@ens/contracts/resolvers/profiles/IExtendedResolver.sol";
import {IVerifiableFactory} from "@ensdomains/verifiable-factory/IVerifiableFactory.sol";
import {Grant, IEACGrantInitializable} from "@ensdomains/contracts-v2/access-control/interfaces/IEACGrantInitializable.sol";
import {IEnhancedAccessControl} from "@ensdomains/contracts-v2/access-control/interfaces/IEnhancedAccessControl.sol";
import {IPermissionedRegistry} from "@ensdomains/contracts-v2/registry/interfaces/IPermissionedRegistry.sol";
import {IRegistry} from "@ensdomains/contracts-v2/registry/interfaces/IRegistry.sol";
import {RegistryRolesLib} from "@ensdomains/contracts-v2/registry/libraries/RegistryRolesLib.sol";
import {IAddressSetter} from "@ensdomains/contracts-v2/resolver/interfaces/setters/IAddressSetter.sol";
import {ITextSetter} from "@ensdomains/contracts-v2/resolver/interfaces/setters/ITextSetter.sol";

abstract contract PlainsightEnsWriter {
    uint256 internal constant COIN_TYPE_ETH = 60;
    string internal constant PARENT_LABEL = "plainsight";
    string internal constant PARENT_SUFFIX = ".plainsight.eth";

    uint256 internal constant TOKEN_REGISTRY_ROLES =
        RegistryRolesLib.ROLE_REGISTRAR | RegistryRolesLib.ROLE_RENEW | RegistryRolesLib.ROLE_SET_PARENT;

    IVerifiableFactory public immutable ENS_FACTORY;
    address public immutable USER_REGISTRY_IMPL;
    IPermissionedRegistry public immutable ETH_REGISTRY;
    IPermissionedRegistry public immutable PLAINSIGHT_REGISTRY;
    address public immutable RESOLVER;

    mapping(bytes32 id => IPermissionedRegistry) public tokenRegistryOf;

    constructor(
        IVerifiableFactory factory,
        address userRegistryImpl,
        IPermissionedRegistry ethRegistry,
        IPermissionedRegistry plainsightRegistry,
        address resolver
    ) {
        ENS_FACTORY = factory;
        USER_REGISTRY_IMPL = userRegistryImpl;
        ETH_REGISTRY = ethRegistry;
        PLAINSIGHT_REGISTRY = plainsightRegistry;
        RESOLVER = resolver;
    }

    function _createNames(bytes32 id, string memory label, string[] memory subLabels)
        internal
        returns (IPermissionedRegistry tokenRegistry)
    {
        Grant[] memory grants = new Grant[](1);
        grants[0] = Grant({account: address(this), roleBitmap: TOKEN_REGISTRY_ROLES});
        uint256 salt = uint256(keccak256(abi.encode(keccak256("UserRegistry"), _node(_fullName(label)), uint256(0))));
        tokenRegistry = IPermissionedRegistry(
            ENS_FACTORY.deployProxy(
                USER_REGISTRY_IMPL, salt, abi.encodeCall(IEACGrantInitializable.initialize, (grants))
            )
        );
        tokenRegistryOf[id] = tokenRegistry;

        PLAINSIGHT_REGISTRY.register(label, address(this), IRegistry(address(tokenRegistry)), RESOLVER, 0, type(uint64).max);
        tokenRegistry.setParent(IRegistry(address(PLAINSIGHT_REGISTRY)), label);

        for (uint256 i; i < subLabels.length; ++i) {
            tokenRegistry.register(subLabels[i], address(this), IRegistry(address(0)), RESOLVER, 0, type(uint64).max);
        }
    }

    function _setAddr(string memory name, address wallet) internal {
        IAddressSetter(RESOLVER).setAddress(NameCoder.encode(name), COIN_TYPE_ETH, abi.encodePacked(wallet));
    }

    function _setText(string memory name, string memory key, string memory value) internal {
        ITextSetter(RESOLVER).setText(NameCoder.encode(name), key, value);
    }

    function _readAddr(string memory name) internal view returns (address) {
        bytes memory dns = NameCoder.encode(name);
        try IExtendedResolver(RESOLVER).resolve(dns, abi.encodeCall(IAddrResolver.addr, (NameCoder.namehash(dns, 0))))
        returns (bytes memory r) {
            return abi.decode(r, (address));
        } catch {
            return address(0);
        }
    }

    function _readText(string memory name, string memory key) internal view returns (string memory) {
        bytes memory dns = NameCoder.encode(name);
        try IExtendedResolver(RESOLVER).resolve(dns, abi.encodeCall(ITextResolver.text, (NameCoder.namehash(dns, 0), key)))
        returns (bytes memory r) {
            return abi.decode(r, (string));
        } catch {
            return "";
        }
    }

    function _treeIntact(bytes32 id, string memory label, string[] memory subLabels) internal view returns (bool) {
        IPermissionedRegistry tokenRegistry = tokenRegistryOf[id];
        if (address(tokenRegistry) == address(0)) return false;
        if (address(ETH_REGISTRY) != address(0)) {
            if (address(ETH_REGISTRY.getSubregistry(PARENT_LABEL)) != address(PLAINSIGHT_REGISTRY)) return false;
        }
        if (address(PLAINSIGHT_REGISTRY.getSubregistry(label)) != address(tokenRegistry)) return false;
        if (PLAINSIGHT_REGISTRY.getResolver(label) != RESOLVER) return false;
        if (!_ownedByUs(PLAINSIGHT_REGISTRY, label)) return false;
        for (uint256 i; i < subLabels.length; ++i) {
            if (tokenRegistry.getResolver(subLabels[i]) != RESOLVER) return false;
            if (!_ownedByUs(tokenRegistry, subLabels[i])) return false;
        }
        return true;
    }

    function _holdsNoRoles(bytes32 id, address account, string memory label, string[] memory subLabels, string[] memory keys)
        internal
        view
        returns (bool)
    {
        IPermissionedRegistry tokenRegistry = tokenRegistryOf[id];
        if (address(ETH_REGISTRY) != address(0)) {
            if (_hasAnyRole(ETH_REGISTRY, PARENT_LABEL, account)) return false;
        }
        if (PLAINSIGHT_REGISTRY.roles(0, account) != 0) return false;
        if (_hasAnyRole(PLAINSIGHT_REGISTRY, label, account)) return false;
        if (tokenRegistry.roles(0, account) != 0) return false;
        for (uint256 i; i < subLabels.length; ++i) {
            if (_hasAnyRole(tokenRegistry, subLabels[i], account)) return false;
        }
        IEnhancedAccessControl r = IEnhancedAccessControl(RESOLVER);
        if (r.roles(0, account) != 0) return false;
        if (r.roles(uint256(keccak256(abi.encode(COIN_TYPE_ETH))), account) != 0) return false;
        for (uint256 i; i < keys.length; ++i) {
            if (r.roles(uint256(keccak256(bytes(keys[i]))), account) != 0) return false;
        }
        return true;
    }

    function _hasAnyRole(IPermissionedRegistry reg, string memory label, address account) private view returns (bool) {
        uint256 labelId = uint256(keccak256(bytes(label)));
        IPermissionedRegistry.State memory s = reg.getState(labelId);
        return reg.roles(labelId, account) != 0 || s.latestOwner == account;
    }

    function _ownedByUs(IPermissionedRegistry reg, string memory label) private view returns (bool) {
        IPermissionedRegistry.State memory s = reg.getState(uint256(keccak256(bytes(label))));
        return s.status == IPermissionedRegistry.Status.REGISTERED && s.latestOwner == address(this);
    }

    function _fullName(string memory label) internal pure returns (string memory) {
        return string.concat(label, PARENT_SUFFIX);
    }

    function _subName(string memory sub, string memory label) internal pure returns (string memory) {
        return string.concat(sub, ".", label, PARENT_SUFFIX);
    }

    function _node(string memory name) internal pure returns (bytes32) {
        return NameCoder.namehash(NameCoder.encode(name), 0);
    }
}
