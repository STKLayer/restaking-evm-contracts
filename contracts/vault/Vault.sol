// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.20;

import {ERC4626Upgradeable} from "@openzeppelin/contracts-upgradeable/token/ERC20/extensions/ERC4626Upgradeable.sol";
import {OwnableUpgradeable} from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import {EnumerableSet} from "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import {IERC20} from "@openzeppelin/contracts/interfaces/IERC20.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";

import {IStrategy} from "../interfaces/strategies/IStrategy.sol";
import {IVault} from "../interfaces/vault/IVault.sol";
import {Percent} from "../libs/Percent.sol";

contract Vault is ERC4626Upgradeable, OwnableUpgradeable, IVault {
    using EnumerableSet for EnumerableSet.AddressSet;
    using Percent for uint256;

    address public override registry;
    uint256 public override protocolFee;
    uint256 public override executorFee;

    EnumerableSet.AddressSet internal strategies;
    mapping(address => uint256) public strategyPart;
    mapping(uint256 => address) public strategyPriority;
    mapping(address => uint256) public actualStrategyPart;

    modifier onlyRegistry() {
        require(msg.sender == registry, "Vault: caller not registry");
        _;
    }

    function __Vault_init(
        address owner_,
        IERC20 asset_,
        address registry_,
        string memory name_,
        string memory symbol_,
        uint256 protocolFee_,
        uint256 executorFee_
    ) external initializer {
        __Ownable_init(owner_);
        __ERC20_init(name_, symbol_);
        __ERC4626_init(asset_);
        __Vault_init_unchained(registry_, protocolFee_, executorFee_);
    }

    function __Vault_init_unchained(
        address registry_,
        uint256 protocolFee_,
        uint256 executorFee_
    ) internal onlyInitializing {
        registry = registry_;
        protocolFee = protocolFee_;
        executorFee = executorFee_;
    }

    function addStrategy(address strategy) external onlyRegistry {
        IERC20(asset()).approve(strategy, type(uint256).max);
        strategies.add(strategy);
    }

    function setStrategiesPercents(
        address[] calldata strategyAddresses,
        uint256[] calldata percentsFromDeposit,
        uint256[] calldata priorities,
        bool force
    ) external onlyOwner {
        require(
            strategyAddresses.length == percentsFromDeposit.length &&
                strategyAddresses.length == priorities.length,
            "Vault: array sizes not equal"
        );

        uint256 assets = totalAssets();

        for (uint256 i; i < strategyAddresses.length; i++) {
            address strategyAddress = strategyAddresses[i];

            if (strategies.contains(strategyAddress)) {
                uint256 percentFromDeposit = percentsFromDeposit[i];
                uint256 priority = priorities[i];

                strategyPart[strategyAddress] = percentFromDeposit;
                strategyPriority[priority] = strategyAddress;

                if (assets > 0) {
                    uint256 actualStrategyBalance = IStrategy(strategyAddress).balanceOf(
                        IERC20(asset())
                    );
                    uint256 actualPart = actualStrategyBalance.getFrom(assets);

                    actualStrategyPart[strategyAddress] = actualPart;

                    if (force) {
                        _strategyWithdrawForce();
                        _strategyDepositForce(assets);
                    }
                } else {
                    actualStrategyPart[strategyAddress] = 0;
                }
            }
        }
    }

    function earn() external {
        _earnPart(0, strategies.length());
    }

    function earnPart(uint256 offset_, uint256 limit_) external {
        _earnPart(offset_, limit_);
    }

    function getStrategies() external view returns (address[] memory) {
        return strategies.values();
    }

    function totalAssets() public view override returns (uint256 assetCount) {
        for (uint256 i; i < strategies.length(); i++) {
            assetCount += IStrategy(strategies.at(i)).balanceOf(IERC20(asset()));
        }
    }

    function _strategyDeposit(uint256 assets) internal {
        require(strategyPart[strategyPriority[0]] > 0, "Vault: priorities not set");
        for (uint256 i; i < strategies.length(); i++) {
            address strategy = strategyPriority[i];
            uint256 part = strategyPart[strategy];
            uint256 actualPart = actualStrategyPart[strategy];

            if (part > actualPart) {
                _depositIntoStrategy(strategy, assets);
                return;
            }
        }
        _depositIntoStrategy(strategyPriority[0], assets);
    }

    function _depositIntoStrategy(address strategy, uint256 assets) internal {
        IStrategy(strategy).deposit(assets, IERC20(asset()));
        uint256 actualStrategyBalance = IStrategy(strategy).balanceOf(IERC20(asset()));
        actualStrategyPart[strategy] = actualStrategyBalance.getFrom(totalAssets());
    }

    function _strategyDepositForce(uint256 assets) internal {
        for (uint256 i; i < strategies.length(); i++) {
            address strategy = strategyPriority[i];
            IStrategy(strategy).deposit(assets.getPart(strategyPart[strategy]), IERC20(asset()));
        }
    }

    function _strategyWithdraw(uint256 assets) internal {
        require(strategyPart[strategyPriority[0]] > 0, "Vault: priorities not set");
        for (uint256 i = strategies.length(); i > 0; i--) {
            address strategy = strategyPriority[i - 1];
            uint256 part = strategyPart[strategy];
            uint256 actualPart = actualStrategyPart[strategy];

            if (actualPart > part || i - 1 == 0) {
                _withdrawFromStrategy(strategy, assets);
                return;
            }
        }
    }

    function _withdrawFromStrategy(address strategy, uint256 assets) internal {
        IStrategy(strategy).withdraw(assets, IERC20(asset()));
        uint256 actualStrategyBalance = IStrategy(strategy).balanceOf(IERC20(asset()));
        actualStrategyPart[strategy] = actualStrategyBalance.getFrom(totalAssets() + assets);
    }

    function _strategyWithdrawForce() internal {
        for (uint256 i; i < strategies.length(); i++) {
            address strategy = strategyPriority[i];
            IStrategy(strategy).withdrawAll(IERC20(asset()));
        }
    }

    function _deposit(
        address caller,
        address receiver,
        uint256 assets,
        uint256 shares
    ) internal override {
        ERC4626Upgradeable._deposit(caller, receiver, assets, shares);
        _strategyDeposit(assets);
    }

    function _withdraw(
        address caller,
        address receiver,
        address owner,
        uint256 assets,
        uint256 shares
    ) internal override {
        _strategyWithdraw(assets);
        ERC4626Upgradeable._withdraw(caller, receiver, owner, assets, shares);
    }

    function _decimalsOffset() internal view override returns (uint8) {
        return
            uint8(
                Math.max(18, IERC20Metadata(asset()).decimals()) -
                    Math.min(18, IERC20Metadata(asset()).decimals())
            );
    }

    function _earnPart(uint256 offset_, uint256 limit_) internal {
        uint256 to_ = _getTo(strategies.length(), offset_, limit_);

        for (uint256 i = offset_; i < to_; i++) {
            address strategy = strategies.at(i);
            if (strategyPart[strategy] > 0) {
                IStrategy(strategy).harvest();
            }
        }
    }

    function _getTo(
        uint256 length_,
        uint256 offset_,
        uint256 limit_
    ) internal pure returns (uint256 to_) {
        to_ = offset_ + limit_;

        if (to_ > length_) {
            to_ = length_;
        }

        if (offset_ > to_) {
            to_ = offset_;
        }
    }
}
