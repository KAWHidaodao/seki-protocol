/**
 * ObserverAgent — 链上数据采集者
 * 职责：每3分钟采集 BSC + X Layer 链上信号，写入 agent-state.json
 * 不做决策，不发交易，只观察并共享状态
 */
require('dotenv').config({ path: __dirname + '/../../backend/.env' });
const { ethers } = require('ethers');
const axios = require('axios');
const fs = require('fs');
const path = require('path');

const STATE_FILE = path.join(__dirname, '../../agent-state.json');
const SHARED_FILE = path.join(__dirname, '../../agent-shared.json');

const BSC_RPC = process.env.BSC_RPC_URL || 'https://bsc-dataseed.binance.org/';
const XL_RPC  = process.env.XLAYER_RPC_URL || 'https://rpc.xlayer.tech';
const WBNB    = '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c';
const PANCAKE_FACTORY = '0xcA143Ce32Fe78f1f7019d7d551a6402fC5350c73';
const FACTORY_ABI = ['function getPair(address,address) view returns (address)'];
const PAIR_ABI = [
  'function getReserves() view returns (uint112,uint112,uint32)',
  'function token0() view returns (address)',
];
const ERC20_ABI = [
  'function totalSupply() view returns (uint256)',
  'function balanceOf(address) view returns (uint256)',
  'function symbol() view returns (string)',
];

function loadShared() {
  try { return JSON.parse(fs.readFileSync(SHARED_FILE, 'utf8')); } catch { return {}; }
}
function saveShared(d) {
  fs.writeFileSync(SHARED_FILE, JSON.stringify(d, null, 2));
}

function getManagedTokens() {
  try {
    const jobs = JSON.parse(fs.readFileSync(path.join(__dirname, '../../agent-jobs.json'), 'utf8'));
    return jobs.filter(j => j.token && j.active);
  } catch { return []; }
}

async function collectBscSignals() {
  const bscP = new ethers.JsonRpcProvider(BSC_RPC);
  const factory = new ethers.Contract(PANCAKE_FACTORY, FACTORY_ABI, bscP);
  // BNB 가격 (OKX API)
  let bnbPrice = 0, bnbChg = 0, fundRate = 0, obRatio = 1;
  try {
    const r = await axios.get('https://shuifenqian.xyz/api/market/sentiment', { timeout: 5000 });
    const d = r.data;
    bnbChg = d.bnbChg || 0;
    fundRate = d.fundRate || 0;
    obRatio = d.obRatio || 1;
  } catch {}

  const tokens = getManagedTokens().filter(j => !j.chain || j.chain === 'bsc');
  const tokenData = {};
  for (const job of tokens) {
    try {
      const tok = new ethers.Contract(job.token, ERC20_ABI, bscP);
      const sym = await tok.symbol().catch(() => job.token.slice(0,8));
      const pairAddr = await factory.getPair(job.token, WBNB).catch(() => null);
      let price = 0, liq = 0;
      if (pairAddr && pairAddr !== ethers.ZeroAddress) {
        const pair = new ethers.Contract(pairAddr, PAIR_ABI, bscP);
        const [r0, r1] = await pair.getReserves();
        const t0 = await pair.token0();
        const isToken0 = t0.toLowerCase() === job.token.toLowerCase();
        const tokReserve = isToken0 ? r0 : r1;
        const bnbReserve = isToken0 ? r1 : r0;
        if (tokReserve > 0n) price = Number(bnbReserve) / Number(tokReserve);
        liq = Number(ethers.formatEther(bnbReserve)) * 2;
      }
      tokenData[job.token.toLowerCase()] = { sym, price, liq, chain: 'bsc', jobId: job.jobId };
    } catch {}
  }
  return { bnbChg, fundRate, obRatio, tokens: tokenData, ts: Date.now(), chain: 'bsc' };
}

async function collectXLayerSignals() {
  const xlP = new ethers.JsonRpcProvider(XL_RPC);
  const XLAYER_CONTRACT = process.env.XLAYER_CONTRACT;
  const BOUNTY_ABI = [
    'function nextTaskId() view returns (uint256)',
    'function taskBase(uint256) view returns (address,address,uint256,uint256,uint256,uint256,uint256,uint8,uint8,bool)',
  ];
  let taskCount = 0, activeTasks = 0;
  if (XLAYER_CONTRACT) {
    try {
      const c = new ethers.Contract(XLAYER_CONTRACT, BOUNTY_ABI, xlP);
      taskCount = Number(await c.nextTaskId().catch(() => 0n));
      for (let i = 0; i < taskCount; i++) {
        try { const b = await c.taskBase(i); if (b[9]) activeTasks++; } catch {}
      }
    } catch {}
  }
  const tokens = getManagedTokens().filter(j => j.chain === 'xlayer');
  const tokenData = {};
  for (const job of tokens) {
    try {
      const tok = new ethers.Contract(job.token, ERC20_ABI, xlP);
      const sym = await tok.symbol().catch(() => job.token.slice(0,8));
      tokenData[job.token.toLowerCase()] = { sym, chain: 'xlayer', jobId: job.jobId };
    } catch {}
  }
  return { taskCount, activeTasks, tokens: tokenData, ts: Date.now(), chain: 'xlayer' };
}

async function observe() {
  console.log('[ObserverAgent] collecting signals...');
  const shared = loadShared();
  const [bsc, xl] = await Promise.allSettled([collectBscSignals(), collectXLayerSignals()]);
  shared.bsc = bsc.status === 'fulfilled' ? bsc.value : (shared.bsc || {});
  shared.xlayer = xl.status === 'fulfilled' ? xl.value : (shared.xlayer || {});
  shared.lastObserve = Date.now();
  shared.observerAlive = true;
  saveShared(shared);
  console.log(`[ObserverAgent] done — BSC tokens:${Object.keys(shared.bsc.tokens||{}).length} XL tasks:${shared.xlayer.taskCount||0}`);
}

const INTERVAL = parseInt(process.env.AGENT_INTERVAL_MIN || '3') * 60 * 1000;
observe().catch(console.error);
setInterval(() => observe().catch(console.error), INTERVAL);
console.log('[ObserverAgent] started, interval:', INTERVAL/60000, 'min');
