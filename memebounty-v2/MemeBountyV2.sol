// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

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

contract MemeBountyV2 {

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
    }

    // 方案B入参 struct，避免 stack-too-deep
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
    }

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
    mapping(uint256 => mapping(address => uint256)) public holdSnapshot; // 开始持仓时的余额快照
    mapping(uint256 => mapping(address => bool))    public hasClaimed;
    mapping(uint256 => address[]) public participants;

    event TaskCreated(uint256 indexed id, address indexed creator, address indexed targetToken, uint8 taskType, uint256 deadline);
    event TaskCancelled(uint256 indexed id);
    event Claimed(uint256 indexed id, address indexed user, uint256 amount);

    modifier onlyOwner() { require(msg.sender == owner, "owner"); _; }

    constructor(address _fee) { owner = msg.sender; feeReceiver = _fee; }

    function setOfficialToken(address t)  external onlyOwner { officialToken = t; }
    function setFeeReceiver(address r)    external onlyOwner { feeReceiver = r; }
    function setAgentWallet(address a)    external onlyOwner { agentWallet = a; }
    function setAgentRegistry(address r)  external onlyOwner { agentRegistry = r; }
    function setMinHoldAmount(uint256 n)  external onlyOwner { minHoldAmount = n; }
    function transferOwner(address o)     external onlyOwner { owner = o; }

    function _eligible(address u) internal view {
        if (u == agentWallet) return;
        if (agentRegistry != address(0) && u == agentRegistry) return;
        if (officialToken == address(0)) return;
        if (minHoldAmount == 0) return;
        require(IERC20(officialToken).balanceOf(u) >= minHoldAmount, "need MBT");
    }

    function _pairPrice(address pair, address tokenIn) internal view returns (uint256) {
        try IPair(pair).getReserves() returns (uint112 r0, uint112 r1, uint32) {
            address t0 = IPair(pair).token0();
            (uint256 rIn, uint256 rOut) = t0 == tokenIn ? (uint256(r0), uint256(r1)) : (uint256(r1), uint256(r0));
            if (rIn == 0) return 0;
            return rOut * 1e18 / rIn;
        } catch { return 0; }
    }

    // 对外接口保持原有签名（兼容前端 ABI），内部转 struct
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
        uint256 minBuyBNB
    ) external payable returns (uint256 id) {
        _eligible(msg.sender);
        id = _createTaskInner(
            msg.sender, targetToken, taskType, rewardType, rewardToken,
            maxWinners, rewardPerWinner, deadline,
            minTokenAmount, minHoldSeconds, minBuyBNB
        );
    }

    function _createTaskInner(
        address creator,
        address targetToken,
        uint8   taskType,
        uint8   rewardType,
        address rewardToken,
        uint256 maxWinners,
        uint256 rewardPerWinner,
        uint256 deadline,
        uint256 minTokenAmount,
        uint256 minHoldSeconds,
        uint256 minBuyBNB
    ) internal returns (uint256 id) {
        _validateTask(taskType, maxWinners, rewardPerWinner, deadline, minHoldSeconds);
        uint256 total = maxWinners * rewardPerWinner;
        uint256 fee   = total * FEE_BPS / 10000;
        _collect(rewardType, rewardToken, total, fee);
        _StoreArgs memory a;
        a.creator         = creator;
        a.targetToken     = targetToken;
        a.taskType        = taskType;
        a.rewardType      = rewardType;
        a.rewardToken     = rewardToken;
        a.maxWinners      = maxWinners;
        a.rewardPerWinner = rewardPerWinner;
        a.total           = total;
        a.deadline        = deadline;
        a.minTokenAmount  = minTokenAmount;
        a.minHoldSeconds  = minHoldSeconds;
        a.minBuyBNB       = minBuyBNB;
        id = _storeTask(a);
    }

    // 方案B：AgentRegistry 代发任务，资金从 job.budget 划拨
    function createTaskFromRegistry(RegistryTaskParams calldata p) external payable returns (uint256 id) {
        require(msg.sender == agentRegistry, "only registry");
        uint256 total = p.maxWinners * p.rewardPerWinner;
        uint256 fee   = total * FEE_BPS / 10000;
        require(msg.value >= total + fee, "value");
        address feeDest = agentWallet != address(0) ? agentWallet : feeReceiver;
        if (fee > 0) _bnb(feeDest, fee);
        // 直接存储，不走 _collect（资金已随 msg.value 传入）
        _validateTask(p.taskType, p.maxWinners, p.rewardPerWinner, p.deadline, p.minHoldSeconds);
        _StoreArgs memory a;
        a.creator         = p.creator;
        a.targetToken     = p.targetToken;
        a.taskType        = p.taskType;
        a.rewardType      = 0;
        a.rewardToken     = address(0);
        a.maxWinners      = p.maxWinners;
        a.rewardPerWinner = p.rewardPerWinner;
        a.total           = total;
        a.deadline        = p.deadline;
        a.minTokenAmount  = p.minTokenAmount;
        a.minHoldSeconds  = p.minHoldSeconds;
        a.minBuyBNB       = p.minBuyBNB;
        id = _storeTask(a);
    }

    function _validateTask(uint8 taskType, uint256 maxWinners, uint256 rewardPerWinner, uint256 deadline, uint256 minHoldSeconds) internal view {
        require(maxWinners > 0 && rewardPerWinner > 0, "params");
        require(deadline > block.timestamp, "deadline");
        if (taskType == 0) {
            require(minHoldSeconds >= 120 && minHoldSeconds <= 3600, "holdTime 2m-1h");
        }
    }

    struct _StoreArgs {
        address creator; address targetToken;
        uint8 taskType; uint8 rewardType; address rewardToken;
        uint256 maxWinners; uint256 rewardPerWinner; uint256 total; uint256 deadline;
        uint256 minTokenAmount; uint256 minHoldSeconds; uint256 minBuyBNB;
    }
    function _storeTask(_StoreArgs memory a) internal returns (uint256 id) {
        id = nextTaskId++;
        taskBase[id] = TaskBase(a.creator, a.targetToken, a.maxWinners, a.rewardPerWinner,
                                a.total, 0, a.deadline, a.taskType, a.rewardType, true);
        taskCond[id] = TaskCond(a.rewardToken, a.minTokenAmount, a.minHoldSeconds, a.minBuyBNB);
        emit TaskCreated(id, a.creator, a.targetToken, a.taskType, a.deadline);
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

    function startHold(uint256 id) external {
        TaskBase storage b = taskBase[id];
        require(b.active && b.taskType == 0, "invalid");
        require(block.timestamp < b.deadline, "expired");
        require(holdStart[id][msg.sender] == 0, "started");
        require(!hasClaimed[id][msg.sender], "claimed");
        require(IERC20(b.targetToken).balanceOf(msg.sender) >= taskCond[id].minTokenAmount, "balance");
        holdStart[id][msg.sender] = block.timestamp;
        holdSnapshot[id][msg.sender] = IERC20(b.targetToken).balanceOf(msg.sender); // 记录快照
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
        require(snap == 0 || cur >= snap, "balance decreased"); // 不能减仓
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
        require(snap == 0 || cur >= snap, "balance decreased"); // 不能减仓
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

    function settleTournament(uint256 id, address[] calldata winners) external onlyOwner {
        TaskBase storage b = taskBase[id];
        require(b.active && b.taskType == 4, "invalid");
        uint256 share = b.totalReward / winners.length;
        for (uint256 i = 0; i < winners.length; i++) {
            _send(b.rewardType, taskCond[id].rewardToken, winners[i], share);
        }
        b.active = false;
    }

    function cancelTask(uint256 id) external {
        TaskBase storage b = taskBase[id];
        require(b.active, "inactive");
        require(msg.sender == b.creator || msg.sender == owner, "denied");
        b.active = false;
        uint256 rem = b.totalReward - b.claimedCount * b.rewardPerWinner;
        if (rem > 0) _send(b.rewardType, taskCond[id].rewardToken, b.creator, rem);
        emit TaskCancelled(id);
    }

    function _pay(TaskBase storage b, uint256 id, address user) internal {
        require(b.claimedCount < b.maxWinners, "full");
        hasClaimed[id][user] = true;
        b.claimedCount++;
        if (b.claimedCount == b.maxWinners) b.active = false;
        _send(b.rewardType, taskCond[id].rewardToken, user, b.rewardPerWinner);
        emit Claimed(id, user, b.rewardPerWinner);
    }

    function _send(uint8 rt, address rewardToken, address to, uint256 amt) internal {
        if (rt == 0) _bnb(to, amt);
        else if (rt == 1) IERC20(USDT).transfer(to, amt);
        else IERC20(rewardToken).transfer(to, amt);
    }

    function _bnb(address to, uint256 amt) internal {
        (bool ok,) = to.call{value: amt}("");
        require(ok, "bnb fail");
    }

    function getTask(uint256 id) external view returns (TaskBase memory, TaskCond memory) {
        return (taskBase[id], taskCond[id]);
    }


    function getParticipants(uint256 id) external view returns (address[] memory) {
        return participants[id];
    }

    receive() external payable {}
}
