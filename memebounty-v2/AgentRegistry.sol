// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

// ─────────────────────────────────────────────────────────────
//  IMemeBounty — MemeBountyV5 接口（含 minReferrals）
// ─────────────────────────────────────────────────────────────
interface IMemeBounty {
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
        uint256 minReferrals;   // V5 新增
    }
    function createTaskFromRegistry(RegistryTaskParams calldata p) external payable returns (uint256 taskId);
}

// ─────────────────────────────────────────────────────────────
//  IACPHook — ERC-8183 标准 Hook 接口
// ─────────────────────────────────────────────────────────────
interface IACPHook {
    function beforeAction(uint256 jobId, bytes4 selector, bytes calldata data) external;
    function afterAction(uint256 jobId, bytes4 selector, bytes calldata data) external;
}

// ─────────────────────────────────────────────────────────────
//  AgentReportHook — MemeBounty 平台专用 Hook
//
//  功能：
//    submit beforeAction  → 验证 deliverable 合法（非零）
//    complete afterAction → 把 deliverable hash 写入链上记录，
//                           供前端 / indexer 查询 Agent 工作历史
// ─────────────────────────────────────────────────────────────
contract AgentReportHook is IACPHook {

    address public registry;   // 只允许 AgentRegistry 调用
    address public owner;

    struct Report {
        bytes32 deliverable;   // Agent 提交的工作 hash
        bytes32 reason;        // 评估方附言 hash
        uint256 completedAt;   // 完成时间
        address provider;      // Agent 钱包
        address client;        // 委托方
    }

    // jobId => Report
    mapping(uint256 => Report) public reports;
    uint256[] public completedJobs;

    event ReportRecorded(uint256 indexed jobId, address indexed provider, bytes32 deliverable, uint256 completedAt);

    // submit() 和 complete() 的函数选择器
    bytes4 public constant SUBMIT_SELECTOR   = bytes4(keccak256("submit(uint256,bytes32)"));
    bytes4 public constant COMPLETE_SELECTOR = bytes4(keccak256("complete(uint256,bytes32)"));

    constructor(address _registry) {
        registry = _registry;
        owner    = msg.sender;
    }

    modifier onlyRegistry() {
        require(msg.sender == registry, "!registry");
        _;
    }
    modifier onlyOwner() { require(msg.sender == owner, "!owner"); _; }

    function setRegistry(address r) external onlyOwner { registry = r; }
    function transferOwner(address o) external onlyOwner { owner = o; }

    // ── IACPHook 实现 ─────────────────────────────────

    function beforeAction(
        uint256 /*jobId*/,
        bytes4  selector,
        bytes calldata data
    ) external view onlyRegistry {
        if (selector == SUBMIT_SELECTOR) {
            // 解码 submit 的 data: abi.encode(provider, deliverable, optParams)
            (, bytes32 deliverable,) = abi.decode(data, (address, bytes32, bytes));
            require(deliverable != bytes32(0), "hook: empty deliverable");
        }
        // 其他 selector 不拦截
    }

    function afterAction(
        uint256 jobId,
        bytes4  selector,
        bytes calldata data
    ) external onlyRegistry {
        if (selector == COMPLETE_SELECTOR) {
            // 解码 complete 的 data: abi.encode(evaluator, reason, optParams)
            (, bytes32 reason,) = abi.decode(data, (address, bytes32, bytes));

            // 从 submit 记录里取 deliverable（由 registry 传入 data 或我们缓存）
            // 这里用简化方案：complete data 里我们额外 encode 了 deliverable
            // 见 AgentRegistry 里 complete 的 hook data 构造
            bytes32 deliverable = reports[jobId].deliverable;

            reports[jobId].reason      = reason;
            reports[jobId].completedAt = block.timestamp;

            completedJobs.push(jobId);
            emit ReportRecorded(jobId, reports[jobId].provider, deliverable, block.timestamp);
        }
    }

    // Registry 在 submit afterAction 时缓存 deliverable + provider
    function cacheSubmit(uint256 jobId, bytes32 deliverable, address provider, address client) external onlyRegistry {
        reports[jobId] = Report({
            deliverable: deliverable,
            reason:      bytes32(0),
            completedAt: 0,
            provider:    provider,
            client:      client
        });
    }

    // ── 查询 ──────────────────────────────────────────
    function getReport(uint256 jobId) external view returns (Report memory) {
        return reports[jobId];
    }

    function getCompletedCount() external view returns (uint256) {
        return completedJobs.length;
    }

    function getCompletedJobs() external view returns (uint256[] memory) {
        return completedJobs;
    }
}

// ─────────────────────────────────────────────────────────────
//  AgentRegistry — ERC-8183 核心合约（带 Hook 支持）
// ─────────────────────────────────────────────────────────────
contract AgentRegistry {

    uint256 public constant PLATFORM_FEE_BPS = 500; // 5%

    address public owner;
    address public agentWallet;
    address public treasury;

    // Hook 白名单（address(0) 始终允许 = 无 hook）
    mapping(address => bool) public whitelistedHooks;

    // ── 税收池 ────────────────────────────────────────
    // four.meme 税收直接打入合约，累积到 taxPool
    // Agent 调 createTaskFromTax() 消耗税收池发任务
    uint256 public taxPool;

    enum Status { Open, Funded, Submitted, Completed, Rejected, Expired }

    struct Job {
        address  client;
        address  provider;
        address  evaluator;
        string   description;
        uint256  budget;
        uint256  expiredAt;
        Status   status;
        address  hook;        // address(0) = no hook
        bytes32  deliverable;
        bytes32  reason;
    }

    uint256 public nextJobId;
    mapping(uint256 => Job) public jobs;

    // ── 事件 ──────────────────────────────────────────
    event JobCreated(uint256 indexed jobId, address indexed client, address provider, address evaluator, uint256 expiredAt, address hook);
    event ProviderSet(uint256 indexed jobId, address provider);
    event BudgetSet(uint256 indexed jobId, uint256 amount);
    event JobFunded(uint256 indexed jobId, address indexed client, uint256 amount);
    event JobSubmitted(uint256 indexed jobId, address indexed provider, bytes32 deliverable);
    event JobCompleted(uint256 indexed jobId, address indexed evaluator, bytes32 reason);
    event JobRejected(uint256 indexed jobId, address indexed rejector, bytes32 reason);
    event JobExpired(uint256 indexed jobId);
    event PaymentReleased(uint256 indexed jobId, address indexed provider, uint256 amount);
    event Refunded(uint256 indexed jobId, address indexed client, uint256 amount);
    event HookWhitelisted(address indexed hook, bool status);
    event TaskCreatedFromJob(uint256 indexed jobId, uint256 indexed taskId, address bountyContract, uint256 spent);
    event TaxDeposited(address indexed sender, uint256 amount, uint256 taxPoolTotal);
    event TaxTaskCreated(uint256 indexed taskId, address bountyContract, uint256 spent, uint256 taxPoolRemaining);

    constructor(address _agent, address _treasury) {
        owner       = msg.sender;
        agentWallet = _agent;
        treasury    = _treasury;
        whitelistedHooks[address(0)] = true; // 无 hook 始终合法
    }

    modifier onlyOwner() { require(msg.sender == owner, "!owner"); _; }

    function setAgentWallet(address a)             external onlyOwner { agentWallet = a; }
    function setTreasury(address t)                external onlyOwner { treasury = t; }
    function transferOwner(address o)              external onlyOwner { owner = o; }
    function setHookWhitelist(address h, bool ok)  external onlyOwner {
        require(h != address(0), "zero");
        whitelistedHooks[h] = ok;
        emit HookWhitelisted(h, ok);
    }

    // ── Hook 工具 ─────────────────────────────────────
    function _before(address hook, uint256 id, bytes4 sel, bytes memory data) internal {
        if (hook != address(0)) IACPHook(hook).beforeAction(id, sel, data);
    }
    function _after(address hook, uint256 id, bytes4 sel, bytes memory data) internal {
        if (hook != address(0)) IACPHook(hook).afterAction(id, sel, data);
    }

    // ── ERC-8183: createJob ───────────────────────────
    function createJob(
        address  provider,
        address  evaluator,
        uint256  expiredAt,
        string calldata description,
        address  hook
    ) external returns (uint256 jobId) {
        require(evaluator != address(0),        "zero evaluator");
        require(expiredAt > block.timestamp,    "bad expiry");
        require(whitelistedHooks[hook],         "hook not allowed");

        address prov = provider != address(0) ? provider : agentWallet;

        jobId = nextJobId++;
        jobs[jobId] = Job({
            client:      msg.sender,
            provider:    prov,
            evaluator:   evaluator,
            description: description,
            budget:      0,
            expiredAt:   expiredAt,
            status:      Status.Open,
            hook:        hook,
            deliverable: bytes32(0),
            reason:      bytes32(0)
        });

        emit JobCreated(jobId, msg.sender, prov, evaluator, expiredAt, hook);
        // createJob 本身不调 hook（规范中 createJob 不在 hookable 列表）
    }

    // ── 便捷函数：一步创建+设预算+锁资金 ──────────────────
    function createJobAndFund(
        address  provider,
        address  evaluator,
        uint256  expiredAt,
        string calldata description,
        address  hook
    ) external payable returns (uint256 jobId) {
        require(msg.value > 0,                  "zero value");
        require(evaluator != address(0),        "zero evaluator");
        require(expiredAt > block.timestamp,    "bad expiry");
        require(whitelistedHooks[hook],         "hook not allowed");

        address prov = provider != address(0) ? provider : agentWallet;

        jobId = nextJobId++;
        jobs[jobId] = Job({
            client:      msg.sender,
            provider:    prov,
            evaluator:   evaluator,
            description: description,
            budget:      msg.value,
            expiredAt:   expiredAt,
            status:      Status.Funded,
            hook:        hook,
            deliverable: bytes32(0),
            reason:      bytes32(0)
        });

        emit JobCreated(jobId, msg.sender, prov, evaluator, expiredAt, hook);
        emit JobFunded(jobId, msg.sender, msg.value);
    }

    // ── ERC-8183: setProvider ─────────────────────────
    function setProvider(uint256 jobId, address provider) external {
        Job storage j = jobs[jobId];
        require(j.status == Status.Open,       "!open");
        require(msg.sender == j.client,         "!client");
        require(j.provider == address(0),       "provider set");
        require(provider != address(0),         "zero");

        bytes memory data = abi.encode(provider, bytes(""));
        _before(j.hook, jobId, msg.sig, data);
        j.provider = provider;
        emit ProviderSet(jobId, provider);
        _after(j.hook, jobId, msg.sig, data);
    }

    // ── ERC-8183: setBudget ───────────────────────────
    function setBudget(uint256 jobId, uint256 amount, bytes calldata optParams) external {
        Job storage j = jobs[jobId];
        require(j.status == Status.Open,                              "!open");
        require(msg.sender == j.client || msg.sender == j.provider,  "denied");
        require(amount > 0,                                           "zero");

        bytes memory data = abi.encode(amount, optParams);
        _before(j.hook, jobId, msg.sig, data);
        j.budget = amount;
        emit BudgetSet(jobId, amount);
        _after(j.hook, jobId, msg.sig, data);
    }

    // ── ERC-8183: fund ────────────────────────────────
    function fund(uint256 jobId, uint256 expectedBudget, bytes calldata optParams) external payable {
        Job storage j = jobs[jobId];
        require(j.status == Status.Open,          "!open");
        require(msg.sender == j.client,            "!client");
        require(j.budget > 0,                      "no budget");
        require(j.provider != address(0),          "no provider");
        require(j.budget == expectedBudget,        "mismatch");
        require(msg.value >= j.budget,             "low BNB");

        bytes memory data = abi.encode(optParams);
        _before(j.hook, jobId, msg.sig, data);

        j.status = Status.Funded;
        if (msg.value > j.budget) _bnb(msg.sender, msg.value - j.budget);

        emit JobFunded(jobId, msg.sender, j.budget);
        _after(j.hook, jobId, msg.sig, data);
    }

    // ── ERC-8183: submit ──────────────────────────────
    function submit(uint256 jobId, bytes32 deliverable, bytes calldata optParams) external {
        Job storage j = jobs[jobId];
        require(j.status == Status.Funded,    "!funded");
        require(msg.sender == j.provider,      "!provider");
        require(block.timestamp < j.expiredAt, "expired");
        require(deliverable != bytes32(0),     "empty");

        bytes memory data = abi.encode(msg.sender, deliverable, optParams);
        _before(j.hook, jobId, msg.sig, data);  // hook 可验证 deliverable

        j.status      = Status.Submitted;
        j.deliverable = deliverable;

        emit JobSubmitted(jobId, msg.sender, deliverable);

        // afterAction：若 hook 是 AgentReportHook，缓存 deliverable
        if (j.hook != address(0)) {
            try AgentReportHook(j.hook).cacheSubmit(jobId, deliverable, j.provider, j.client) {} catch {}
        }
        _after(j.hook, jobId, msg.sig, data);
    }

    // ── ERC-8183: complete ────────────────────────────
    function complete(uint256 jobId, bytes32 reason, bytes calldata optParams) external {
        Job storage j = jobs[jobId];
        require(j.status == Status.Submitted, "!submitted");
        require(msg.sender == j.evaluator,     "!evaluator");

        bytes memory data = abi.encode(msg.sender, reason, optParams);
        _before(j.hook, jobId, msg.sig, data);

        j.status = Status.Completed;
        j.reason = reason;

        uint256 fee     = j.budget * PLATFORM_FEE_BPS / 10000;
        uint256 payment = j.budget - fee;
        j.budget = 0;

        if (fee > 0 && treasury != address(0)) _bnb(treasury, fee);
        _bnb(j.provider, payment);

        emit JobCompleted(jobId, msg.sender, reason);
        emit PaymentReleased(jobId, j.provider, payment);

        _after(j.hook, jobId, msg.sig, data);  // hook 写链上报告记录
    }

    // ── ERC-8183: reject ──────────────────────────────
    function reject(uint256 jobId, bytes32 reason, bytes calldata optParams) external {
        Job storage j = jobs[jobId];

        bytes memory data = abi.encode(msg.sender, reason, optParams);

        if (j.status == Status.Open) {
            require(msg.sender == j.client, "!client");
            _before(j.hook, jobId, msg.sig, data);
            j.status = Status.Rejected;
            j.reason = reason;
            emit JobRejected(jobId, msg.sender, reason);
            _after(j.hook, jobId, msg.sig, data);

        } else if (j.status == Status.Funded || j.status == Status.Submitted) {
            require(msg.sender == j.evaluator, "!evaluator");
            _before(j.hook, jobId, msg.sig, data);
            uint256 refund = j.budget;
            j.status = Status.Rejected;
            j.reason = reason;
            j.budget = 0;
            _bnb(j.client, refund);
            emit JobRejected(jobId, msg.sender, reason);
            emit Refunded(jobId, j.client, refund);
            _after(j.hook, jobId, msg.sig, data);

        } else {
            revert("!open/funded/submitted");
        }
    }

    // ── ERC-8183: claimRefund（不可 hook，规范强制）────
    function claimRefund(uint256 jobId) external {
        Job storage j = jobs[jobId];
        require(j.status == Status.Funded || j.status == Status.Submitted, "!active");
        require(block.timestamp >= j.expiredAt, "!expired");

        uint256 refund = j.budget;
        j.status = Status.Expired;
        j.budget = 0;

        _bnb(j.client, refund);
        emit JobExpired(jobId);
        emit Refunded(jobId, j.client, refund);
    }

    // ── 方案B：Agent代发任务，资金从Job Budget划拨 ────
    // 资金流：job.budget → createTaskFromRegistry() → 任务奖池
    // Agent钱包只出 Gas
    struct TaskPayParams {
        address targetToken;
        uint8   taskType;
        uint256 maxWinners;
        uint256 rewardPerWinner;
        uint256 deadlineTs;
        uint256 minTokenAmount;
        uint256 minHoldSeconds;
        uint256 minBuyBNB;
        address bountyContract;
    }

    function createTaskAndPay(
        uint256 jobId,
        TaskPayParams calldata tp
    ) external returns (uint256 taskId) {
        require(msg.sender == agentWallet, "only agent");
        Job storage j = jobs[jobId];
        require(j.status == Status.Funded, "!funded");
        require(block.timestamp < j.expiredAt, "expired");
        uint256 total    = tp.maxWinners * tp.rewardPerWinner;
        uint256 required = total + total * 300 / 10000;
        require(j.budget >= required, "budget low");
        j.budget -= required;
        IMemeBounty.RegistryTaskParams memory p;
        p.creator         = j.client;
        p.targetToken     = tp.targetToken;
        p.taskType        = tp.taskType;
        p.maxWinners      = tp.maxWinners;
        p.rewardPerWinner = tp.rewardPerWinner;
        p.deadline        = tp.deadlineTs;
        p.minTokenAmount  = tp.minTokenAmount;
        p.minHoldSeconds  = tp.minHoldSeconds;
        p.minBuyBNB       = tp.minBuyBNB;
        taskId = IMemeBounty(tp.bountyContract).createTaskFromRegistry{value: required}(p);
        emit TaskCreatedFromJob(jobId, taskId, tp.bountyContract, required);
    }

    // ── 税收池发任务（主要路径）─────────────────────────
    // Agent 用税收池里的资金发任务，无需关联具体 jobId
    // 资金安全：私钥泄露只损失 Gas，税收资金全在合约里
    function createTaskFromTax(
        TaskPayParams calldata tp
    ) external returns (uint256 taskId) {
        require(msg.sender == agentWallet, "only agent");
        uint256 total    = tp.maxWinners * tp.rewardPerWinner;
        uint256 required = total + total * 300 / 10000; // 含3%平台费
        require(taxPool >= required, "tax pool low");
        taxPool -= required;
        IMemeBounty.RegistryTaskParams memory p;
        p.creator         = address(this); // 合约作为任务创建者
        p.targetToken     = tp.targetToken;
        p.taskType        = tp.taskType;
        p.maxWinners      = tp.maxWinners;
        p.rewardPerWinner = tp.rewardPerWinner;
        p.deadline        = tp.deadlineTs;
        p.minTokenAmount  = tp.minTokenAmount;
        p.minHoldSeconds  = tp.minHoldSeconds;
        p.minBuyBNB       = tp.minBuyBNB;
        taskId = IMemeBounty(tp.bountyContract).createTaskFromRegistry{value: required}(p);
        emit TaxTaskCreated(taskId, tp.bountyContract, required, taxPool);
    }

    // ── 税收池提取（Owner 紧急用）────────────────────
    function withdrawTaxPool(uint256 amount, address to) external onlyOwner {
        require(amount <= taxPool, "exceeds pool");
        require(to != address(0), "zero");
        taxPool -= amount;
        _bnb(to, amount);
    }

    // ── 查询 ──────────────────────────────────────────
    function getJob(uint256 jobId) external view returns (Job memory) {
        return jobs[jobId];
    }
    function getJobStatus(uint256 jobId) external view returns (Status) {
        return jobs[jobId].status;
    }
    function getJobBudgetRemaining(uint256 jobId) external view returns (uint256) {
        return jobs[jobId].budget;
    }

    function _bnb(address to, uint256 amt) internal {
        (bool ok,) = to.call{value: amt}("");
        require(ok, "bnb fail");
    }

    // receive() 接收 four.meme 税收 → 自动进 taxPool
    receive() external payable {
        if (msg.value > 0) {
            taxPool += msg.value;
            emit TaxDeposited(msg.sender, msg.value, taxPool);
        }
    }
}
