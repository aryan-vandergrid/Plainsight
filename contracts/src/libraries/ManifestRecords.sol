// SPDX-License-Identifier: MIT
pragma solidity 0.8.25;

import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";

import {ManifestText} from "./ManifestText.sol";
import {EnsRecord} from "../interfaces/ILauncher.sol";
import {Allocation, Manifest} from "../interfaces/IManifest.sol";

library ManifestRecords {
    string internal constant PARENT_SUFFIX = ".plainsight.eth";

    function build(Manifest memory m) external view returns (EnsRecord[] memory recs) {
        uint256 n = 1 + m.allocations.length + (m.mm.wallet != address(0) ? 1 : 0) + (m.agent != address(0) ? 1 : 0);
        recs = new EnsRecord[](n);
        recs[0] = _root(m);
        uint256 j = 1;
        for (uint256 i; i < m.allocations.length; ++i) {
            recs[j++] = _allocation(m.allocations[i], m.token, m.ensLabel);
        }
        if (m.mm.wallet != address(0)) recs[j++] = _mm(m);
        if (m.agent != address(0)) recs[j++] = _agent(m);
    }

    function _root(Manifest memory m) private pure returns (EnsRecord memory r) {
        r.name = string.concat(m.ensLabel, PARENT_SUFFIX);
        r.keys = new string[](4);
        r.values = new string[](4);
        (r.keys[0], r.values[0]) = ("manifest", ManifestText.hash(m.manifestHash));
        (r.keys[1], r.values[1]) = ("greenshoe", ManifestText.bps(m.greenshoeBps));
        (r.keys[2], r.values[2]) = ("rangeDepth", ManifestText.bps(m.rangeDepthBps));
        (r.keys[3], r.values[3]) = ("treasury", Strings.toChecksumHexString(m.treasury));
    }

    function _mm(Manifest memory m) private view returns (EnsRecord memory) {
        string[3] memory values;
        values[0] = ManifestText.tokenAmount(m.token, m.mm.loanAmount);
        values[1] = ManifestText.usdc(m.mm.strikeUsdc);
        values[2] = m.mm.kpis;
        return _record("mm", m.ensLabel, m.mm.wallet, ["loan", "strike", "kpis"], values);
    }

    function _agent(Manifest memory m) private pure returns (EnsRecord memory) {
        string[3] memory values;
        values[0] = ManifestText.bps(m.greenshoeBps);
        values[1] = ManifestText.bps(m.rangeDepthBps);
        values[2] = m.agentOperator;
        return _record("agent", m.ensLabel, m.agent, ["greenshoe", "rangeDepth", "operator"], values);
    }

    function _allocation(Allocation memory a, address token, string memory label) private view returns (EnsRecord memory) {
        string[3] memory values;
        values[0] = ManifestText.tokenAmount(token, a.amount);
        values[1] = ManifestText.vesting(a.vesting, a.unlockDate, a.vestingDuration);
        values[2] = a.insider ? "yes" : "no";
        return _record(a.label, label, a.wallet, ["amount", "vesting", "insider"], values);
    }

    function _record(string memory sub, string memory label, address wallet, string[3] memory keys, string[3] memory values)
        private
        pure
        returns (EnsRecord memory r)
    {
        r.name = string.concat(sub, ".", label, PARENT_SUFFIX);
        r.label = sub;
        r.wallet = wallet;
        r.keys = new string[](3);
        r.values = new string[](3);
        for (uint256 i; i < 3; ++i) {
            (r.keys[i], r.values[i]) = (keys[i], values[i]);
        }
    }
}
