// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.20;

import {IVault} from "../../interfaces/vault/IVault.sol";
import {IERC20} from "@openzeppelin/contracts/interfaces/IERC20.sol";
import {AbstractStrategy} from "../../strategies/AbstractStrategy.sol";
import {ThirdPartyProtocolMock} from "../ThirdPartyProtocolMock.sol";

contract StrategyMock is AbstractStrategy {
    ThirdPartyProtocolMock public externalProtocol;

    constructor(
        address externalProtocol_,
        address[] memory want_,
        address owner_,
        address registry_
    ) AbstractStrategy(want_, owner_, registry_) {
        externalProtocol = ThirdPartyProtocolMock(externalProtocol_);
        _approveForAll();
    }

    function balanceOfPool(IERC20 token) public view override returns (uint256) {
        return externalProtocol.depositedAmounts(address(this));
    }

    function _protocolDeposit(uint256 amount_, IERC20 token_) internal override {
        externalProtocol.deposit(amount_);
    }
    function _protocolWithdraw(uint256 amount_, IERC20 token_) internal override {
        externalProtocol.withdraw(amount_);
    }
    function _protocolWithdrawAll() internal override {
        externalProtocol.withdraw(balanceOfPool(IERC20(address(0))));
    }
    function _protocolClaim() internal override {
        externalProtocol.claim();
    }
    function _approveForAll() internal override {
        for (uint256 i; i < _want.length; i++) {
            IERC20(_want[i]).approve(address(externalProtocol), type(uint256).max);
        }
    }
    function _rejectApprove() internal override {
        for (uint256 i; i < _want.length; i++) {
            IERC20(_want[i]).approve(address(externalProtocol), 0);
        }
    }
}
