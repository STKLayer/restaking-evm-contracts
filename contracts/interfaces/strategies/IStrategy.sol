// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IVault} from "../vault/IVault.sol";

interface IStrategy {
    function addVault(IVault) external; // only registry

    function vaults() external view returns (IVault[] memory);
    function want() external view returns (address[] memory);
    function deposit(uint256, IERC20) external; // only vault
    function withdraw(uint256, IERC20) external; // only vault
    function balanceOf(IERC20 token) external view returns (uint256);
    function balancesOfWants() external view returns (uint256[] memory);
    function balanceOfPool(IERC20 token) external view returns (uint256);
    function harvest() external; // only vault
    function panic() external;
    function pause() external;
    function unpause() external;
    function paused() external view returns (bool);
    function withdrawAll(IERC20 token_) external;
}
