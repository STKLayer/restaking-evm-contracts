// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.24;
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {IStrategy} from "../strategies/IStrategy.sol";

interface IVault {
    struct StrategyPartData {
        IStrategy strategy;
        uint256 part;
    }

    function __Vault_init(
        address owner_,
        IERC20 asset_,
        address registry_,
        string memory name_,
        string memory symbol_,
        uint256 protocolFee_,
        uint256 executorFee_
    ) external;

    function addStrategy(address strategy) external; // only registry
    function setStrategiesPercents(
        address[] calldata strategyAddresses,
        uint256[] calldata percentsFromDeposit,
        uint256[] calldata priorities,
        bool force
    ) external; // onlyOwner

    function getStrategies() external view returns (address[] memory);
    function protocolFee() external view returns (uint256);
    function executorFee() external view returns (uint256);
    function registry() external view returns (address);
}
