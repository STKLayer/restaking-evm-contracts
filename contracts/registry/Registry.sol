// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {ProxyFactory} from "./ProxyFactory.sol";
import {IRegistry} from "../interfaces/registry/IRegistry.sol";
import {IStrategy} from "../interfaces/strategies/IStrategy.sol";
import {IVault} from "../interfaces/vault/IVault.sol";

contract Registry is ProxyFactory, Ownable, IRegistry {
    mapping(address => address[]) public override vaults; // token address => Vault
    mapping(address => IStrategy[]) public override strategies; // required token => Strategy
    address public override treasury;

    constructor(
        address beacon,
        address owner,
        address treasury_
    ) ProxyFactory(beacon) Ownable(owner) {
        treasury = treasury_;
    }

    function deployVault(
        IERC20 asset_,
        string calldata name_,
        string calldata symbol_,
        uint256 protocolFee_,
        uint256 executorFee_
    ) external onlyOwner returns (address proxy) {
        proxy = _deployProxy(asset_, name_, symbol_, protocolFee_, executorFee_);
        vaults[address(asset_)].push(proxy);
    }

    function registerStrategy(IStrategy strategy) external onlyOwner {
        address[] memory tokens = strategy.want();
        for (uint256 i; i < tokens.length; i++) {
            strategies[tokens[i]].push(strategy);
        }
    }

    function injectStrategy(
        address token,
        uint256 vaultIndex,
        uint256 strategyIndex
    ) external onlyOwner {
        IVault vault = IVault(vaults[token][vaultIndex]);
        IStrategy strategy = strategies[token][strategyIndex];
        vault.addStrategy(address(strategy));
        strategy.addVault(vault);
    }
}
