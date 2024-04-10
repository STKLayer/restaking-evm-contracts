// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.24;

import {IStrategy} from "../interfaces/strategies/IStrategy.sol";
import {IVault} from "../interfaces/vault/IVault.sol";
import {IERC20} from "@openzeppelin/contracts/interfaces/IERC20.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {IERC4626} from "@openzeppelin/contracts/interfaces/IERC4626.sol";
import {Percent} from "../libs/Percent.sol";
import {IRegistry} from "../interfaces/registry/IRegistry.sol";

abstract contract AbstractStrategy is IStrategy, Pausable, AccessControl {
    using Percent for uint256;

    bytes32 public constant YIELD_SERVICE_ROLE = keccak256("YIELD_SERVICE_ROLE");

    address public registry;

    IVault[] public _vaults;
    address[] public _want;

    modifier onlyRegistry() {
        require(msg.sender == registry, "Vault: caller not registry");
        _;
    }

    modifier onlyWant(address want_) {
        _onlyWant(want_);
        _;
    }

    modifier onlyVault() {
        _onlyVault();
        _;
    }

    constructor(address[] memory want_, address owner_, address registry_) {
        _want = want_;
        registry = registry_;

        _grantRole(DEFAULT_ADMIN_ROLE, owner_);
    }

    function addVault(IVault vault) external onlyRegistry {
        _vaults.push(vault);
    }

    function want() external view returns (address[] memory) {
        return _want;
    }

    function vaults() external view returns (IVault[] memory) {
        return _vaults;
    }

    function deposit(
        uint256 amount_,
        IERC20 want_
    ) external whenNotPaused onlyVault onlyWant(address(want_)) {
        require(amount_ > 0, "Strategy: zero amount");
        want_.transferFrom(msg.sender, address(this), amount_);

        _protocolDeposit(amount_, want_);
    }

    function withdraw(
        uint256 amount_,
        IERC20 want_
    ) external whenNotPaused onlyVault onlyWant(address(want_)) {
        require(amount_ > 0, "Strategy: zero amount");

        uint256 thisBalance = want_.balanceOf(address(this));
        if (thisBalance < amount_) {
            _protocolWithdraw(amount_ - thisBalance, want_);
        }

        want_.transfer(msg.sender, amount_);

        uint256 newBalance = want_.balanceOf(address(this));

        if (newBalance > 0) {
            _protocolDeposit(newBalance, want_);
        }
    }

    function withdrawAll(
        IERC20 token_
    ) external whenNotPaused onlyVault onlyWant(address(token_)) {
        _protocolWithdrawAll();
        token_.transfer(msg.sender, token_.balanceOf(address(this)));
    }

    function harvest() public virtual whenNotPaused {
        _protocolClaim();

        IERC20 token = IERC20(IERC4626(msg.sender).asset());
        uint256 balance = token.balanceOf(address(this));

        _payoutCallerFee(tx.origin, token, balance);
        _payoutProtocolFee(token, balance);
        _protocolDeposit(token.balanceOf(address(this)), token);
    }

    function yieldHarvest() external virtual whenNotPaused onlyRole(YIELD_SERVICE_ROLE) {
        _protocolClaim();
        for (uint256 i; i < _want.length; i++) {
            IERC20 token_ = IERC20(_want[i]);
            uint256 balance_ = token_.balanceOf(address(this));

            if (balance_ > 0) {
                _protocolDeposit(balance_, token_);
            }
        }
    }

    function balanceOf(IERC20 token) public view virtual returns (uint256) {
        return token.balanceOf(address(this)) + balanceOfPool(token);
    }
    function balancesOfWants() external view virtual returns (uint256[] memory balances) {
        balances = new uint256[](_want.length);
        for (uint256 i; i < _want.length; i++) {
            balances[i] = (IERC20(_want[i]).balanceOf(address(this)));
        }
    }

    /// @dev deposited to external platform
    function balanceOfPool(IERC20 token) public view virtual returns (uint256) {}

    function panic() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _protocolWithdrawAll();
        _rejectApprove();
        _pause();
    }
    function pause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _pause();
    }
    function unpause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _unpause();
    }
    function paused() public view virtual override(IStrategy, Pausable) returns (bool) {
        return Pausable.paused();
    }

    function _protocolDeposit(uint256 amount_, IERC20 token_) internal virtual {}
    function _protocolWithdraw(uint256 amount_, IERC20 token_) internal virtual {}
    function _protocolWithdrawAll() internal virtual {}
    function _protocolClaim() internal virtual {}
    function _payoutCallerFee(address caller, IERC20 token, uint256 balance) internal virtual {
        token.transfer(caller, balance.getPart(IVault(msg.sender).executorFee()));
    }

    function _payoutProtocolFee(IERC20 token, uint256 balance) internal virtual {
        token.transfer(
            IRegistry(IVault(msg.sender).registry()).treasury(),
            balance.getPart(IVault(msg.sender).protocolFee())
        );
    }

    function _onlyWant(address want_) private view {
        bool isStrategyUses;
        for (uint256 i; i < _want.length; i++) {
            if (_want[i] == want_) {
                isStrategyUses = true;
                break;
            }
        }

        require(isStrategyUses, "Strategy: token error");
    }

    function _onlyVault() private view {
        bool isVault;
        for (uint256 i; i < _vaults.length; i++) {
            if (address(_vaults[i]) == msg.sender) {
                isVault = true;
                break;
            }
        }

        require(isVault, "Strategy: caller not vault");
    }

    function _approveForAll() internal virtual {}
    function _rejectApprove() internal virtual {}
}
