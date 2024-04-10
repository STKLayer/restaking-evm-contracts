// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.20;

library Percent {
    uint256 public constant PERCENT_100 = 10 ** 27;

    function getPart(uint256 from_, uint256 percent) internal pure returns (uint256) {
        return (from_ * percent) / PERCENT_100;
    }

    function getFrom(uint256 part_, uint256 percent) internal pure returns (uint256) {
        return (part_ * PERCENT_100) / percent;
    }
}
