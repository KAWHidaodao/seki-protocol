/**
 * TOURNAMENT 结算器
 * 截止时间到后，按链上持仓量排名，前N名瓜分奖池
 */
require('dotenv').config();
const { ethers } = require('ethers');
const { provider, contract } = require('./chain');

const TOKEN_ABI = ['function balanceOf(address) view returns (uint256)'];

/**
 * 获取所有到期未结算的 TOURNAMENT 任务
 */
async function getExpiredTournaments() {
  const total = Number(await contract.nextTaskId());
  const now   = Math.floor(Date.now() / 1000);
  const tasks = [];

  for (let i = 0; i < total; i++) {
    const t = await contract.getTask(i);
    if (t.active && t.taskType === 4n && Number(t.deadline) < now) {
      tasks.push(t);
    }
  }
  return tasks;
}

/**
 * 按持仓量排序参赛者，返回前N名
 */
async function rankParticipants(task) {
  const participants = await contract.getParticipants(Number(task.id));
  if (participants.length === 0) return [];

  const token = new ethers.Contract(task.targetToken, TOKEN_ABI, provider);

  // 并发查余额
  const balances = await Promise.all(
    participants.map(async addr => {
      try {
        const bal = await token.balanceOf(addr);
        return { addr, bal };
      } catch {
        return { addr, bal: 0n };
      }
    })
  );

  // 按余额降序排列
  balances.sort((a, b) => (b.bal > a.bal ? 1 : b.bal < a.bal ? -1 : 0));

  const topN = Number(task.maxWinners);
  return balances.slice(0, topN).map(b => b.addr);
}

/**
 * 主循环：检查并结算到期的锦标赛
 */
async function runTournamentSettler() {
  try {
    const tasks = await getExpiredTournaments();

    for (const task of tasks) {
      const taskId = Number(task.id);
      console.log(`[Tournament] 结算任务 #${taskId}...`);

      const winners = await rankParticipants(task);

      if (winners.length === 0) {
        console.log(`[Tournament] 没有参赛者，取消任务 #${taskId}`);
        // 无人参赛，合约 cancelTask 退款
        try {
          const tx = await contract.cancelTask(taskId);
          await tx.wait();
        } catch (e) {
          console.error('[Tournament] cancel 失败:', e.message);
        }
        continue;
      }

      console.log(`[Tournament] 前${winners.length}名:`, winners);

      try {
        const tx = await contract.settleTournament(taskId, winners);
        await tx.wait();
        console.log(`[Tournament] 结算成功 txHash: ${tx.hash}`);
      } catch (err) {
        console.error(`[Tournament] 结算失败:`, err.message);
      }
    }
  } catch (err) {
    console.error('[Tournament] 错误:', err.message);
  }
}

module.exports = { runTournamentSettler };
