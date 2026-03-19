// SPDX-License-Identifier: MIT
pragma solidity ^0.8.13;

// ═══════════════════════════════════════════════════════════════
//  Flap V2 共享类型
// ═══════════════════════════════════════════════════════════════

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
    string            name;
    string            description;
    FieldDescriptor[] inputs;
    FieldDescriptor[] outputs;
    ApproveAction[]   approvals;
    bool              isInputArray;
    bool              isOutputArray;
    bool              isWriteMethod;
}

struct VaultUISchema {
    string              vaultType;
    string              description;
    VaultMethodSchema[] methods;
}

struct VaultDataSchema {
    string            description;
    FieldDescriptor[] fields;
    bool              isArray;
}

// ═══════════════════════════════════════════════════════════════
//  VaultBase / VaultBaseV2
// ═══════════════════════════════════════════════════════════════

abstract contract VaultBase {
    error UnsupportedChain(uint256 chainId);

    function _getPortal() internal view returns (address) {
        if (block.chainid == 56) return 0xe2cE6ab80874Fa9Fa2aAE65D277Dd6B8e65C9De0;
        if (block.chainid == 97) return 0x5bEacaF7ABCbB3aB280e80D007FD31fcE26510e9;
        revert UnsupportedChain(block.chainid);
    }

    function _getGuardian() internal view returns (address) {
        if (block.chainid == 56) return 0x9e27098dcD8844bcc6287a557E0b4D09C86B8a4b;
        if (block.chainid == 97) return 0x76Fa8C526f8Bc27ba6958B76DeEf92a0dbE46950;
        revert UnsupportedChain(block.chainid);
    }

    function description() public view virtual returns (string memory);
}

abstract contract VaultBaseV2 is VaultBase {
    function vaultUISchema() public pure virtual returns (VaultUISchema memory);
}

// ═══════════════════════════════════════════════════════════════
//  IVaultFactory / VaultFactoryBaseV2
// ═══════════════════════════════════════════════════════════════

interface IVaultFactory {
    error OnlyVaultPortal();
    error ZeroAddress();

    function newVault(
        address taxToken,
        address quoteToken,
        address creator,
        bytes calldata vaultData
    ) external returns (address vault);

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

// ═══════════════════════════════════════════════════════════════
//  FlapAIConsumerBase
// ═══════════════════════════════════════════════════════════════

interface IFlapAIProvider {
    struct Model { string name; uint256 price; bool enabled; }
    function reason(uint256 modelId, string calldata prompt, uint8 numOfChoices) external payable returns (uint256);
    function getModel(uint256 modelId) external view returns (Model memory);
}

abstract contract FlapAIConsumerBase {
    error FlapAIConsumerOnlyProvider();
    error FlapAIConsumerUnsupportedChain(uint256 chainId);

    modifier onlyFlapAIProvider() {
        if (msg.sender != _getFlapAIProvider()) revert FlapAIConsumerOnlyProvider();
        _;
    }

    function _getFlapAIProvider() internal view virtual returns (address) {
        if (block.chainid == 56) return 0xaEe3a7Ca6fe6b53f6c32a3e8407eC5A9dF8B7E39;
        if (block.chainid == 97) return 0xFfddcE44e8cFf7703Fd85118524bfC8B2f70b744;
        revert FlapAIConsumerUnsupportedChain(block.chainid);
    }

    function lastRequestId() public view virtual returns (uint256);

    function fulfillReasoning(uint256 requestId, uint8 choice) external onlyFlapAIProvider {
        _fulfillReasoning(requestId, choice);
    }

    function onFlapAIRequestRefunded(uint256 requestId) external payable onlyFlapAIProvider {
        _onFlapAIRequestRefunded(requestId);
    }

    function _fulfillReasoning(uint256 requestId, uint8 choice) internal virtual;
    function _onFlapAIRequestRefunded(uint256 requestId) internal virtual;
}

// ═══════════════════════════════════════════════════════════════
//  ITaxToken
// ═══════════════════════════════════════════════════════════════

interface ITaxToken {
    function taxRate() external view returns (uint256);
}

// ═══════════════════════════════════════════════════════════════
//  LotteryVault
// ═══════════════════════════════════════════════════════════════

/**
 * @title  LotteryVault
 * @notice 架构（方案B）：
 *   - 收到税收 BNB → AI Oracle 分析市场，决定 (0)立即开奖 (1)继续累积
 *   - choice=0 → 合约标记 drawReady=true，发出 DrawReady 事件
 *   - 后端监听事件，查 OKX API 过滤持仓≥30U 地址，调 triggerDraw(eligible[])
 *   - 合约随机抽最多10人，平分30%奖池
 *
 * AI Oracle 费用（0.01 BNB/次）由合约余额支付，与奖池共用。
 * 为避免 Oracle 耗尽奖池，设 MIN_POOL_FOR_AI：奖池低于此值时跳过 AI 查询。
 */
contract LotteryVault is VaultBaseV2, FlapAIConsumerBase {

    // ── 常量 ──────────────────────────────────
    uint256 constant MODEL_ID    = 0;   // Gemini Flash 0.01 BNB/次
    uint8   constant NUM_CHOICES = 2;   // 0=开奖 1=继续累积
    uint256 constant MIN_POOL_FOR_AI = 0.05 ether; // 奖池低于0.05 BNB时不触发AI

    // ── 状态 ──────────────────────────────────
    address public immutable taxToken;
    address public immutable creator;

    uint256 public taxRateBps;
    uint256 public totalReceived;
    uint256 public totalFee;
    uint256 public totalDistributed;
    uint256 public drawCount;
    uint256 public nextDrawTime;
    uint256 public minDrawInterval = 2 minutes;
    uint256 public cooldown;           // AI 请求间隔（秒）
    uint256 public lastAIRequest;      // 上次 AI 请求时间

    // AI Oracle
    uint256 private _lastRequestId;
    bool    public  drawReady;         // AI 决定开奖，等待后端传 eligible

    // 持仓人列表
    address[] public holders;
    mapping(address => bool)    public isHolder;
    mapping(address => uint256) public holderIndex;

    // 权限
    mapping(address => bool) public isOperator;

    // ── 事件 ──────────────────────────────────
    event Received(uint256 gross, uint256 fee, uint256 net);
    event HolderAdded(address indexed holder);
    event HolderRemoved(address indexed holder);
    event DrawReady(uint256 pool, uint256 requestId);    // 后端监听此事件
    event LotteryTriggered(address[] winners, uint256 prizeEach, uint256 total);
    event AIDecision(uint256 requestId, uint8 choice);

    // ── 错误 ──────────────────────────────────
    error OnlyOperator();
    error TooSoon();
    error NoEligible();
    error NotReady();
    error CannotRevokeGuardian();

    // ── 构造 ──────────────────────────────────
    constructor(address _taxToken, address _creator) {
        taxToken  = _taxToken;
        creator   = _creator;
        cooldown  = 5 minutes;
        isOperator[_creator]       = true;
        isOperator[_getGuardian()] = true;
        nextDrawTime = block.timestamp;
    }

    // ── 接收税收 BNB ──────────────────────────
    receive() external payable {
        if (msg.value == 0) return;
        totalReceived += msg.value;

        // 懒加载税率
        if (taxRateBps == 0) {
            try ITaxToken(taxToken).taxRate() returns (uint256 r) {
                if (r > 0) taxRateBps = r;
            } catch {}
        }

        // Flap 推荐手续费
        uint256 fee;
        if (taxRateBps == 0 || taxRateBps <= 100) {
            fee = msg.value * 600 / 10000;
        } else {
            fee = msg.value * 6 / taxRateBps;
        }
        if (fee > 0) {
            totalFee += fee;
            (bool ok,) = _getPortal().call{value: fee}("");
            if (!ok) totalFee -= fee;
        }

        emit Received(msg.value, fee, msg.value - fee);

        // 触发 AI 决策（一次只有一个请求，且满足间隔和最低奖池）
        _maybeAskAI();
    }

    // ── AI 决策 ───────────────────────────────
    function _maybeAskAI() internal {
        if (_lastRequestId != 0) return;                              // 已有待处理请求
        if (block.timestamp < lastAIRequest + cooldown) return;       // 冷却中
        if (address(this).balance < MIN_POOL_FOR_AI) return;         // 奖池太小

        IFlapAIProvider provider = IFlapAIProvider(_getFlapAIProvider());
        IFlapAIProvider.Model memory m = provider.getModel(MODEL_ID);
        if (!m.enabled) return;
        if (address(this).balance < m.price + 0.01 ether) return;    // 留余量给奖池

        string memory prompt = string(abi.encodePacked(
            unicode"你是一个BNB链上税收代币的金库管理AI。",
            unicode"当前奖池余额：", _bnbStr(address(this).balance),
            unicode" BNB。累计开奖：", _uintStr(drawCount),
            unicode"次。请用 ave_token_tool 查询代币 ", _addr2str(taxToken),
            unicode" 的市场数据（价格趋势、交易量、持仓人数），然后决定：",
            unicode"(0) 立即开奖，将30%奖池随机发给持仓>=30U的玩家 ",
            unicode"(1) 继续累积，等待更好时机开奖"
        ));

        lastAIRequest = block.timestamp;
        _lastRequestId = provider.reason{value: m.price}(MODEL_ID, prompt, NUM_CHOICES);
    }

    // ── AI 回调 ───────────────────────────────
    function _fulfillReasoning(uint256 requestId, uint8 choice) internal override {
        require(requestId == _lastRequestId, unicode"unknown request");
        _lastRequestId = 0;
        emit AIDecision(requestId, choice);

        if (choice == 0) {
            // AI 决定开奖 → 标记 ready，后端监听事件传 eligible
            drawReady = true;
            emit DrawReady(address(this).balance, requestId);
        }
        // choice == 1: 继续累积，什么都不做
    }

    function _onFlapAIRequestRefunded(uint256 requestId) internal override {
        require(requestId == _lastRequestId, unicode"unknown request");
        _lastRequestId = 0;
        // 下次 receive() 会自动重试
    }

    function lastRequestId() public view override returns (uint256) {
        return _lastRequestId;
    }

    // ── 后端调用：执行开奖 ───────────────────
    /**
     * @notice 后端过滤持仓≥30U地址后调用
     * @param eligible 持仓≥30U的地址列表
     */
    function triggerDraw(address[] calldata eligible) external onlyOperator {
        if (!drawReady) revert NotReady();
        if (block.timestamp < nextDrawTime) revert TooSoon();
        if (eligible.length == 0) revert NoEligible();

        uint256 pool = address(this).balance;
        if (pool == 0) revert NoEligible();

        drawReady = false;

        uint256 prize       = pool * 30 / 100;
        uint256 winnerCount = eligible.length < 10 ? eligible.length : 10;
        uint256 prizeEach   = prize / winnerCount;

        // Fisher-Yates 链上随机洗牌
        address[] memory list = new address[](eligible.length);
        for (uint256 i = 0; i < eligible.length; i++) list[i] = eligible[i];

        uint256 seed = uint256(keccak256(abi.encodePacked(
            block.prevrandao, block.timestamp, block.number, msg.sender
        )));

        address[] memory winners = new address[](winnerCount);
        for (uint256 i = 0; i < winnerCount; i++) {
            uint256 j = i + (seed % (list.length - i));
            seed = uint256(keccak256(abi.encodePacked(seed, j)));
            (list[i], list[j]) = (list[j], list[i]);
            winners[i] = list[i];
        }

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

    // ── 持仓人管理 ────────────────────────────
    function noteHolder(address account) external {
        if (account == address(0) || isHolder[account]) return;
        isHolder[account] = true;
        holderIndex[account] = holders.length + 1;
        holders.push(account);
        emit HolderAdded(account);
    }

    function removeHolder(address account) external onlyOperator {
        if (!isHolder[account]) return;
        isHolder[account] = false;
        uint256 idx  = holderIndex[account] - 1;
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

    // ── 管理 ─────────────────────────────────
    function setMinDrawInterval(uint256 secs) external onlyOperator { minDrawInterval = secs; }
    function setCooldown(uint256 secs)        external onlyOperator { cooldown = secs; }

    function addOperator(address op) external {
        require(msg.sender == creator, unicode"only creator");
        isOperator[op] = true;
    }

    function removeOperator(address op) external {
        require(msg.sender == creator, unicode"only creator");
        if (op == _getGuardian()) revert CannotRevokeGuardian();
        isOperator[op] = false;
    }

    function holdersLength() external view returns (uint256) { return holders.length; }
    function poolBalance()   external view returns (uint256) { return address(this).balance; }

    // ── Flap V2 ──────────────────────────────
    function description() public view override returns (string memory) {
        return string(abi.encodePacked(
            unicode"LotteryVault | 奖池:", _bnbStr(address(this).balance),
            unicode"BNB | 开奖:", _uintStr(drawCount),
            unicode"次 | 已发:", _bnbStr(totalDistributed),
            unicode"BNB | AI决策:", drawReady ? unicode"待开奖" : unicode"观察中",
            unicode" | AI每次税收分析市场，决定是否触发随机抽奖"
        ));
    }

    function vaultUISchema() public pure override returns (VaultUISchema memory schema) {
        schema.vaultType   = unicode"LotteryVault";
        schema.description = unicode"AI Oracle分析市场决定开奖时机，30%奖池随机发给最多10名持仓>=30U玩家。";
        schema.methods     = new VaultMethodSchema[](5);

        schema.methods[0].name        = "poolBalance";
        schema.methods[0].description = unicode"当前奖池BNB";
        schema.methods[0].outputs     = new FieldDescriptor[](1);
        schema.methods[0].outputs[0]  = FieldDescriptor("balance", "uint256", "BNB", 18);

        schema.methods[1].name        = "drawCount";
        schema.methods[1].description = unicode"累计开奖次数";
        schema.methods[1].outputs     = new FieldDescriptor[](1);
        schema.methods[1].outputs[0]  = FieldDescriptor("count", "uint256", unicode"次数", 0);

        schema.methods[2].name        = "totalDistributed";
        schema.methods[2].description = unicode"累计发放奖金";
        schema.methods[2].outputs     = new FieldDescriptor[](1);
        schema.methods[2].outputs[0]  = FieldDescriptor("amount", "uint256", "BNB", 18);

        schema.methods[3].name        = "drawReady";
        schema.methods[3].description = unicode"AI是否已决定开奖（等待后端执行）";
        schema.methods[3].outputs     = new FieldDescriptor[](1);
        schema.methods[3].outputs[0]  = FieldDescriptor("ready", "bool", unicode"是否就绪", 0);

        schema.methods[4].name        = "lastRequestId";
        schema.methods[4].description = unicode"当前AI Oracle请求ID（0=无）";
        schema.methods[4].outputs     = new FieldDescriptor[](1);
        schema.methods[4].outputs[0]  = FieldDescriptor("id", "uint256", "requestId", 0);
    }

    // ── 工具 ─────────────────────────────────
    modifier onlyOperator() {
        if (!isOperator[msg.sender]) revert OnlyOperator();
        _;
    }

    function _uintStr(uint256 v) internal pure returns (string memory) {
        if (v == 0) return "0";
        uint256 t = v; uint256 l;
        while (t > 0) { l++; t /= 10; }
        bytes memory b = new bytes(l);
        while (v > 0) { b[--l] = bytes1(uint8(48 + v % 10)); v /= 10; }
        return string(b);
    }

    function _bnbStr(uint256 w) internal pure returns (string memory) {
        uint256 whole = w / 1e18;
        uint256 frac  = (w % 1e18) * 10000 / 1e18;
        bytes memory fb = new bytes(4);
        uint256 tmp = frac;
        for (int256 i = 3; i >= 0; i--) { fb[uint256(i)] = bytes1(uint8(48 + tmp % 10)); tmp /= 10; }
        return string(abi.encodePacked(_uintStr(whole), ".", string(fb)));
    }

    function _addr2str(address a) internal pure returns (string memory) {
        bytes memory b = new bytes(42);
        b[0] = '0'; b[1] = 'x';
        bytes16 hex_ = "0123456789abcdef";
        for (uint256 i = 0; i < 20; i++) {
            b[2+i*2]   = hex_[uint8(bytes20(a)[i]) >> 4];
            b[2+i*2+1] = hex_[uint8(bytes20(a)[i]) & 0xf];
        }
        return string(b);
    }
}

// ═══════════════════════════════════════════════════════════════
//  LotteryVaultFactory
// ═══════════════════════════════════════════════════════════════

contract LotteryVaultFactory is VaultFactoryBaseV2 {

    event VaultCreated(address indexed vault, address indexed taxToken, address indexed creator);

    function newVault(
        address taxToken,
        address, /* quoteToken */
        address creator,
        bytes calldata /* vaultData */
    ) external override returns (address vault) {
        require(msg.sender == _getVaultPortal(), unicode"Only VaultPortal");

        LotteryVault v = new LotteryVault(taxToken, creator);
        emit VaultCreated(address(v), taxToken, creator);
        return address(v);
    }

    function isQuoteTokenSupported(address) external pure override returns (bool) {
        return true;
    }

    function vaultDataSchema() public pure override returns (VaultDataSchema memory schema) {
        schema.description = unicode"LotteryVault：无需配置。AI Oracle自动分析市场决定开奖时机，30%奖池随机发给最多10名持仓>=30U玩家。";
        schema.fields      = new FieldDescriptor[](0);
        schema.isArray     = false;
    }
}
