/**
 * ExecutorAgent — 链上执行者
 * 职责：读取 DecisionAgent 的决策，自主完成链上支付流：
 *   1. 检查 taxPool / job.budget
 *   2. 调用 createTaskFromTax 或 createTaskAndPay
 *   3. 支持 BSC + X Layer 双链自主支付
 * 这是自主支付流的核心，无需人工介入
 */
require('dotenv').config({ path: __dirname + '/../../backend/.env' });
const { ethers } = require('ethers');
const axios = require('axios');
const fs = require('fs');
const path = require('path');

const SHARED_FILE = path.join(__dirname, '../../agent-shared.json');
const JOBS_FILE   = path.join(__dirname, '../../agent-jobs.json');

// ── 双链配置 ─────────────────────────────────
const CHAINS = {
  bsc: {
    rpc: process.env.BSC_RPC_URL || 'https://bsc-dataseed.binance.org/',
    contract: process.env.CONTRACT_ADDRESS,
    registry: process.env.REGISTRY_ADDRESS || '0xa39Bf757C1b235c9bC046796A56f52dCf013ABE7',
    symbol: 'BNB', name: 'BSC',
  },
  xlayer: {
    rpc: process.env.XLAYER_RPC_URL || 'https://rpc.xlayer.tech',
    contract: process.env.XLAYER_CONTRACT,
    registry: process.env.XLAYER_REGISTRY || '0xCB778Ac6A811A2712764F2cee69748CaCb71b80f',
    symbol: 'OKB', name: 'X Layer',
  },
};

const BOUNTY_ABI = [
  'function nextTaskId() view returns (uint256)',
  'function taskBase(uint256) view returns (address,address,uint256,uint256,uint256,uint256,uint256,uint8,uint8,bool)',
];
const REGISTRY_ABI = [
  'function taxPool() view returns (uint256)',
  'function getJob(uint256) view returns (address owner,address token,uint8 agentType,uint256 budget,uint256 spent,uint256 createdAt,uint256 expiresAt,uint8 status)',
  'function createTaskFromTax((address targetToken,uint8 taskType,uint256 maxWinners,uint256 rewardPerWinner,uint256 deadlineTs,uint256 minTokenAmount,uint256 minHoldSeconds,uint256 minBuyBNB,address bountyContract) tp) returns (uint256)',
  'function createTaskAndPay(uint256 jobId,(address targetToken,uint8 taskType,uint256 maxWinners,uint256 rewardPerWinner,uint256 deadlineTs,uint256 minTokenAmount,uint256 minHoldSeconds,uint256 minBuyBNB,address bountyContract) tp) returns (uint256)',
];

function loadShared() {
  try { return JSON.parse(fs.readFileSync(SHARED_FILE, 'utf8')); } catch { return {}; }
}
function saveShared(d) { fs.writeFileSync(SHARED_FILE, JSON.stringify(d, null, 2)); }
function loadJobs() {
  try { return JSON.parse(fs.readFileSync(JOBS_FILE, 'utf8')); } catch { return []; }
}

async function executeOnChain(chainKey, decision, job) {
  const cfg = CHAINS[chainKey];
  if (!cfg.contract || !cfg.registry) {
    console.log(`[ExecutorAgent] ${chainKey} contract not configured, skip`);
    return null;
  }
  const provider = new ethers.JsonRpcProvider(cfg.rpc);
  const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);
  const registry = new ethers.Contract(cfg.registry, REGISTRY_ABI, wallet);

  // 自主支付流：决定资金来源
  let txHash = null;
  const rewardMul = decision.rewardMul || 1.0;
  const baseReward = chainKey === 'xlayer' ? 0.001 : 0.002; // OKB / BNB
  const rewardPerWinner = ethers.parseEther(String((baseReward * rewardMul).toFixed(6)));
  const maxWinners = BigInt(decision.maxWinners || 5);
  const deadlineTs = BigInt(Math.floor(Date.now() / 1000) + (decision.deadlineMins || 20) * 60);
  const minAmt = BigInt('8888000000000000000000000');
  const taskParams = {
    targetToken: job.token,
    taskType: decision.taskType ?? 2,
    maxWinners,
    rewardPerWinner,
    deadlineTs,
    minTokenAmount: minAmt,
    minHoldSeconds: 0n,
    minBuyBNB: 0n,
    bountyContract: cfg.contract,
  };

  // ① 先尝试 taxPool（自主支付，无需用户）
  try {
    const taxPool = await registry.taxPool();
    const required = rewardPerWinner * maxWinners * 105n / 100n;
    if (taxPool >= required) {
      console.log(`[ExecutorAgent] ${chainKey} using taxPool (${ethers.formatEther(taxPool)} available)`);
      const tx = await registry.createTaskFromTax(taskParams, { gasLimit: 600000n });
      txHash = tx.hash;
      await tx.wait();
      console.log(`[ExecutorAgent] ${chainKey} task created from taxPool tx=${txHash}`);
      return txHash;
    }
  } catch (e) {
    console.warn(`[ExecutorAgent] taxPool attempt failed: ${e.message.slice(0,80)}`);
  }

  // ② fallback：用户 job.budget（自主支付，从已委托预算）
  if (job && job.jobId != null) {
    try {
      const jobData = await registry.getJob(BigInt(job.jobId));
      const remaining = jobData[3] - jobData[4]; // budget - spent
      const required = rewardPerWinner * maxWinners * 105n / 100n;
      if (remaining >= required) {
        console.log(`[ExecutorAgent] ${chainKey} using job #${job.jobId} budget`);
        const tx = await registry.createTaskAndPay(BigInt(job.jobId), taskParams, { gasLimit: 600000n });
        txHash = tx.hash;
        await tx.wait();
        console.log(`[ExecutorAgent] ${chainKey} task created from job budget tx=${txHash}`);
        return txHash;
      } else {
        console.log(`[ExecutorAgent] ${chainKey} job budget insufficient: ${ethers.formatEther(remaining)}`);
      }
    } catch (e) {
      console.warn(`[ExecutorAgent] job budget attempt failed: ${e.message.slice(0,80)}`);
    }
  }

  console.log(`[ExecutorAgent] ${chainKey} no funds available, skip`);
  return null;
}

async function execute() {
  const shared = loadShared();
  const decision = shared.decision;

  if (!decision || !decision.pending) {
    console.log('[ExecutorAgent] no pending decision');
    return;
  }
  if (decision.action !== 'CREATE') {
    shared.decision.pending = false;
    saveShared(shared);
    return;
  }
  if (Date.now() - decision.decidedAt > 5 * 60 * 1000) {
    console.log('[ExecutorAgent] decision expired');
    shared.decision.pending = false;
    saveShared(shared);
    return;
  }

  console.log(`[ExecutorAgent] executing: ${decision.reason} (${decision.source})`);

  const jobs = loadJobs();
  const results = [];

  // BSC 执行
  const bscJobs = jobs.filter(j => j.active && (!j.chain || j.chain === 'bsc'));
  for (const job of bscJobs.slice(0, 1)) { // 每次最多发1个
    try {
      const txHash = await executeOnChain('bsc', decision, job);
      if (txHash) {
        results.push({ chain: 'bsc', txHash });
        await axios.post('https://shuifenqian.xyz/api/log', {
          msg: `[ExecutorAgent][BSC] 自主支付任务发布 — ${decision.reason}`,
          tag: 'CREATE', symbol: job.token?.slice(0,8) || 'AGENT',
          persona: decision.persona, txHash,
        }).catch(() => {});
      }
    } catch (e) { console.error('[ExecutorAgent] BSC error:', e.message.slice(0,80)); }
  }

  // X Layer 执行（自主支付 OKB）
  const xlJobs = jobs.filter(j => j.active && j.chain === 'xlayer');
  for (const job of xlJobs.slice(0, 1)) {
    try {
      const txHash = await executeOnChain('xlayer', decision, job);
      if (txHash) {
        results.push({ chain: 'xlayer', txHash });
        await axios.post('https://shuifenqian.xyz/api/log', {
          msg: `[ExecutorAgent][X Layer] 自主支付任务发布 OKB — ${decision.reason}`,
          tag: 'CREATE', symbol: job.token?.slice(0,8) || 'AGENT',
          persona: decision.persona, txHash,
        }).catch(() => {});
      }
    } catch (e) { console.error('[ExecutorAgent] XLayer error:', e.message.slice(0,80)); }
  }

  // 标记决策已消费
  shared.decision.pending = false;
  shared.decision.executed = results;
  shared.executorAgent = { alive: true, lastRun: Date.now(), lastResults: results };
  saveShared(shared);

  if (results.length) {
    console.log(`[ExecutorAgent] done — ${results.length} tasks created on-chain`);
  } else {
    console.log('[ExecutorAgent] no tasks created (no funds or no active jobs)');
  }
}

// ── V5：Agent 代替用户结算（claimFor）────────────────────────────────
const V5_CONTRACT = process.env.V5_CONTRACT || '0xe2D7f97A6C63ADcAf14Fe70B8bdAD022349A9655';
const V5_ABI = [
  'function nextTaskId() view returns (uint256)',
  'function taskBase(uint256) view returns (address creator,address targetToken,uint256 maxWinners,uint256 rewardPerWinner,uint256 totalReward,uint256 claimedCount,uint256 deadline,uint8 taskType,uint8 rewardType,bool active)',
  'function taskCond(uint256) view returns (address rewardToken,uint256 minTokenAmount,uint256 minHoldSeconds,uint256 minBuyBNB,uint256 minReferrals)',
  'function holdStart(uint256,address) view returns (uint256)',
  'function hasClaimed(uint256,address) view returns (bool)',
  'function startHoldFor(uint256 id,address user)',
  'function claimFor(uint256 id,address user)',
  'function claimForBatch(uint256 id,address[] users)',
];
const TOKEN_BAL_ABI = ['function balanceOf(address) view returns (uint256)'];

// 从 DexScreener 或链上事件获取代币持仓用户列表
// 策略：通过 BSCScan Transfer 事件找近期买入用户
async function getTokenHolders(tokenAddr, apiKey) {
  try {
    const url = `https://api.bscscan.com/api?module=account&action=tokentx&contractaddress=${tokenAddr}&sort=desc&offset=100&page=1&apikey=${apiKey}`;
    const r = await axios.get(url, { timeout: 8000 });
    if (r.data.status !== '1') return [];
    // 取近期买入地址（to字段，去重）
    const buyers = [...new Set(r.data.result.map(tx => tx.to.toLowerCase()))];
    return buyers.slice(0, 50); // 最多50个
  } catch { return []; }
}

async function settleTasksForUsers() {
  const provider = new ethers.JsonRpcProvider(CHAINS.bsc.rpc);
  const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);
  const v5 = new ethers.Contract(V5_CONTRACT, V5_ABI, wallet);
  const BSCSCAN_KEY = process.env.BSCSCAN_KEY || '7FAQMWNY16DVSQNCD7TNUD3J1Q8B77Q8IZ';

  let nextId;
  try { nextId = Number(await v5.nextTaskId()); } catch { return; }
  if (!nextId) return;

  const now = Math.floor(Date.now() / 1000);
  let settled = 0;

  for (let id = 0; id < nextId; id++) {
    try {
      const b = await v5.taskBase(id);
      if (!b.active) continue;
      if (Number(b.deadline) <= now) continue;
      if (Number(b.claimedCount) >= Number(b.maxWinners)) continue;

      const c = await v5.taskCond(id);
      const taskType = Number(b.taskType);

      // 获取候选用户列表
      const holders = await getTokenHolders(b.targetToken, BSCSCAN_KEY);
      if (!holders.length) continue;

      const tokenCon = new ethers.Contract(b.targetToken, TOKEN_BAL_ABI, provider);

      if (taskType === 0) {
        // 持仓任务：startHoldFor（未开始计时的用户）+ claimFor（已达标的用户）
        for (const user of holders) {
          if (Number(b.claimedCount) >= Number(b.maxWinners)) break;
          try {
            const [claimed, hs, bal] = await Promise.all([
              v5.hasClaimed(id, user),
              v5.holdStart(id, user),
              tokenCon.balanceOf(user),
            ]);
            if (claimed) continue;
            if (bal < c.minTokenAmount) continue;
            if (Number(hs) === 0) {
              // 帮用户开始计时
              const tx = await v5.startHoldFor(id, user, { gasLimit: 100000n });
              await tx.wait();
              console.log(`[Settle] startHoldFor task#${id} user=${user.slice(0,10)}... tx=${tx.hash.slice(0,12)}`);
            } else if (now >= Number(hs) + Number(c.minHoldSeconds)) {
              // 持仓时间到，帮用户领奖
              const tx = await v5.claimFor(id, user, { gasLimit: 150000n });
              await tx.wait();
              settled++;
              console.log(`[Settle] claimFor(hold) task#${id} user=${user.slice(0,10)}... tx=${tx.hash.slice(0,12)}`);
              await axios.post('https://shuifenqian.xyz/api/log', {
                msg: `[Agent] 自动代领持仓奖励 task#${id} → ${user.slice(0,10)}... TX: [TX](https://bscscan.com/tx/${tx.hash})`,
                tag: 'CREATE', symbol: b.targetToken.slice(0,8), txHash: tx.hash,
              }).catch(() => {});
            }
          } catch (e) {
            if (!e.message.includes('claimed') && !e.message.includes('full')) {
              console.warn(`[Settle] task#${id} user=${user.slice(0,10)} err: ${e.message.slice(0,60)}`);
            }
          }
        }
      } else if (taskType === 1 || taskType === 2) {
        // 买入任务(1) / 早鸟任务(2)：批量检查 + claimFor
        const eligible = [];
        for (const user of holders) {
          try {
            const [claimed, bal] = await Promise.all([
              v5.hasClaimed(id, user),
              tokenCon.balanceOf(user),
            ]);
            if (!claimed && bal >= c.minTokenAmount) eligible.push(user);
          } catch {}
          if (eligible.length >= 10) break; // 每批最多10个
        }
        if (eligible.length > 0) {
          try {
            const remaining = Number(b.maxWinners) - Number(b.claimedCount);
            const batch = eligible.slice(0, remaining);
            const tx = await v5.claimForBatch(id, batch, { gasLimit: BigInt(150000 * batch.length) });
            await tx.wait();
            settled += batch.length;
            console.log(`[Settle] claimForBatch task#${id} ${batch.length} users tx=${tx.hash.slice(0,12)}`);
            await axios.post('https://shuifenqian.xyz/api/log', {
              msg: `[Agent] 批量代领奖励 task#${id} → ${batch.length}人 TX: [TX](https://bscscan.com/tx/${tx.hash})`,
              tag: 'CREATE', symbol: b.targetToken.slice(0,8), txHash: tx.hash,
            }).catch(() => {});
          } catch (e) {
            if (!e.message.includes('full')) console.warn(`[Settle] batch err: ${e.message.slice(0,60)}`);
          }
        }
      }
    } catch (e) {
      console.warn(`[Settle] task#${id} scan err: ${e.message.slice(0,60)}`);
    }
  }

  if (settled > 0) {
    console.log(`[Settle] done — ${settled} rewards auto-claimed for users`);
  }
}

const INTERVAL = parseInt(process.env.AGENT_INTERVAL_MIN || '3') * 60 * 1000 + 60000; // Observer+60s
setTimeout(() => {
  execute().catch(console.error);
  settleTasksForUsers().catch(console.error); // 启动时先跑一次结算
  setInterval(() => execute().catch(console.error), INTERVAL);
  setInterval(() => settleTasksForUsers().catch(console.error), INTERVAL); // 每轮也跑结算
}, 70000); // Observer(0s) → Decision(35s) → Executor(70s)
console.log('[ExecutorAgent] started, will begin in 70s (with auto-settle v5)');
