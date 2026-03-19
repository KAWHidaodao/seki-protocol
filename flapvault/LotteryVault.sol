// SPDX-License-Identifier: MIT
pragma solidity ^0.8.13;

// ─────────────────────────────────────────────
// Flap V2 base contracts (inline minimal)
// ─────────────────────────────────────────────

struct FieldDescriptor {
    string name;
    string fieldType;
    string description;
    uint8  decimals;
}

struct ApproveAction {
    string tokenType;
    string amountFieldName;
}

struct VaultMethodSchema {
    string           name;
    string           description;
    FieldDescriptor[] inputs;
    FieldDescriptor[] outputs;
    ApproveAction[]  approvals;
    bool             isInputArray;
    bool             isOutputArray;
    bool             isWriteMethod;
}

struct VaultUISchema {
    string            vaultType;
    string            description;
    VaultMethodSchema[] methods;
}

abstract contract VaultBase {
    error UnsupportedChain(uint256 chainId);

    function _getPortal() internal view returns (address) {
        if (block.chainid == 56)  return 0xe2cE6ab80874Fa9Fa2aAE65D277Dd6B8e65C9De0;
        if (block.chainid == 97)  return 0x5bEacaF7ABCbB3aB280e80D007FD31fcE26510e9;
        revert UnsupportedChain(block.chainid);
    }

    function _getGuardian() internal view returns (address) {
        if (block.chainid == 56)  return 0x9e27098dcD8844bcc6287a557E0b4D09C86B8a4b;
        if (block.chainid == 97)  return 0x76Fa8C526f8Bc27ba6958B76DeEf92a0dbE46950;
        revert UnsupportedChain(block.chainid);
    }

    function description() public view virtual returns (string memory);
}

abstract contract VaultBaseV2 is VaultBase {
    function vaultUISchema() public pure virtual returns (VaultUISchema memory);
}

// ─────────────────────────────────────────────
// LotteryVault
// ─────────────────────────────────────────────

/**
 * @title  LotteryVault
 * @notice 收到 BNB 税收后累积奖池；后端过滤持仓 ≥30U 的地址列表传入
 *         triggerDraw()，合约链上随机抽取最多 10 名中奖者，平分 30% 奖池。
 *         剩余 70% 留存继续累积。
 */
contract LotteryVault is VaultBaseV2 {

    // ── 状态变量 ──────────────────────────────
    address public immutable taxToken;
    address public immutable creator;

    uint256 public totalReceived;    // 累计收到的 BNB
    uint256 public totalDistributed; // 累计发放的 BNB
    uint256 public drawCount;        // 开奖次数
    uint256 public nextDrawTime;     // 下次最早可开奖时间
    uint256 public minDrawInterval = 2 minutes; // 最短开奖间隔

    // 持仓人自动记录（买入时由 taxToken Transfer 事件触发后端调用 noteHolder）
    address[] public holders;
    mapping(address => bool) public isHolder;
    mapping(address => uint256) public holderIndex; // 1-based

    // 权限：creator + Guardian 可调 triggerDraw
    mapping(address => bool) public isOperator;

    // ── 事件 ──────────────────────────────────
    event HolderAdded(address indexed holder);
    event HolderRemoved(address indexed holder);
    event LotteryTriggered(address[] winners, uint256 prizeEach, uint256 totalPrize);

    // ── 错误 ──────────────────────────────────
    error OnlyOperator();
    error TooSoon();
    error NoEligible();
    error TransferFailed();

    // ── 构造函数 ──────────────────────────────
    constructor(address _taxToken, address _creator) {
        taxToken   = _taxToken;
        creator    = _creator;
        isOperator[_creator]     = true;
        isOperator[_getGuardian()] = true;
        nextDrawTime = block.timestamp;
    }

    // ── 接收税收 BNB ──────────────────────────
    receive() external payable {
        totalReceived += msg.value;
    }

    // ── 后端注册持仓人 ────────────────────────
    /// @notice 后端监听 Transfer 事件后调用，记录持仓地址
    function noteHolder(address account) external {
        // 任何人都可以提名一个地址（合约不存私钥，无安全风险）
        if (!isHolder[account] && account != address(0)) {
            isHolder[account] = true;
            holderIndex[account] = holders.length + 1;
            holders.push(account);
            emit HolderAdded(account);
        }
    }

    /// @notice 后端检测到某地址清仓后调用
    function removeHolder(address account) external onlyOperator {
        if (!isHolder[account]) return;
        isHolder[account] = false;
        uint256 idx = holderIndex[account] - 1;
        uint256 last = holders.length - 1;
        if (idx != last) {
            address moved = holders[last];
            holders[idx]  = moved;
            holderIndex[moved] = idx + 1;
        }
        holders.pop();
        holderIndex[account] = 0;
        emit HolderRemoved(account);
    }

    // ── 开奖 ─────────────────────────────────
    /**
     * @notice 后端过滤持仓 ≥30U 的地址传入，合约随机抽最多 10 人，平分 30% 奖池
     * @param eligible 后端传入的符合条件地址列表（已去重、已验证持仓）
     */
    function triggerDraw(address[] calldata eligible) external onlyOperator {
        if (block.timestamp < nextDrawTime) revert TooSoon();
        if (eligible.length == 0) revert NoEligible();

        uint256 pool = address(this).balance;
        if (pool == 0) revert NoEligible();

        uint256 prize = pool * 30 / 100; // 30% 奖池
        uint256 winnerCount = eligible.length < 10 ? eligible.length : 10;
        uint256 prizeEach   = prize / winnerCount;

        // 链上伪随机洗牌（Fisher-Yates 前 winnerCount 步）
        address[] memory list = new address[](eligible.length);
        for (uint256 i = 0; i < eligible.length; i++) list[i] = eligible[i];

        uint256 seed = uint256(keccak256(abi.encodePacked(
            block.prevrandao, block.timestamp, block.number, eligible.length
        )));

        address[] memory winners = new address[](winnerCount);
        for (uint256 i = 0; i < winnerCount; i++) {
            uint256 j = i + seed % (list.length - i);
            seed = uint256(keccak256(abi.encodePacked(seed, j)));
            (list[i], list[j]) = (list[j], list[i]);
            winners[i] = list[i];
        }

        // 发放
        uint256 actual;
        for (uint256 i = 0; i < winnerCount; i++) {
            (bool ok,) = winners[i].call{value: prizeEach}("");
            if (ok) actual += prizeEach;
        }

        totalDistributed += actual;
        drawCount++;
        nextDrawTime = block.timestamp + minDrawInterval;

        emit LotteryTriggered(winners, prizeEach, actual);
    }

    // ── 管理 ─────────────────────────────────
    function setMinDrawInterval(uint256 secs) external onlyOperator {
        minDrawInterval = secs;
    }

    function addOperator(address op) external {
        require(msg.sender == creator, "only creator");
        isOperator[op] = true;
    }

    /// @notice Guardian 的权限不可被撤销（符合 Flap Guardian mandate）
    function removeOperator(address op) external {
        require(msg.sender == creator, "only creator");
        require(op != _getGuardian(), "cannot revoke guardian");
        isOperator[op] = false;
    }

    function holdersLength() external view returns (uint256) { return holders.length; }

    // ── Flap V2 接口 ─────────────────────────
    function description() public view override returns (string memory) {
        return string(abi.encodePacked(
            "LotteryVault | 奖池: ", _bnbStr(address(this).balance),
            " BNB | 开奖次数: ", _uintStr(drawCount),
            " | 累计发放: ", _bnbStr(totalDistributed),
            " BNB | 持仓人数: ", _uintStr(holders.length),
            " | 每次收税30%随机发给最多10名持仓>=30U的玩家"
        ));
    }

    function vaultUISchema() public pure override returns (VaultUISchema memory schema) {
        schema.vaultType   = "LotteryVault";
        schema.description = "收到 BNB 税收后，30% 随机分给最多 10 名持仓 >=30U 的玩家，70% 留存滚动。";

        schema.methods = new VaultMethodSchema[](4);

        // view: drawCount
        schema.methods[0].name        = "drawCount";
        schema.methods[0].description = "累计开奖次数";
        schema.methods[0].outputs     = new FieldDescriptor[](1);
        schema.methods[0].outputs[0]  = FieldDescriptor("count", "uint256", "开奖次数", 0);

        // view: totalDistributed
        schema.methods[1].name        = "totalDistributed";
        schema.methods[1].description = "累计发放 BNB";
        schema.methods[1].outputs     = new FieldDescriptor[](1);
        schema.methods[1].outputs[0]  = FieldDescriptor("amount", "uint256", "发放总量", 18);

        // view: holdersLength
        schema.methods[2].name        = "holdersLength";
        schema.methods[2].description = "当前记录持仓人数";
        schema.methods[2].outputs     = new FieldDescriptor[](1);
        schema.methods[2].outputs[0]  = FieldDescriptor("count", "uint256", "人数", 0);

        // view: nextDrawTime
        schema.methods[3].name        = "nextDrawTime";
        schema.methods[3].description = "下次可开奖时间";
        schema.methods[3].outputs     = new FieldDescriptor[](1);
        schema.methods[3].outputs[0]  = FieldDescriptor("time", "time", "时间戳", 0);
    }

    // ── 工具函数 ─────────────────────────────
    modifier onlyOperator() {
        if (!isOperator[msg.sender]) revert OnlyOperator();
        _;
    }

    function _uintStr(uint256 v) internal pure returns (string memory) {
        if (v == 0) return "0";
        uint256 tmp = v; uint256 len;
        while (tmp > 0) { len++; tmp /= 10; }
        bytes memory b = new bytes(len);
        while (v > 0) { b[--len] = bytes1(uint8(48 + v % 10)); v /= 10; }
        return string(b);
    }

    function _bnbStr(uint256 wei_) internal pure returns (string memory) {
        uint256 whole = wei_ / 1e18;
        uint256 frac  = (wei_ % 1e18) * 10000 / 1e18;
        return string(abi.encodePacked(_uintStr(whole), ".", _pad4(frac)));
    }

    function _pad4(uint256 v) internal pure returns (string memory) {
        bytes memory b = new bytes(4);
        for (int256 i = 3; i >= 0; i--) { b[uint256(i)] = bytes1(uint8(48 + v % 10)); v /= 10; }
        return string(b);
    }
}
