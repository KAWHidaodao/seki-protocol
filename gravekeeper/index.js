/**
 * GraveKeeper Agent — 主入口
 * 守墓人：扫描死亡 meme → 评估 → 买入 → 翻倍止盈一半 → 永久持仓另一半
 *
 * 运行: node index.js
 * 需要: .env 文件（复制 .env.example 修改）
 */

require('dotenv').config();
const { scanCandidates } = require('./src/scanner');
const { evaluateAll } = require('./src/evaluator');
const { buy, checkAndSell, announce } = require('./src/executor');

const SCAN_INTERVAL_MS = 60 * 60 * 1000;   // 每小时扫描一次
const CHECK_INTERVAL_MS = 10 * 60 * 1000;  // 每10分钟检查持仓

let isRunning = false;

/**
 * 主循环：扫描 → 评估 → 买入
 */
async function runScanCycle() {
  if (isRunning) return;
  isRunning = true;

  try {
    console.log('\n========== 守墓人开始巡逻 ==========');
    const candidates = await scanCandidates();

    if (candidates.length === 0) {
      console.log('[Main] 本轮没有候选，等待下次...');
      isRunning = false;
      return;
    }

    const top = await evaluateAll(candidates);

    if (top.length === 0) {
      console.log('[Main] 没有达到分数线的候选');
      isRunning = false;
      return;
    }

    // 每次只买最高分的一个
    const best = top[0];
    console.log(`\n[Main] 最佳候选: ${best.name} (${best.symbol}) — ${best.score}分`);
    console.log('评分理由:', best.reasons.join(', '));

    await buy(best, best.score);

  } catch (err) {
    console.error('[Main] 扫描周期出错:', err.message);
  }

  isRunning = false;
}

/**
 * 持仓检查循环
 */
async function runCheckCycle() {
  try {
    await checkAndSell();
  } catch (err) {
    console.error('[Main] 持仓检查出错:', err.message);
  }
}

/**
 * 启动
 */
async function start() {
  console.log('🪦 守墓人 Agent 启动');
  console.log(`买入金额: ${process.env.BUY_AMOUNT_BNB} BNB`);
  console.log(`止盈倍数: ${process.env.TAKE_PROFIT_MULTIPLIER}x`);
  console.log(`留仓比例: ${process.env.KEEP_RATIO * 100}%`);

  await announce('🪦 *守墓人已上线*\n\n开始扫描被遗忘的代币...');

  // 立即跑一次
  await runScanCycle();
  await runCheckCycle();

  // 定时任务
  setInterval(runScanCycle, SCAN_INTERVAL_MS);
  setInterval(runCheckCycle, CHECK_INTERVAL_MS);
}

start().catch(console.error);
