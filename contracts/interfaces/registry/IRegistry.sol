// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.24;

import {IProxyFactory} from "./IProxyFactory.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IStrategy} from "../strategies/IStrategy.sol";

interface IRegistry is IProxyFactory {
    function deployVault(
        IERC20 asset_,
        string calldata name_,
        string calldata symbol_,
        uint256 protocolFee_,
        uint256 executorFee_
    ) external returns (address proxy);
    function registerStrategy(IStrategy strategy) external;
    function injectStrategy(address token, uint256 vaultIndex, uint256 strategyIndex) external;

    function vaults(address, uint256) external view returns (address);
    function strategies(address, uint256) external view returns (IStrategy);
    function treasury() external view returns (address);
}
