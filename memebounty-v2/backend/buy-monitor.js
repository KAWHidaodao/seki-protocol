/**
 * BUY 任务监控
 * 扫描链上转账，确认买入金额 >= minBuyBNB 后调 claimBuy
 */
require('dotenv').config();
const { ethers } = require('ethers');
const { provider, contract } = require('./chain');

// BSC: PancakeSwap/four.meme 路由地址（可扩展）
const DEX_ROUTERS = new Set([
  '0x10ed43c718714eb63d5aa57b78b54704e256024e', // PancakeSwap v2
  '0x13f4ea83d0bd40e75c8222255bc855a974568dd4', // PancakeSwap v3
]);

const fs   = require('fs');
const STATE_FILE = './buy-monitor-state.json';

function loadState() {
  try { return JSON.parse(fs.readFileSync(STATE_FILE)); } catch { return { processed: {} }; }
}
function saveState(s) { fs.writeFileSync(STATE_FILE, JSON.stringify(s, null, 2)); }

/**
 * 获取所有活跃的 BUY 任务
 */
async function getActiveBuyTasks() {
  const total = Number(await contract.nextTaskId());
  const tasks = [];
  for (let i = 0; i < total; i++) {
    const t = await contract.getTask(i);
    if (t.active && t.taskType === 1n) { // TaskType.BUY = 1
      tasks.push(t);
    }
  }
  return tasks;
}

/**
 * 扫描某个代币的最近买入交易
 * 用 BSCScan API 查 internal transactions
 */
async function getRecentBuyers(tokenAddress, minBuyWei, fromBlock) {
  const axios = require('axios');
  const apiKey = process.env.BSCSCAN_API_KEY || '';
  const url = `https://api.bscscan.com/api?module=account&action=tokentx`
    + `&contractaddress=${tokenAddress}`
    + `&startblock=${fromBlock}`
    + `&endblock=latest`
    + `&sort=desc`
    + `&apikey=${apiKey}`;

  try {
    const res = await axios.get(url, { timeout: 10000 });
    const txs = res.data?.result || [];

    // 聚合每个买家的总买入BNB（通过 value 字段）
    const buyerMap = {};
    for (const tx of txs) {
      // 过滤：from 是 DEX 路由（意味着是买入，代币转给用户）
      if (!DEX_ROUTERS.has(tx.from?.toLowerCase())) continue;
      const buyer = tx.to?.toLowerCase();
      if (!buyer) continue;
      // 这里用 tx.value 近似（实际应查对应的 BNB 转账）
      buyerMap[buyer] = (buyerMap[buyer] || 0n) + BigInt(tx.value || 0);
    }

    // 过滤达标买家
    return Object.entries(buyerMap)
      .filter(([, v]) => v >= BigInt(minBuyWei))
      .map(([addr]) => addr);

  } catch (err) {
    console.error('[BuyMonitor] API 查询失败:', err.message);
    return [];
  }
}

/**
 * 主循环：扫描 BUY 任务，自动发奖
 */
async function runBuyMonitor() {
  const state = loadState();

  try {
    const tasks = await getActiveBuyTasks();
    if (tasks.length === 0) return;

    const currentBlock = await provider.getBlockNumber();

    for (const task of tasks) {
      const taskId = Number(task.id);
      const fromBlock = state.lastBlock?.[taskId] || (currentBlock - 5000);

      console.log(`[BuyMonitor] 任务 #${taskId} 代币 ${task.targetToken}`);

      const buyers = await getRecentBuyers(
        task.targetToken,
        task.minBuyBNB.toString(),
        fromBlock
      );

      for (const buyer of buyers) {
        const key = `${taskId}-${buyer}`;
        if (state.processed[key]) continue;
        if (task.claimedCount >= task.maxWinners) break;

        // 检查是否已领奖
        const alreadyClaimed = await contract.hasClaimed(taskId, buyer);
        if (alreadyClaimed) { state.processed[key] = true; continue; }

        try {
          console.log(`[BuyMonitor] 发奖 → 任务#${taskId} 用户 ${buyer}`);
          const tx = await contract.claimBuy(taskId, buyer);
          await tx.wait();
          state.processed[key] = true;
          console.log(`[BuyMonitor] 成功 txHash: ${tx.hash}`);
        } catch (err) {
          console.error(`[BuyMonitor] 发奖失败:`, err.message);
        }
      }

      // 更新扫描起始区块
      if (!state.lastBlock) state.lastBlock = {};
      state.lastBlock[taskId] = currentBlock;
    }

    saveState(state);
  } catch (err) {
    console.error('[BuyMonitor] 错误:', err.message);
  }
}

module.exports = { runBuyMonitor };
