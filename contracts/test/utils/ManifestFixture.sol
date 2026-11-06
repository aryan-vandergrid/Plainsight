// SPDX-License-Identifier: MIT
pragma solidity 0.8.25;

import {Allocation, Manifest, MarketMakerDeal} from "../../src/interfaces/IManifest.sol";

abstract contract ManifestFixture {
    address internal issuer = address(0x15502);
    address internal teamWallet = address(0x7EA4);
    address internal investorWallet = address(0x1417);
    address internal mmWallet = address(0x3303);
    address internal agentWallet = address(0xA6E7);

    function _abcManifest(address token, string memory label) internal view returns (Manifest memory m) {
        m.token = token;
        m.ensLabel = label;
        m.issuer = issuer;
        m.allocations = new Allocation[](2);
        m.allocations[0] = Allocation({
            label: "team",
            insider: true,
            wallet: teamWallet,
            amount: 200_000 ether,
            vesting: address(0),
            unlockDate: uint64(block.timestamp + 365 days),
            vestingDuration: 0
        });
        m.allocations[1] = Allocation({
            label: "investors",
            insider: true,
            wallet: investorWallet,
            amount: 100_000 ether,
            vesting: address(0),
            unlockDate: uint64(block.timestamp + 180 days),
            vestingDuration: 0
        });
        m.mm = MarketMakerDeal({wallet: mmWallet, loanAmount: 50_000 ether, strikeUsdc: 1_200_000, kpis: "2% depth, 99% uptime"});
        m.agent = agentWallet;
        m.greenshoeBps = 1500;
        m.windowSecs = 30 days;
        m.rangeDepthBps = 1000;
        m.agentOperator = "Vandergrid";
        m.insiderFeeBps = 300;
        m.minRaise = 800_000e6;
        m.manifestHash = keccak256("abc-manifest-v1");
        m.jsonURI = "ipfs://abc-manifest-v1";
    }
}
