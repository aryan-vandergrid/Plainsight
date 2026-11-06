// SPDX-License-Identifier: MIT
pragma solidity 0.8.25;

import {NameCoder} from "@ens/contracts/utils/NameCoder.sol";

library EnsConfig {
    address internal constant ETH_REGISTRY = 0xD4eBcbBdF463C9c45784603Db0dDD499BC44A8B4;
    address internal constant ETH_REGISTRAR = 0xf633e7FC17e2bbE0D0965D18ec1821dcB754a3d3;
    address internal constant VERIFIABLE_FACTORY = 0xDa70306C98E97eCe36F997a21368e53298572991;
    address internal constant USER_REGISTRY_IMPL = 0x9BD8a88719068D09ecee662f36C0E3856708366a;
    address internal constant PERMISSIONED_RESOLVER_IMPL = 0x115eb53F0c60696633855F90b138178Fb40b2b2C;
    address internal constant UNIVERSAL_RESOLVER = 0xeEeEEEeE14D718C2B47D9923Deab1335E144EeEe;
    address internal constant MOCK_USDC = 0x240b0316Df57887DBBE58b586508b19e633a14aa;

    string internal constant PARENT_LABEL = "plainsight";
    string internal constant PARENT_NAME = "plainsight.eth";
    uint64 internal constant REGISTER_DURATION = 365 days;

    function plainsightRegistrySalt(uint256 version) internal pure returns (uint256) {
        bytes32 node = NameCoder.namehash(NameCoder.encode(PARENT_NAME), 0);
        return uint256(keccak256(abi.encode(keccak256("UserRegistry"), node, version)));
    }

    function resolverSalt(address owner, uint256 version) internal pure returns (uint256) {
        return uint256(keccak256(abi.encode(keccak256("OwnedResolver"), owner, version)));
    }
}
