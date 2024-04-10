// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.20;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract ThirdPartyProtocolMock {
    IERC20 public token;

    mapping(address => uint256) public depositedAmounts;

    constructor(IERC20 token_) {
        token = token_;
    }

    function deposit(uint256 amount) external {
        require(amount > 0, "THPP: zero amount");
        token.transferFrom(msg.sender, address(this), amount);
        depositedAmounts[msg.sender] += amount;
    }

    function withdraw(uint256 amount) external {
        uint256 userBalance = depositedAmounts[msg.sender];

        require(userBalance >= amount, "THPP: zero balance");

        depositedAmounts[msg.sender] = userBalance - amount;
        token.transfer(msg.sender, amount);
    }

    function claim() external {
        uint256 userBalance = depositedAmounts[msg.sender];

        if (userBalance > 0) {
            token.transfer(msg.sender, userBalance + 10 ** 18);
        }
    }
}
