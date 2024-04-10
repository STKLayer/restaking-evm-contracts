// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.20;

import {AbstractStrategy} from "../../strategies/AbstractStrategy.sol";

contract SimpleStrategyMock is AbstractStrategy {
    constructor(
        address[] memory want_,
        address owner_,
        address registry_
    ) AbstractStrategy(want_, owner_, registry_) {}
}
