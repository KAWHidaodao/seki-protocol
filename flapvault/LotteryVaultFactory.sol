// SPDX-License-Identifier: MIT
pragma solidity ^0.8.13;

import "./LotteryVault.sol";

// ─────────────────────────────────────────────
// Flap V2 Factory base (inline)
// ─────────────────────────────────────────────

struct VaultDataSchema {
    string            description;
    FieldDescriptor[] fields;
    bool              isArray;
}

interface IVaultFactory {
    error OnlyVaultPortal();
    error ZeroAddress();
    function newVault(address taxToken, address quoteToken, address creator, bytes calldata vaultData)
        external returns (address vault);
    function isQuoteTokenSupported(address quoteToken) external view returns (bool);
}

abstract contract VaultFactoryBaseV2 is IVaultFactory {
    error UnsupportedChain(uint256 chainId);

    function vaultDataSchema() public pure virtual returns (VaultDataSchema memory);

    function _getVaultPortal() internal view returns (address) {
        if (block.chainid == 56) return 0x90497450f2a706f1951b5bdda52B4E5d16f34C06;
        if (block.chainid == 97) return 0x027e3704fC5C16522e9393d04C60A3ac5c0d775f;
        revert UnsupportedChain(block.chainid);
    }

    function _getGuardian() internal view returns (address) {
        if (block.chainid == 56) return 0x9e27098dcD8844bcc6287a557E0b4D09C86B8a4b;
        if (block.chainid == 97) return 0x76Fa8C526f8Bc27ba6958B76DeEf92a0dbE46950;
        revert UnsupportedChain(block.chainid);
    }
}

// ─────────────────────────────────────────────
// LotteryVaultFactory
// ─────────────────────────────────────────────

contract LotteryVaultFactory is VaultFactoryBaseV2 {

    event VaultCreated(address indexed vault, address indexed taxToken, address indexed creator);

    function newVault(
        address taxToken,
        address quoteToken,
        address creator,
        bytes calldata /*vaultData*/  // 无需配置参数
    ) external override returns (address vault) {
        if (msg.sender != _getVaultPortal()) revert OnlyVaultPortal();
        if (taxToken == address(0) || creator == address(0)) revert ZeroAddress();
        // 目前只支持 BNB
        require(quoteToken == address(0), "only BNB");

        LotteryVault v = new LotteryVault(taxToken, creator);
        emit VaultCreated(address(v), taxToken, creator);
        return address(v);
    }

    function isQuoteTokenSupported(address quoteToken) external pure override returns (bool) {
        return quoteToken == address(0); // 只支持 BNB
    }

    function vaultDataSchema() public pure override returns (VaultDataSchema memory schema) {
        schema.description = "LotteryVault：无需配置参数。收到税收 BNB 后，30% 随机分给最多 10 名持仓 ≥30U 的玩家。";
        schema.fields  = new FieldDescriptor[](0);
        schema.isArray = false;
    }
}
