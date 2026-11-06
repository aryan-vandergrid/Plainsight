// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

enum ManifestStatus {
    None,
    Registered,
    Locked
}

struct Allocation {
    string label;
    bool insider;
    address wallet;
    uint256 amount;
    address vesting;
    uint64 unlockDate;
    uint64 vestingDuration;
}

struct MarketMakerDeal {
    address wallet;
    uint256 loanAmount;
    uint256 strikeUsdc;
    string kpis;
}

struct Manifest {
    address token;
    string ensLabel;
    address issuer;
    Allocation[] allocations;
    MarketMakerDeal mm;
    address agent;
    string agentOperator;
    uint16 greenshoeBps;
    uint32 windowSecs;
    uint16 rangeDepthBps;
    address treasury;
    uint16 insiderFeeBps;
    uint256 minRaise;
    bytes32 manifestHash;
    string jsonURI;
}

struct Amendment {
    bytes32 manifestHash;
    string uri;
    uint64 timestamp;
}
