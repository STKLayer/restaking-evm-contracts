// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/proxy/beacon/UpgradeableBeacon.sol";

contract Beacon is UpgradeableBeacon {
    constructor(
        address implementation_,
        address initialOwner
    ) UpgradeableBeacon(implementation_, initialOwner) {}
}
