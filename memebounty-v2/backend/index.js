/**
 * MemeBounty V2 — 后端主入口
 * 运行: node index.js
 */
require('dotenv').config();
const { runBuyMonitor }       = require('./buy-monitor');
const { runTournamentSettler } = require('./tournament-settler');

const POLL_MS = parseInt(process.env.POLL_INTERVAL_MS || '30000');

async function tick() {
  const now = new Date().toLocaleTimeString('zh-CN', { timeZone: 'Asia/Shanghai' });
  console.log(`\n[${now}] ── 后端轮询 ──`);

  await runBuyMonitor();
  await runTournamentSettler();
}

async function start() {
  console.log('🎯 MemeBounty V2 后端启动');
  console.log(`合约: ${process.env.CONTRACT_ADDRESS}`);
  console.log(`轮询间隔: ${POLL_MS / 1000}s`);

  await tick();
  setInterval(tick, POLL_MS);
}

start().catch(console.error);
