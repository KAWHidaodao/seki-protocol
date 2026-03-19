// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * SekiRegistry.sol — Seki AI Agent Universal Protocol
 *
 * 三大功能：
 *   1. AI Agent 订阅服务市场
 *   2. 链上任务外包（通用 Bounty）
 *   3. DAO 提案自动执行
 *
 * 部署链：X Layer (chainId=196), BSC (chainId=56)
 */

interface IERC20 {
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

contract SekiRegistry {

    address public owner;
    address public agent; // 授权 Agent 执行地址
    uint256 public platformFeeBps = 500; // 5%

    // ─── 1. AI Agent 订阅服务 ─────────────────────────────────

    struct Service {
        uint256 id;
        address owner;
        address agentAddr;       // 执行该服务的 Agent 钱包
        uint256 pricePerCycle;   // 每周期价格（wei）
        uint256 cycleSecs;       // 周期秒数
        string  name;
        string  description;
        bool    active;
        uint256 subscriberCount;
    }

    struct Subscription {
        uint256 serviceId;
        address subscriber;
        uint256 paidUntil;
        uint256 cycles;
    }

    uint256 public nextServiceId;
    mapping(uint256 => Service) public services;
    mapping(bytes32 => Subscription) public subscriptions; // keccak256(serviceId, subscriber)
    mapping(uint256 => uint256) public serviceBalance; // 待提取余额

    event ServiceCreated(uint256 indexed id, address owner, string name, uint256 price);
    event Subscribed(uint256 indexed serviceId, address indexed subscriber, uint256 paidUntil);
    event ServicePayout(uint256 indexed serviceId, address owner, uint256 amount);

    function createService(
        address agentAddr,
        uint256 pricePerCycle,
        uint256 cycleSecs,
        string calldata name,
        string calldata description
    ) external returns (uint256 id) {
        require(pricePerCycle > 0, "price=0");
        require(cycleSecs >= 60, "cycle<60s");
        id = nextServiceId++;
        services[id] = Service({
            id: id,
            owner: msg.sender,
            agentAddr: agentAddr,
            pricePerCycle: pricePerCycle,
            cycleSecs: cycleSecs,
            name: name,
            description: description,
            active: true,
            subscriberCount: 0
        });
        emit ServiceCreated(id, msg.sender, name, pricePerCycle);
    }

    function subscribeService(uint256 serviceId, uint256 cycles) external payable {
        Service storage svc = services[serviceId];
        require(svc.active, "service inactive");
        require(cycles >= 1, "min 1 cycle");
        uint256 total = svc.pricePerCycle * cycles;
        require(msg.value >= total, "insufficient payment");

        bytes32 key = keccak256(abi.encodePacked(serviceId, msg.sender));
        Subscription storage sub = subscriptions[key];
        uint256 now_ = block.timestamp;
        if (sub.paidUntil < now_) sub.paidUntil = now_;
        sub.serviceId = serviceId;
        sub.subscriber = msg.sender;
        sub.paidUntil += svc.cycleSecs * cycles;
        sub.cycles += cycles;

        uint256 fee = total * platformFeeBps / 10000;
        serviceBalance[serviceId] += total - fee;
        svc.subscriberCount++;
        // 退还多余
        if (msg.value > total) { (bool _ok_,) = payable(msg.sender).call{value: msg.value - total}(""); require(_ok_,"tf"); }
        emit Subscribed(serviceId, msg.sender, sub.paidUntil);
    }

    function isSubscribed(uint256 serviceId, address user) external view returns (bool) {
        bytes32 key = keccak256(abi.encodePacked(serviceId, user));
        return subscriptions[key].paidUntil >= block.timestamp;
    }

    function withdrawServiceBalance(uint256 serviceId) external {
        Service storage svc = services[serviceId];
        require(svc.owner == msg.sender, "not owner");
        uint256 bal = serviceBalance[serviceId];
        require(bal > 0, "no balance");
        serviceBalance[serviceId] = 0;
        { (bool _ok_,) = payable(msg.sender).call{value: bal}(""); require(_ok_,"tf"); }
        emit ServicePayout(serviceId, msg.sender, bal);
    }

    // ─── 2. 链上任务外包（通用 Bounty）────────────────────────

    enum TaskStatus { Open, Submitted, Verified, Cancelled }

    struct BountyTask {
        uint256 id;
        address creator;
        string  title;
        string  description;
        string  verifyRule;      // AI 验收规则描述
        uint256 reward;          // 总奖励
        uint256 rewardPerWinner;
        uint256 maxWinners;
        uint256 claimedCount;
        uint256 deadline;
        TaskStatus status;
        bool    agentVerified;   // 是否需要 Agent 验收
    }

    struct WorkSubmission {
        uint256 taskId;
        address worker;
        string  proofUrl;        // 工作成果链接/hash
        bool    approved;
        uint256 submittedAt;
    }

    uint256 public nextTaskId;
    mapping(uint256 => BountyTask) public bountyTasks;
    mapping(uint256 => WorkSubmission[]) public submissions;
    mapping(uint256 => mapping(address => bool)) public hasSubmitted;
    mapping(uint256 => mapping(address => bool)) public hasClaimed;

    event BountyCreated(uint256 indexed id, address creator, string title, uint256 reward);
    event WorkSubmitted(uint256 indexed taskId, address indexed worker, string proofUrl);
    event WorkApproved(uint256 indexed taskId, address indexed worker, uint256 reward);
    event BountyCancelled(uint256 indexed id);

    function createBountyTask(
        string calldata title,
        string calldata description,
        string calldata verifyRule,
        uint256 rewardPerWinner,
        uint256 maxWinners,
        uint256 deadlineSecs,
        bool agentVerified
    ) external payable returns (uint256 id) {
        require(rewardPerWinner > 0, "reward=0");
        require(maxWinners >= 1 && maxWinners <= 100, "winners 1-100");
        require(deadlineSecs >= 300, "min 5min");
        uint256 total = rewardPerWinner * maxWinners;
        uint256 fee = total * platformFeeBps / 10000;
        require(msg.value >= total + fee, "insufficient funds");

        id = nextTaskId++;
        bountyTasks[id] = BountyTask({
            id: id,
            creator: msg.sender,
            title: title,
            description: description,
            verifyRule: verifyRule,
            reward: total,
            rewardPerWinner: rewardPerWinner,
            maxWinners: maxWinners,
            claimedCount: 0,
            deadline: block.timestamp + deadlineSecs,
            status: TaskStatus.Open,
            agentVerified: agentVerified
        });

        if (msg.value > total + fee) { (bool _ok_,) = payable(msg.sender).call{value: msg.value - total - fee}(""); require(_ok_,"tf"); }
        emit BountyCreated(id, msg.sender, title, total);
    }

    function submitWork(uint256 taskId, string calldata proofUrl) external {
        BountyTask storage t = bountyTasks[taskId];
        require(t.status == TaskStatus.Open, "not open");
        require(block.timestamp <= t.deadline, "expired");
        require(!hasSubmitted[taskId][msg.sender], "already submitted");
        require(t.claimedCount < t.maxWinners, "full");

        hasSubmitted[taskId][msg.sender] = true;
        submissions[taskId].push(WorkSubmission({
            taskId: taskId,
            worker: msg.sender,
            proofUrl: proofUrl,
            approved: !t.agentVerified, // 不需要 Agent 验收则自动通过
            submittedAt: block.timestamp
        }));

        emit WorkSubmitted(taskId, msg.sender, proofUrl);

        // 不需要 Agent 验收：立即发奖
        if (!t.agentVerified) {
            _payWorker(taskId, msg.sender);
        }
    }

    // Agent 验收并发奖
    function agentApprove(uint256 taskId, address worker) external {
        require(msg.sender == agent || msg.sender == owner, "not agent");
        BountyTask storage t = bountyTasks[taskId];
        require(t.status == TaskStatus.Open, "not open");
        require(t.agentVerified, "no agent verify needed");
        require(hasSubmitted[taskId][worker], "not submitted");
        require(!hasClaimed[taskId][worker], "already claimed");

        // 找到提交记录
        WorkSubmission[] storage subs = submissions[taskId];
        for (uint i = 0; i < subs.length; i++) {
            if (subs[i].worker == worker) {
                subs[i].approved = true;
                break;
            }
        }
        _payWorker(taskId, worker);
        emit WorkApproved(taskId, worker, t.rewardPerWinner);
    }

    function _payWorker(uint256 taskId, address worker) internal {
        BountyTask storage t = bountyTasks[taskId];
        if (hasClaimed[taskId][worker]) return;
        if (t.claimedCount >= t.maxWinners) return;
        hasClaimed[taskId][worker] = true;
        t.claimedCount++;
        if (t.claimedCount >= t.maxWinners) t.status = TaskStatus.Verified;
        { (bool _ok_,) = payable(worker).call{value: t.rewardPerWinner}(""); require(_ok_,"tf"); }
    }

    function cancelBountyTask(uint256 taskId) external {
        BountyTask storage t = bountyTasks[taskId];
        require(t.creator == msg.sender || msg.sender == owner, "not creator");
        require(t.status == TaskStatus.Open, "not open");
        t.status = TaskStatus.Cancelled;
        uint256 remaining = t.rewardPerWinner * (t.maxWinners - t.claimedCount);
        if (remaining > 0) { (bool _ok_,) = payable(t.creator).call{value: remaining}(""); require(_ok_,"tf"); }
        emit BountyCancelled(taskId);
    }

    function getSubmissions(uint256 taskId) external view returns (WorkSubmission[] memory) {
        return submissions[taskId];
    }

    // ─── 3. DAO 提案自动执行 ──────────────────────────────────

    struct DAOProposal {
        uint256 id;
        address proposer;
        string  description;
        address callTarget;     // 要调用的合约地址
        bytes   callData;       // 调用数据
        uint256 value;          // 附带 ETH/OKB
        uint256 votesFor;
        uint256 votesAgainst;
        uint256 deadline;
        bool    executed;
        bool    cancelled;
    }

    uint256 public nextProposalId;
    uint256 public minVotesRequired = 1; // 可由 owner 调整
    mapping(uint256 => DAOProposal) public proposals;
    mapping(uint256 => mapping(address => bool)) public hasVoted;
    mapping(address => uint256) public votingPower; // owner 可设置

    event ProposalCreated(uint256 indexed id, address proposer, string description);
    event Voted(uint256 indexed id, address voter, bool support, uint256 power);
    event ProposalExecuted(uint256 indexed id, bool success);
    event ProposalCancelled(uint256 indexed id);

    function createProposal(
        string calldata description,
        address callTarget,
        bytes calldata callData,
        uint256 deadlineSecs
    ) external payable returns (uint256 id) {
        require(deadlineSecs >= 60, "min 1min");
        id = nextProposalId++;
        proposals[id] = DAOProposal({
            id: id,
            proposer: msg.sender,
            description: description,
            callTarget: callTarget,
            callData: callData,
            value: msg.value,
            votesFor: 0,
            votesAgainst: 0,
            deadline: block.timestamp + deadlineSecs,
            executed: false,
            cancelled: false
        });
        emit ProposalCreated(id, msg.sender, description);
    }

    function vote(uint256 proposalId, bool support) external {
        DAOProposal storage p = proposals[proposalId];
        require(!p.executed && !p.cancelled, "closed");
        require(block.timestamp <= p.deadline, "expired");
        require(!hasVoted[proposalId][msg.sender], "already voted");
        hasVoted[proposalId][msg.sender] = true;
        uint256 power = votingPower[msg.sender] > 0 ? votingPower[msg.sender] : 1;
        if (support) p.votesFor += power;
        else p.votesAgainst += power;
        emit Voted(proposalId, msg.sender, support, power);
    }

    // Agent 或任何人在投票通过后执行提案
    function executeProposal(uint256 proposalId) external {
        DAOProposal storage p = proposals[proposalId];
        require(!p.executed && !p.cancelled, "closed");
        require(block.timestamp > p.deadline, "voting ongoing");
        require(p.votesFor >= minVotesRequired, "not enough votes");
        require(p.votesFor > p.votesAgainst, "votes against");
        p.executed = true;
        (bool ok, ) = p.callTarget.call{value: p.value}(p.callData);
        emit ProposalExecuted(proposalId, ok);
    }

    function cancelProposal(uint256 proposalId) external {
        DAOProposal storage p = proposals[proposalId];
        require(p.proposer == msg.sender || msg.sender == owner, "not proposer");
        require(!p.executed, "already executed");
        p.cancelled = true;
        if (p.value > 0) { (bool _ok_,) = payable(p.proposer).call{value: p.value}(""); require(_ok_,"tf"); }
        emit ProposalCancelled(proposalId);
    }

    // ─── 管理接口 ─────────────────────────────────────────────

    constructor() {
        owner = msg.sender;
        agent = msg.sender;
    }

    function setAgent(address _agent) external {
        require(msg.sender == owner, "not owner");
        agent = _agent;
    }

    function setPlatformFee(uint256 bps) external {
        require(msg.sender == owner, "not owner");
        require(bps <= 1000, "max 10%");
        platformFeeBps = bps;
    }

    function setMinVotes(uint256 n) external {
        require(msg.sender == owner, "not owner");
        minVotesRequired = n;
    }

    function setVotingPower(address user, uint256 power) external {
        require(msg.sender == owner, "not owner");
        votingPower[user] = power;
    }

    function withdrawFees() external {
        require(msg.sender == owner, "not owner");
        payable(owner).transfer(address(this).balance);
    }

    receive() external payable {}
}
