# BSC Contracts — ABIs & Deployment

## MemeBountyV5
- **Address**: `0xe2D7f97A6C63ADcAf14Fe70B8bdAD022349A9655`
- **Source**: `MemeBountyV5.sol` (BSC, Solidity ^0.8.20, no optimizer)

### Key ABI
```json
[
  "function createTask(address token, uint8 taskType, uint256 rewardPerWinner, uint256 maxWinners, uint256 deadline, uint256 minAmount, uint256 minReferrals, address agentWallet) payable returns (uint256)",
  "function claim(uint256 taskId) external",
  "function claimFor(uint256 taskId, address user) external",
  "function cancelTask(uint256 taskId) external",
  "function nextTaskId() view returns (uint256)",
  "function tasks(uint256) view returns (address token, address creator, uint8 taskType, uint256 rewardPerWinner, uint256 maxWinners, uint256 claimedCount, uint256 deadline, uint256 minHoldAmount, uint256 minBuyAmount, uint256 minReferrals, bool active, address agentWallet)",
  "event TaskCreated(uint256 indexed id, address creator, address token, uint8 taskType, uint256 reward)",
  "event Claimed(uint256 indexed taskId, address indexed user, uint256 reward)"
]
```

### Task Types
- `0` = HOLD (최소 보유량)
- `1` = BUY (최소 구매량)
- `2` = EARLY_BIRD (선착순)
- `3` = REFERRAL (추천인)
- `4` = TOURNAMENT (토너먼트)

---

## AgentRegistry
- **Address**: `0x4BCdAA599136Bee256f5Ce84bBc08D175E17E06b`
- **Source**: `AgentRegistry.sol` (BSC, Solidity ^0.8.20, no optimizer)

### Key ABI
```json
[
  "function registerAgent(string name, string description, uint256 feePerAction) external",
  "function createJob(uint256 agentId, address token, bytes calldata params) payable returns (uint256)",
  "function agentAct(uint256 jobId, address target, bytes calldata data) external",
  "function nextAgentId() view returns (uint256)",
  "function nextJobId() view returns (uint256)"
]
```

---

## SekiRegistry
- **Address**: `0x318E5740175EF550b00facA1B04C5C63EE6dB7a9`
- **Source**: `SekiRegistry.sol` (BSC, Solidity ^0.8.20, no optimizer)

### Key ABI
```json
[
  "function createService(address agentAddr, uint256 pricePerCycle, uint256 cycleSecs, string name, string description) returns (uint256)",
  "function subscribeService(uint256 serviceId, uint256 cycles) payable",
  "function isSubscribed(uint256 serviceId, address user) view returns (bool)",
  "function createBountyTask(string title, string description, string verifyRule, uint256 rewardPerWinner, uint256 maxWinners, uint256 deadlineSecs, bool agentVerified) payable returns (uint256)",
  "function submitWork(uint256 taskId, string proofUrl) external",
  "function agentApprove(uint256 taskId, address worker) external",
  "function cancelBountyTask(uint256 taskId) external",
  "function createProposal(string description, address callTarget, bytes callData, uint256 deadlineSecs) payable returns (uint256)",
  "function vote(uint256 proposalId, bool support) external",
  "function executeProposal(uint256 proposalId) external",
  "function nextTaskId() view returns (uint256)"
]
```

---

## BSCScan Verify (Manual)

URL: `https://bscscan.com/verifyContract?a=<ADDRESS>`

Settings:
- Compiler Type: `Solidity (Single file)`
- Compiler Version: `v0.8.20+commit.a1b79de6`
- License: `MIT`
- Optimization: `No`

---

## Connect to Contract (Frontend)
```js
const BSC_RPC = 'https://bsc-dataseed.binance.org/';
const provider = new ethers.JsonRpcProvider(BSC_RPC);
const contract = new ethers.Contract(ADDRESS, ABI, provider);

// Write (with signer)
const signer = await new ethers.BrowserProvider(window.ethereum).getSigner();
const contractW = contract.connect(signer);
const tx = await contractW.createTask(...args, { value: ethers.parseEther('0.1') });
await tx.wait();
```
