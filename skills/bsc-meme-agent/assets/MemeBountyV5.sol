// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * MemeBountyV5
 * 新增：
 *   - claimFor(id, user)       Agent 代替用户领取任意类型任务奖励（零操作）
 *   - startHoldFor(id, user)   Agent 代替用户开始持仓计时
 *   - minReferrals 字段正式加入 TaskCond
 *   - agentWallet 权限保护 claimFor / startHoldFor
 */

interface IERC20 {
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function transfer(address to, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
    function decimals() external view returns (uint8);
}

interface IPair {
    function getReserves() external view returns (uint112 r0, uint112 r1, uint32 ts);
    function token0() external view returns (address);
}

interface IFactory {
    function getPair(address a, address b) external view returns (address);
}

contract MemeBountyV5 {

    // ── 存储结构 ──────────────────────────────────────
    struct TaskBase {
        address creator;
        address targetToken;
        uint256 maxWinners;
        uint256 rewardPerWinner;
        uint256 totalReward;
        uint256 claimedCount;
        uint256 deadline;
        uint8   taskType;
        uint8   rewardType;
        bool    active;
    }

    struct TaskCond {
        address rewardToken;
        uint256 minTokenAmount;
        uint256 minHoldSeconds;
        uint256 minBuyBNB;
        uint256 minReferrals;   // v5 新增
    }

    struct RegistryTaskParams {
        address creator;
        address targetToken;
        uint8   taskType;
        uint256 maxWinners;
        uint256 rewardPerWinner;
        uint256 deadline;
        uint256 minTokenAmount;
        uint256 minHoldSeconds;
        uint256 minBuyBNB;
        uint256 minReferrals;
    }

    struct _StoreArgs {
        address creator; address targetToken;
        uint8 taskType; uint8 rewardType; address rewardToken;
        uint256 maxWinners; uint256 rewardPerWinner; uint256 total; uint256 deadline;
        uint256 minTokenAmount; uint256 minHoldSeconds; uint256 minBuyBNB; uint256 minReferrals;
    }

    // ── 状态变量 ──────────────────────────────────────
    address public owner;
    address public feeReceiver;
    address public officialToken;
    address public agentWallet;
    address public agentRegistry;
    uint256 public minHoldAmount;

    uint256 public constant FEE_BPS        = 300;
    uint256 public constant THRESHOLD_USDT = 100e18;

    address constant USDT    = 0x55d398326f99059fF775485246999027B3197955;
    address constant WBNB    = 0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c;
    address constant FACTORY = 0xcA143Ce32Fe78f1f7019d7d551a6402fC5350c73;

    uint256 public nextTaskId;
    mapping(uint256 => TaskBase) public taskBase;
    mapping(uint256 => TaskCond) public taskCond;
    mapping(uint256 => mapping(address => uint256)) public holdStart;
    mapping(uint256 => mapping(address => uint256)) public holdSnapshot;
    mapping(uint256 => mapping(address => bool))    public hasClaimed;
    mapping(uint256 => address[]) public participants;

    // ── 事件 ──────────────────────────────────────────
    event TaskCreated(uint256 indexed id, address indexed creator, address indexed targetToken, uint8 taskType, uint256 deadline);
    event TaskCancelled(uint256 indexed id);
    event Claimed(uint256 indexed id, address indexed user, uint256 amount);
    event ClaimedByAgent(uint256 indexed id, address indexed user, address indexed agent, uint256 amount); // v5 新增

    // ── 权限 ──────────────────────────────────────────
    modifier onlyOwner()  { require(msg.sender == owner, "owner"); _; }
    modifier onlyAgent()  { require(msg.sender == agentWallet || msg.sender == owner, "agent"); _; }

    constructor(address _fee) { owner = msg.sender; feeReceiver = _fee; }

    // ── 管理函数 ──────────────────────────────────────
    function setOfficialToken(address t)  external onlyOwner { officialToken = t; }
    function setFeeReceiver(address r)    external onlyOwner { feeReceiver = r; }
    function setAgentWallet(address a)    external onlyOwner { agentWallet = a; }
    function setAgentRegistry(address r)  external onlyOwner { agentRegistry = r; }
    function setMinHoldAmount(uint256 n)  external onlyOwner { minHoldAmount = n; }
    function transferOwner(address o)     external onlyOwner { owner = o; }

    // ── 内部工具 ──────────────────────────────────────
    function _eligible(address u) internal view {
        if (u == agentWallet) return;
        if (agentRegistry != address(0) && u == agentRegistry) return;
        if (officialToken == address(0)) return;
        if (minHoldAmount == 0) return;
        require(IERC20(officialToken).balanceOf(u) >= minHoldAmount, "need MBT");
    }

    function _bnb(address to, uint256 amt) internal {
        (bool ok,) = to.call{value: amt}("");
        require(ok, "bnb fail");
    }

    function _send(uint8 rt, address rewardToken, address to, uint256 amt) internal {
        if (rt == 0) _bnb(to, amt);
        else if (rt == 1) IERC20(USDT).transfer(to, amt);
        else IERC20(rewardToken).transfer(to, amt);
    }

    function _pay(TaskBase storage b, uint256 id, address user) internal {
        require(b.claimedCount < b.maxWinners, "full");
        hasClaimed[id][user] = true;
        b.claimedCount++;
        if (b.claimedCount == b.maxWinners) b.active = false;
        _send(b.rewardType, taskCond[id].rewardToken, user, b.rewardPerWinner);
        emit Claimed(id, user, b.rewardPerWinner);
    }

    function _collect(uint8 rt, address rewardToken, uint256 total, uint256 fee) internal {
        address feeDest = agentWallet != address(0) ? agentWallet : feeReceiver;
        if (rt == 0) {
            require(msg.value >= total + fee, "bnb");
            if (fee > 0) _bnb(feeDest, fee);
        } else if (rt == 1) {
            IERC20(USDT).transferFrom(msg.sender, address(this), total);
            if (fee > 0) IERC20(USDT).transferFrom(msg.sender, feeDest, fee);
        } else {
            IERC20(rewardToken).transferFrom(msg.sender, address(this), total);
            if (fee > 0) IERC20(rewardToken).transferFrom(msg.sender, feeDest, fee);
        }
    }

    function _validateTask(uint8 taskType, uint256 maxWinners, uint256 rewardPerWinner, uint256 deadline, uint256 minHoldSeconds) internal view {
        require(maxWinners > 0 && rewardPerWinner > 0, "params");
        require(deadline > block.timestamp, "deadline");
        if (taskType == 0) {
            require(minHoldSeconds >= 120 && minHoldSeconds <= 3600, "holdTime 2m-1h");
        }
    }

    function _storeTask(_StoreArgs memory a) internal returns (uint256 id) {
        id = nextTaskId++;
        taskBase[id] = TaskBase(
            a.creator, a.targetToken, a.maxWinners, a.rewardPerWinner,
            a.total, 0, a.deadline, a.taskType, a.rewardType, true
        );
        taskCond[id] = TaskCond(a.rewardToken, a.minTokenAmount, a.minHoldSeconds, a.minBuyBNB, a.minReferrals);
        emit TaskCreated(id, a.creator, a.targetToken, a.taskType, a.deadline);
    }

    // ── 创建任务 ──────────────────────────────────────
    function createTask(
        address targetToken,
        uint8   taskType,
        uint8   rewardType,
        address rewardToken,
        uint256 maxWinners,
        uint256 rewardPerWinner,
        uint256 deadline,
        uint256 minTokenAmount,
        uint256 minHoldSeconds,
        uint256 minBuyBNB,
        uint256 minReferrals
    ) external payable returns (uint256 id) {
        _eligible(msg.sender);
        _validateTask(taskType, maxWinners, rewardPerWinner, deadline, minHoldSeconds);
        uint256 total = maxWinners * rewardPerWinner;
        uint256 fee   = total * FEE_BPS / 10000;
        _collect(rewardType, rewardToken, total, fee);
        _StoreArgs memory a;
        a.creator = msg.sender; a.targetToken = targetToken;
        a.taskType = taskType; a.rewardType = rewardType; a.rewardToken = rewardToken;
        a.maxWinners = maxWinners; a.rewardPerWinner = rewardPerWinner;
        a.total = total; a.deadline = deadline;
        a.minTokenAmount = minTokenAmount; a.minHoldSeconds = minHoldSeconds;
        a.minBuyBNB = minBuyBNB; a.minReferrals = minReferrals;
        id = _storeTask(a);
    }

    // AgentRegistry 代发任务（V5 完整版，含 minReferrals）
    function createTaskFromRegistry(RegistryTaskParams calldata p) external payable returns (uint256 id) {
        require(msg.sender == agentRegistry, "only registry");
        uint256 total = p.maxWinners * p.rewardPerWinner;
        uint256 fee   = total * FEE_BPS / 10000;
        require(msg.value >= total + fee, "value");
        address feeDest = agentWallet != address(0) ? agentWallet : feeReceiver;
        if (fee > 0) _bnb(feeDest, fee);
        _validateTask(p.taskType, p.maxWinners, p.rewardPerWinner, p.deadline, p.minHoldSeconds);
        _StoreArgs memory a;
        a.creator = p.creator; a.targetToken = p.targetToken;
        a.taskType = p.taskType; a.rewardType = 0; a.rewardToken = address(0);
        a.maxWinners = p.maxWinners; a.rewardPerWinner = p.rewardPerWinner;
        a.total = total; a.deadline = p.deadline;
        a.minTokenAmount = p.minTokenAmount; a.minHoldSeconds = p.minHoldSeconds;
        a.minBuyBNB = p.minBuyBNB; a.minReferrals = p.minReferrals;
        id = _storeTask(a);
    }

    // ── 兼容旧版 AgentRegistry（9字段，无 minReferrals）────────────
    struct RegistryTaskParamsV2 {
        address creator;
        address targetToken;
        uint8   taskType;
        uint256 maxWinners;
        uint256 rewardPerWinner;
        uint256 deadline;
        uint256 minTokenAmount;
        uint256 minHoldSeconds;
        uint256 minBuyBNB;
    }

    function createTaskFromRegistryV2(RegistryTaskParamsV2 calldata p) external payable returns (uint256 id) {
        require(msg.sender == agentRegistry, "only registry");
        uint256 total = p.maxWinners * p.rewardPerWinner;
        uint256 fee   = total * FEE_BPS / 10000;
        require(msg.value >= total + fee, "value");
        address feeDest = agentWallet != address(0) ? agentWallet : feeReceiver;
        if (fee > 0) _bnb(feeDest, fee);
        _validateTask(p.taskType, p.maxWinners, p.rewardPerWinner, p.deadline, p.minHoldSeconds);
        _StoreArgs memory a;
        a.creator = p.creator; a.targetToken = p.targetToken;
        a.taskType = p.taskType; a.rewardType = 0; a.rewardToken = address(0);
        a.maxWinners = p.maxWinners; a.rewardPerWinner = p.rewardPerWinner;
        a.total = total; a.deadline = p.deadline;
        a.minTokenAmount = p.minTokenAmount; a.minHoldSeconds = p.minHoldSeconds;
        a.minBuyBNB = p.minBuyBNB; a.minReferrals = 0;
        id = _storeTask(a);
    }

    // ── 用户自行领取（原有接口，保持兼容）────────────
    function startHold(uint256 id) external {
        TaskBase storage b = taskBase[id];
        require(b.active && b.taskType == 0, "invalid");
        require(block.timestamp < b.deadline, "expired");
        require(holdStart[id][msg.sender] == 0, "started");
        require(!hasClaimed[id][msg.sender], "claimed");
        require(IERC20(b.targetToken).balanceOf(msg.sender) >= taskCond[id].minTokenAmount, "balance");
        holdStart[id][msg.sender] = block.timestamp;
        holdSnapshot[id][msg.sender] = IERC20(b.targetToken).balanceOf(msg.sender);
    }

    function claimHold(uint256 id) external {
        TaskBase storage b = taskBase[id];
        require(b.active && b.taskType == 0, "invalid");
        require(b.claimedCount < b.maxWinners, "full");
        require(!hasClaimed[id][msg.sender], "claimed");
        uint256 hs = holdStart[id][msg.sender];
        require(hs > 0, "not started");
        require(block.timestamp >= hs + taskCond[id].minHoldSeconds, "hold time");
        uint256 snap = holdSnapshot[id][msg.sender];
        uint256 cur  = IERC20(b.targetToken).balanceOf(msg.sender);
        require(cur >= taskCond[id].minTokenAmount, "balance");
        require(snap == 0 || cur >= snap, "balance decreased");
        _pay(b, id, msg.sender);
    }

    function claimBuy(uint256 id, address user) external onlyOwner {
        TaskBase storage b = taskBase[id];
        require(b.active && b.taskType == 1, "invalid");
        require(b.claimedCount < b.maxWinners, "full");
        require(!hasClaimed[id][user], "claimed");
        require(IERC20(b.targetToken).balanceOf(user) >= taskCond[id].minTokenAmount, "balance");
        _pay(b, id, user);
    }

    function claimEarlyBird(uint256 id) external {
        TaskBase storage b = taskBase[id];
        require(b.active && b.taskType == 2, "invalid");
        require(block.timestamp < b.deadline, "expired");
        require(b.claimedCount < b.maxWinners, "full");
        require(!hasClaimed[id][msg.sender], "claimed");
        uint256 snap = holdSnapshot[id][msg.sender];
        uint256 cur  = IERC20(b.targetToken).balanceOf(msg.sender);
        require(cur >= taskCond[id].minTokenAmount, "balance");
        require(snap == 0 || cur >= snap, "balance decreased");
        _pay(b, id, msg.sender);
    }

    function joinTournament(uint256 id) external {
        TaskBase storage b = taskBase[id];
        require(b.active && b.taskType == 4, "invalid");
        require(block.timestamp < b.deadline, "expired");
        require(!hasClaimed[id][msg.sender], "joined");
        require(IERC20(b.targetToken).balanceOf(msg.sender) >= taskCond[id].minTokenAmount, "balance");
        hasClaimed[id][msg.sender] = true;
        participants[id].push(msg.sender);
    }

    // ── V5 核心新增：Agent 代替用户执行 ──────────────

    /**
     * @notice Agent 帮用户开始持仓计时（type=0）
     *   用户持仓满足条件后，Agent 扫链发现 → 帮用户打开计时
     *   不需要用户任何操作
     */
    function startHoldFor(uint256 id, address user) external onlyAgent {
        TaskBase storage b = taskBase[id];
        require(b.active && b.taskType == 0, "invalid");
        require(block.timestamp < b.deadline, "expired");
        require(holdStart[id][user] == 0, "started");
        require(!hasClaimed[id][user], "claimed");
        require(IERC20(b.targetToken).balanceOf(user) >= taskCond[id].minTokenAmount, "balance");
        holdStart[id][user] = block.timestamp;
        holdSnapshot[id][user] = IERC20(b.targetToken).balanceOf(user);
    }

    /**
     * @notice Agent 代替用户领取任意类型任务奖励（零操作）
     *   支持所有任务类型：type 0/1/2/3/4
     *   Agent 验证用户满足条件后调用，奖励直接发给 user
     *   用户无需签名，无需在线
     */
    function claimFor(uint256 id, address user) external onlyAgent {
        TaskBase storage b = taskBase[id];
        require(b.active, "inactive");
        require(block.timestamp < b.deadline, "expired");
        require(b.claimedCount < b.maxWinners, "full");
        require(!hasClaimed[id][user], "claimed");

        uint256 userBal = IERC20(b.targetToken).balanceOf(user);
        TaskCond storage c = taskCond[id];

        if (b.taskType == 0) {
            // 持仓：需要持仓时间已到
            uint256 hs = holdStart[id][user];
            require(hs > 0, "not started");
            require(block.timestamp >= hs + c.minHoldSeconds, "hold time");
            uint256 snap = holdSnapshot[id][user];
            require(userBal >= c.minTokenAmount, "balance");
            require(snap == 0 || userBal >= snap, "balance decreased");
        } else if (b.taskType == 1) {
            // 买入：检查持仓余额 >= minTokenAmount
            require(userBal >= c.minTokenAmount, "balance");
        } else if (b.taskType == 2) {
            // 早鸟：检查持仓余额 >= minTokenAmount
            uint256 snap = holdSnapshot[id][user];
            require(userBal >= c.minTokenAmount, "balance");
            require(snap == 0 || userBal >= snap, "balance decreased");
        } else if (b.taskType == 3) {
            // 推荐：Agent 链下验证后调用，合约只检查余额
            require(userBal >= c.minTokenAmount, "balance");
        } else if (b.taskType == 4) {
            // 锦标赛：Agent 结算时逐个发放
            require(hasClaimed[id][user] == false, "joined check");
            require(userBal >= c.minTokenAmount, "balance");
        }

        // 发奖给 user，奖励直接打入用户钱包
        hasClaimed[id][user] = true;
        b.claimedCount++;
        if (b.claimedCount == b.maxWinners) b.active = false;
        _send(b.rewardType, c.rewardToken, user, b.rewardPerWinner);
        emit ClaimedByAgent(id, user, msg.sender, b.rewardPerWinner);
    }

    /**
     * @notice Agent 批量代替多个用户领取（节省 Gas）
     *   一笔交易处理多个用户，适合持仓时间到期后批量结算
     */
    function claimForBatch(uint256 id, address[] calldata users) external onlyAgent {
        TaskBase storage b = taskBase[id];
        require(b.active, "inactive");
        TaskCond storage c = taskCond[id];
        for (uint256 i = 0; i < users.length; i++) {
            address user = users[i];
            if (hasClaimed[id][user]) continue;
            if (b.claimedCount >= b.maxWinners) break;
            uint256 userBal = IERC20(b.targetToken).balanceOf(user);
            if (userBal < c.minTokenAmount) continue;
            if (b.taskType == 0) {
                uint256 hs = holdStart[id][user];
                if (hs == 0) continue;
                if (block.timestamp < hs + c.minHoldSeconds) continue;
                uint256 snap = holdSnapshot[id][user];
                if (snap > 0 && userBal < snap) continue;
            }
            hasClaimed[id][user] = true;
            b.claimedCount++;
            if (b.claimedCount == b.maxWinners) b.active = false;
            _send(b.rewardType, c.rewardToken, user, b.rewardPerWinner);
            emit ClaimedByAgent(id, user, msg.sender, b.rewardPerWinner);
        }
    }

    // ── 锦标赛结算（onlyOwner，结束时手动触发）────────
    function settleTournament(uint256 id, address[] calldata winners) external onlyOwner {
        TaskBase storage b = taskBase[id];
        require(b.active && b.taskType == 4, "invalid");
        uint256 share = b.totalReward / winners.length;
        for (uint256 i = 0; i < winners.length; i++) {
            _send(b.rewardType, taskCond[id].rewardToken, winners[i], share);
        }
        b.active = false;
    }

    // ── 取消任务 ──────────────────────────────────────
    function cancelTask(uint256 id) external {
        TaskBase storage b = taskBase[id];
        require(b.active, "inactive");
        require(msg.sender == b.creator || msg.sender == owner, "denied");
        b.active = false;
        uint256 rem = b.totalReward - b.claimedCount * b.rewardPerWinner;
        if (rem > 0) _send(b.rewardType, taskCond[id].rewardToken, b.creator, rem);
        emit TaskCancelled(id);
    }

    // ── 读取 ──────────────────────────────────────────
    function getTask(uint256 id) external view returns (TaskBase memory, TaskCond memory) {
        return (taskBase[id], taskCond[id]);
    }

    function getParticipants(uint256 id) external view returns (address[] memory) {
        return participants[id];
    }

    receive() external payable {}
}
