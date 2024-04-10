// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.20;

import {BeaconProxy} from "@openzeppelin/contracts/proxy/beacon/BeaconProxy.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {IProxyFactory} from "../interfaces/registry/IProxyFactory.sol";
import {IVault} from "../interfaces/vault/IVault.sol";

contract ProxyFactory is IProxyFactory {
    address public beacon;

    constructor(address beacon_) {
        beacon = beacon_;
    }

    function _deployProxy(
        IERC20 asset_,
        string memory name_,
        string memory symbol_,
        uint256 protocolFee_,
        uint256 executorFee_
    ) internal returns (address proxy) {
        proxy = address(new BeaconProxy(beacon, ""));

        IVault(proxy).__Vault_init(
            msg.sender,
            asset_,
            address(this),
            name_,
            symbol_,
            protocolFee_,
            executorFee_
        );
    }
}
