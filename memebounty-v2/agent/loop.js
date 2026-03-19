/**
 * agent/loop.js — MemeBounty AI Agent v2
 *
 * 升级：人格系统 + 情绪感知 + 故事线任务链
 *
 * 人格：
 *   🔴 猎手  — 紧迫感，追击抛压
 *   🟡 军师  — 冷静分析，数据说话
 *   🟢 传令官 — 狂欢感，庆祝新人涌入
 *
 * 故事线：每个代币有独立进度，任务完成度推进章节
 */

require('dotenv').config({ path: __dirname + '/../backend/.env' });
const { ethers } = require('ethers');
const axios      = require('axios');
const fs         = require('fs');
const path       = require('path');

// ── 配置 ──────────────────────────────────────
const INTERVAL_MS  = parseInt(process.env.AGENT_INTERVAL_MIN || '3') * 60 * 1000;
const STATE_FILE   = path.join(__dirname, '..', 'agent-state.json');

// ── 持久化状态（热度/奖励/人格/钻石榜）──
function loadAgentState() {
  try { return JSON.parse(fs.readFileSync(STATE_FILE,'utf8')); } catch { return {}; }
}
function saveAgentState(st) {
  try { fs.writeFileSync(STATE_FILE, JSON.stringify(st, null, 2)); } catch {}
}
// 获取/初始化某代币状态
function getTokenState(st, addr) {
  const k = addr.toLowerCase();
  if (!st[k]) st[k] = { vol24hPrev: null, vol24hTs: 0, rolloverBNB: 0, diamondSnap: {}, persona: null, personaTs: 0, lastBudgetShare: {} };
  return st[k];
}
const CONTRACT     = process.env.CONTRACT_ADDRESS;
const TG_TOKEN     = process.env.TELEGRAM_BOT_TOKEN;
const TG_CHAT      = process.env.TELEGRAM_CHAT_ID;
const RPC          = process.env.BSC_RPC_URL || 'https://bsc-dataseed.binance.org/';
const LLM_URL      = 'https://code.newcli.com/codex/v1/chat/completions';
const LLM_MODEL    = 'gpt-5.4';
const LLM_KEY      = process.env.OPENAI_API_KEY || 'sk-ant-oat01-biFe9ra5JZFx7RWA1_pFNjay2Vr3MOSOJuf9rxtdw5MTxP_-yggQmxZWsYuIgZfjr2vA3qgFBSz2ZmK83ZbAgvAZZR7mHAA';
// 动态从 agent-jobs.json 读取活跃委托代币
function getManagedTokens() {
  try {
    const jobsFile = path.join(__dirname, '..', 'agent-jobs.json');
    const jobs = JSON.parse(fs.readFileSync(jobsFile, 'utf8'));
    const fromJobs = jobs.filter(j => j.token && j.active).map(j => j.token.toLowerCase());
    const fromEnv = (process.env.MANAGED_TOKENS || '').split(',').filter(Boolean).map(t => t.toLowerCase());
    return [...new Set([...fromJobs, ...fromEnv])];
  } catch { return (process.env.MANAGED_TOKENS || '').split(',').filter(Boolean); }
}
const MANAGED_TOKENS = getManagedTokens();
const STORY_FILE   = path.join(__dirname, '..', 'story-state.json');

const provider = new ethers.JsonRpcProvider(RPC);
const wallet   = new ethers.Wallet(process.env.PRIVATE_KEY, provider);

// ── ABI ──────────────────────────────────────
const REGISTRY_ADDR = process.env.REGISTRY_ADDRESS || '0xABBB59fC5Ca85DC4b15B2f8698a0395A72F932bf';

const BOUNTY_ABI = [
  'function nextTaskId() view returns (uint256)',
  'function taskBase(uint256) view returns (address creator,address targetToken,uint256 maxWinners,uint256 rewardPerWinner,uint256 totalReward,uint256 claimedCount,uint256 deadline,uint8 taskType,uint8 rewardType,bool active)',
  'function taskCond(uint256) view returns (address rewardToken,uint256 minTokenAmount,uint256 minHoldSeconds,uint256 minBuyBNB)',
  // 保留旧接口（fallback 用，Agent 自己没 budget 时用）
  'function createTask(address,uint8,uint8,address,uint256,uint256,uint256,uint256,uint256,uint256,uint256) payable returns (uint256)',
  'function cancelTask(uint256)',
];

// AgentRegistry — 税收池（主路径）+ job.budget（Dev 加速）
const REGISTRY_ABI = [
  // 税收池路径（主要）：税收存入合约，Agent 从税收池发任务
  'function createTaskFromTax((address targetToken,uint8 taskType,uint256 maxWinners,uint256 rewardPerWinner,uint256 deadlineTs,uint256 minTokenAmount,uint256 minHoldSeconds,uint256 minBuyBNB,address bountyContract) tp) returns (uint256 taskId)',
  'function taxPool() view returns (uint256)',
  // Dev 预算路径（加速）：Dev 充值 job.budget，Agent 从 job.budget 发任务
  'function createTaskAndPay(uint256 jobId,(address targetToken,uint8 taskType,uint256 maxWinners,uint256 rewardPerWinner,uint256 deadlineTs,uint256 minTokenAmount,uint256 minHoldSeconds,uint256 minBuyBNB,address bountyContract) tp) returns (uint256 taskId)',
  'function getJobBudgetRemaining(uint256 jobId) view returns (uint256)',
  'function getJob(uint256 jobId) view returns (tuple(address client,address provider,address evaluator,uint256 budget,uint256 expiredAt,uint8 status,bytes32 deliverable,bytes32 reason,address hook))',
];
const ERC20_ABI = [
  'function balanceOf(address) view returns (uint256)',
  'function totalSupply() view returns (uint256)',
  'function decimals() view returns (uint8)',
  'function symbol() view returns (string)',
  'function name() view returns (string)',
];
const PAIR_ABI = [
  'function getReserves() view returns (uint112,uint112,uint32)',
  'function token0() view returns (address)',
];
const FACTORY_ABI = ['function getPair(address,address) view returns (address)'];

const PANCAKE_FACTORY = '0xcA143Ce32Fe78f1f7019d7d551a6402fC5350c73';
const WBNB            = '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c';

const contract  = CONTRACT ? new ethers.Contract(CONTRACT, BOUNTY_ABI, wallet) : null;
const registry  = new ethers.Contract(REGISTRY_ADDR, REGISTRY_ABI, wallet);
const factory   = new ethers.Contract(PANCAKE_FACTORY, FACTORY_ABI, provider);

// ── 人格定义 ──────────────────────────────────
const PERSONAS = {
  hunter: {
    emoji: '🔴',
    name: '猎手',
    tone: '紧迫、煽动、追击感。像一个战场指挥官，用"还在等什么""撑住""不能让他们跑了"这类语气。任务标题要有紧迫感和竞争感。',
    trigger: (s) => s.sellPressure > 0.3 || s.fillRate < 20,
  },
  strategist: {
    emoji: '🟡',
    name: '军师',
    tone: '冷静、数据导向、分析派。用链上数据说话，语气像在作战室复盘。任务标题要有"精准""链上验证""数据说话"这类感觉。',
    trigger: (s) => s.activeTasks.length >= 2,
  },
  herald: {
    emoji: '🟢',
    name: '传令官',
    tone: '狂欢、庆祝、扩张感。像一个节日主持人宣布好消息，用"盛宴开始了""欢迎新人""冲啊"这类语气。任务标题要有节庆感。',
    trigger: (s) => s.newHolders > 10 || s.activeTasks.length === 0,
  },
};

function selectPersona(state) {
  if (PERSONAS.hunter.trigger(state)) return 'hunter';
  if (PERSONAS.herald.trigger(state)) return 'herald';
  return 'strategist';
}

// ── 故事线章节模板 ────────────────────────────
const STORY_CHAPTERS = [
  {
    chapter: 1,
    title: '第一章：招募令',
    desc: '社区刚刚起航，Agent 发出第一道号召',
    taskType: 2,  // 早鸟
    maxWinners: 100,
    rewardMultiplier: 1.0,
    unlockThreshold: 5,
    flavor: '新世界的大门已经打开，前100名敢于踏入的勇士将获得开荒奖励。',
  },
  {
    chapter: 2,
    title: '第二章：守城战',
    desc: '早期成员证明自己的忠诚',
    taskType: 0,  // 持仓
    maxWinners: 80,
    rewardMultiplier: 1.5,
    unlockThreshold: 8,
    flavor: '招募令已发出，但真正的考验才刚开始。持仓超过12小时，才算真正的守城者。',
  },
  {
    chapter: 3,
    title: '第三章：裂变扩张',
    desc: '守城者开始向外扩张',
    taskType: 3,  // 推荐
    maxWinners: 60,
    rewardMultiplier: 2.0,
    unlockThreshold: 5,
    flavor: '守城已稳，是时候向外扩张了。每拉来一名新战士，你将获得双倍奖励。',
  },
  {
    chapter: 4,
    title: '第四章：精英锦标赛',
    desc: '最强持仓者角逐王座',
    taskType: 4,  // 锦标赛
    maxWinners: 20,
    rewardMultiplier: 5.0,
    unlockThreshold: 3,
    flavor: '前三章的老兵们，是时候决出真正的王者了。持仓最多的20人，将瓜分本章最大奖池。',
  },
  {
    chapter: 5,
    title: '第五章：永恒循环',
    desc: '故事线重新开始，奖励翻倍',
    taskType: 2,
    maxWinners: 100,
    rewardMultiplier: 2.0,
    unlockThreshold: 5,
    flavor: '传说永不终结，只是不断轮回。第二轮已经开始，而这一次，奖励翻倍。',
  },
];

// ── 故事线状态 ────────────────────────────────
function loadStory() {
  try { return JSON.parse(fs.readFileSync(STORY_FILE, 'utf8')); } catch { return {}; }
}
function saveStory(s) {
  fs.writeFileSync(STORY_FILE, JSON.stringify(s, null, 2));
}

function getTokenStory(storyState, tokenAddr) {
  const key = tokenAddr.toLowerCase();
  if (!storyState[key]) {
    storyState[key] = { chapter: 0, completedCount: 0, lastTaskId: null, startedAt: Date.now() };
  }
  return storyState[key];
}

// ── 1. OBSERVE ────────────────────────────────
async function observe(tokenAddr) {
  const token = new ethers.Contract(tokenAddr, ERC20_ABI, provider);
  const [symbol, name, decimals, totalSupply] = await Promise.all([
    token.symbol().catch(() => 'UNKNOWN'),
    token.name().catch(() => ''),
    token.decimals().catch(() => 18n),
    token.totalSupply().catch(() => 0n),
  ]);

  const tasks = [];
  if (contract) {
    const n = Number(await contract.nextTaskId().catch(() => 0n));
    for (let i = Math.max(0, n - 30); i < n; i++) {
      try {
        const b = await contract.taskBase(i);
        if (b.targetToken.toLowerCase() !== tokenAddr.toLowerCase()) continue;
        const cond = await contract.taskCond(i).catch(() => null);
        tasks.push({
          id: i,
          type: Number(b.taskType),
          active: b.active,
          claimedCount: Number(b.claimedCount),
          maxWinners: Number(b.maxWinners),
          fillRate: b.maxWinners > 0n ? Math.round(Number(b.claimedCount) * 100 / Number(b.maxWinners)) : 0,
          rewardPerWinner: ethers.formatEther(b.rewardPerWinner),
          deadline: Number(b.deadline),
          expired: Number(b.deadline) < Date.now() / 1000,
        });
      } catch {}
    }
  }

  let priceInBNB = null, liquidity = null, priceChange = null;
  try {
    const pairAddr = await factory.getPair(tokenAddr, WBNB);
    if (pairAddr !== ethers.ZeroAddress) {
      const pair = new ethers.Contract(pairAddr, PAIR_ABI, provider);
      const [r0, r1] = await pair.getReserves();
      const t0 = await pair.token0();
      const [rToken, rBNB] = t0.toLowerCase() === tokenAddr.toLowerCase() ? [r0, r1] : [r1, r0];
      if (rToken > 0n) {
        priceInBNB = Number(ethers.formatEther(rBNB)) / Number(ethers.formatUnits(rToken, Number(decimals)));
        liquidity  = Number(ethers.formatEther(rBNB)) * 2;
      }
    }
  } catch {}

  const agentBNB = parseFloat(ethers.formatEther(await provider.getBalance(wallet.address)));
  const activeTasks = tasks.filter(t => t.active);
  const avgFillRate = activeTasks.length > 0
    ? activeTasks.reduce((a, t) => a + t.fillRate, 0) / activeTasks.length : 0;

  // 模拟指标（实际可接入 BSCScan API 或历史快照）
  const sellPressure = avgFillRate < 20 ? 0.4 : 0.1;
  const newHolders   = activeTasks.length === 0 ? 15 : 3;

  // 读取 Dev 门槛设置，并验证链上 job 状态
  let devConfig = null;
  let activeJobForToken = null;
  try {
    const jobsFile = path.join(__dirname, '..', 'agent-jobs.json');
    const jobs = JSON.parse(fs.readFileSync(jobsFile,'utf8'));
    const job = jobs.find(j => j.token && j.token.toLowerCase() === tokenAddr.toLowerCase() && j.active);
    if (job) {
      // 验证链上 job 状态
      try {
        const onChainStatus = await registry.getJobStatus(job.jobId); // 0=Open,1=Funded,2=Done,3=Cancelled,4=Expired
        const statusNum = Number(onChainStatus);
        if (statusNum !== 1 || Number(await registry.getJobBudgetRemaining(job.jobId)) === 0) { // 不是 Funded 或余额为0
          // 自动停用本地 job
          const statusNames = ['Open','Funded','Done','Cancelled','Expired'];
          console.log(`[observe] job #${job.jobId} 链上状态: ${statusNames[statusNum]||statusNum}，停用本地记录`);
          const updatedJobs = jobs.map(j2 => Number(j2.jobId) === Number(job.jobId) ? {...j2, active: false, cancelledAt: Date.now()} : j2);
          fs.writeFileSync(jobsFile, JSON.stringify(updatedJobs, null, 2));
        } else {
          activeJobForToken = job;
          if (job.thresholds) devConfig = { thresholds: job.thresholds };
        }
      } catch {
        // RPC 失败时继续用本地记录
        activeJobForToken = job;
        if (job.thresholds) devConfig = { thresholds: job.thresholds };
      }
    }
  } catch {}

  // 读取税收池余额
  let taxPoolBNB = 0;
  try {
    const tp = await registry.taxPool();
    taxPoolBNB = parseFloat(ethers.formatEther(tp));
  } catch {}

  // ── DexScreener 热度追踪（成交量突增检测）──
  let hotSignal = { vol1h: null, volPrev1h: null, spike: false };
  try {
    const ds = await axios.get(`https://api.dexscreener.com/latest/dex/tokens/${tokenAddr}`, { timeout: 5000 });
    const pair = (ds.data?.pairs || []).find(p => p.chainId === 'bsc');
    if (pair) {
      hotSignal.vol1h  = parseFloat(pair.volume?.h1 || 0);
      hotSignal.vol6h  = parseFloat(pair.volume?.h6 || 0);
      hotSignal.vol24h = parseFloat(pair.volume?.h24 || 0);
      hotSignal.priceChange1h = parseFloat(pair.priceChange?.h1 || 0);
      hotSignal.txns1h = (pair.txns?.h1?.buys || 0) + (pair.txns?.h1?.sells || 0);
    }
  } catch {}

  
  // ── 价格分析（抄底/解套/冲量检测）──
  let priceSignal = { belowLaunch: false, dropPct: 0, volumeDropping: false, needsBoost: false };
  try {
    // 用 DexScreener 数据判断价格趋势
    if (state && state.hotSignal) {
      const vol1h  = state.hotSignal?.vol1h  || 0;
      const vol6h  = state.hotSignal?.vol6h  || 0;
      const vol24h = state.hotSignal?.vol24h || 0;
      const chg1h  = state.hotSignal?.priceChange1h || 0;

      // 1h成交量 < 6h均值/6的50% → 成交量萎缩，需要冲量
      const avgHourly6h = vol6h / 6;
      if (avgHourly6h > 0 && vol1h < avgHourly6h * 0.5) {
        priceSignal.volumeDropping = true;
      }
      // 1h内跌幅 > 15% → 抄底信号
      if (chg1h < -15) {
        priceSignal.belowLaunch = true;
        priceSignal.dropPct = Math.abs(chg1h);
      }
      // 成交量萎缩 且 无活跃任务 → 需要boost
      priceSignal.needsBoost = priceSignal.volumeDropping && (state.activeTasks?.length === 0);
    }
  } catch {}

    // ── OKX 大盘信号（BNB Spot + 多空比）──
  let marketSignal = { bnbPrice: null, bnbChange24h: null, sentiment: 'neutral', signal: 'HOLD' };
  try {
    const OKX_KEY  = process.env.OKX_API_KEY  || '3fe0f8e7-1ef8-4304-afb0-ca67afe3995d';
    const OKX_SEC  = process.env.OKX_SECRET_KEY || 'A2E6A81E0B8C9BCBE0836AFC8F32DF44';
    const OKX_PASS = process.env.OKX_PASSPHRASE || '110220aA!';
    const crypto   = require('crypto');
    async function okxGet(p) {
      const ts   = new Date().toISOString();
      const sign = crypto.createHmac('sha256', OKX_SEC).update(ts + 'GET' + p).digest('base64');
      const r = await axios.get('https://www.okx.com' + p, {
        headers: {'OK-ACCESS-KEY':OKX_KEY,'OK-ACCESS-SIGN':sign,'OK-ACCESS-TIMESTAMP':ts,'OK-ACCESS-PASSPHRASE':OKX_PASS},
        timeout: 5000
      });
      return r.data;
    }
    // BNB ticker
    const ticker = await okxGet('/api/v5/market/ticker?instId=BNB-USDT');
    if (ticker.data && ticker.data[0]) {
      const t = ticker.data[0];
      const last = parseFloat(t.last);
      const open = parseFloat(t.open24h);
      const chg  = open > 0 ? ((last - open) / open * 100) : 0;
      marketSignal.bnbPrice    = last;
      marketSignal.bnbChange24h = parseFloat(chg.toFixed(2));
      // 信号判断
      if (chg > 8)       { marketSignal.sentiment = 'bull';  marketSignal.signal = 'HOLD_TASK';  }
      else if (chg > 3)  { marketSignal.sentiment = 'up';    marketSignal.signal = 'EARLYBIRD';  }
      else if (chg < -8) { marketSignal.sentiment = 'panic'; marketSignal.signal = 'BUY_TASK';   }
      else if (chg < -3) { marketSignal.sentiment = 'down';  marketSignal.signal = 'TOURNAMENT'; }
      else               { marketSignal.sentiment = 'neutral'; marketSignal.signal = 'ANY';       }
    }
    // 资金费率（BNB永续合约）
    const fr = await okxGet('/api/v5/public/funding-rate?instId=BNB-USDT-SWAP');
    if (fr.data && fr.data[0]) {
      const fundRate = parseFloat(fr.data[0].fundingRate) * 100;
      marketSignal.fundingRate = parseFloat(fundRate.toFixed(4));
      if (fundRate > 0.05) marketSignal.sentiment = 'bull_extreme';
    }

    // 资金费率历史（最近3期，判断持续多头过热）
    const frHist = await okxGet('/api/v5/public/funding-rate-history?instId=BNB-USDT-SWAP&limit=3');
    if (frHist.data?.length >= 3) {
      const rates = frHist.data.map(r => parseFloat(r.fundingRate) * 100);
      marketSignal.fundingRateHistory = rates;
      marketSignal.fundingTrend = rates.every(r => r > 0.03) ? 'overheat' : rates.every(r => r < -0.01) ? 'panic' : 'normal';
    }

    // 买卖盘深度（BNB-USDT，判断多空力量）
    const ob = await okxGet('/api/v5/market/books?instId=BNB-USDT&sz=20');
    if (ob.data?.[0]) {
      const asks = ob.data[0].asks || [];
      const bids = ob.data[0].bids || [];
      const askVol = asks.slice(0,10).reduce((a,r) => a + parseFloat(r[1]), 0);
      const bidVol = bids.slice(0,10).reduce((a,r) => a + parseFloat(r[1]), 0);
      marketSignal.orderBookRatio = bidVol > 0 ? parseFloat((bidVol / askVol).toFixed(3)) : 1;
      // ratio > 1.5 = 买盘明显强势；< 0.7 = 卖盘主导
      if (marketSignal.orderBookRatio > 1.5) marketSignal.obSignal = 'BID_DOMINANT';
      else if (marketSignal.orderBookRatio < 0.7) marketSignal.obSignal = 'ASK_DOMINANT';
      else marketSignal.obSignal = 'BALANCED';
    }

    // 大单实时成交流（最近50笔，检测鲸鱼入场）
    const trades = await okxGet('/api/v5/market/trades?instId=BNB-USDT&limit=50');
    if (trades.data?.length) {
      const now = Date.now();
      const recent = trades.data.filter(t => now - parseInt(t.ts) < 3 * 60 * 1000); // 最近3分钟
      const bigBuys  = recent.filter(t => t.side === 'buy'  && parseFloat(t.sz) > 50).length; // >50 BNB 大买单
      const bigSells = recent.filter(t => t.side === 'sell' && parseFloat(t.sz) > 50).length;
      marketSignal.whaleBuys  = bigBuys;
      marketSignal.whaleSells = bigSells;
      if (bigBuys >= 3 && bigBuys > bigSells * 2) {
        marketSignal.whaleSignal = 'WHALE_BUY';
        // 鲸鱼买入 → 强制升级信号
        if (marketSignal.signal === 'ANY' || marketSignal.signal === 'HOLD') marketSignal.signal = 'EARLYBIRD';
        console.log(`[observe] 🐋 鲸鱼入场信号！大买单${bigBuys}笔 vs 大卖单${bigSells}笔`);
      } else if (bigSells >= 3 && bigSells > bigBuys * 2) {
        marketSignal.whaleSignal = 'WHALE_SELL';
        if (marketSignal.signal === 'ANY') marketSignal.signal = 'BUY_TASK'; // 鲸鱼砸盘 → 买入任务激励抄底
      } else {
        marketSignal.whaleSignal = 'NONE';
      }
    }
  } catch(e) {
    console.log('[observe] OKX market signal fail:', e.message);
  }

  return {
    token: tokenAddr,
    symbol,
    name,
    decimals: Number(decimals),
    totalSupply: ethers.formatUnits(totalSupply, Number(decimals)),
    priceInBNB,
    liquidity,
    activeTasks,
    allTasks: tasks,
    agentBNB,
    taxPoolBNB,
    avgFillRate,
    sellPressure,
    newHolders,
    devConfig,
    marketSignal,
    hotSignal,
    timestamp: new Date().toISOString(),
  };
}

// 检查并处理过期的 fallback 任务（退款给 owner）
async function refundExpiredFallbackTasks() {
  const taskOwnerFile = path.join(__dirname, '..', 'task-owners.json');
  let taskOwners = {};
  try { taskOwners = JSON.parse(fs.readFileSync(taskOwnerFile,'utf8')); } catch { return; }
  const now = Math.floor(Date.now() / 1000);
  for (const [idStr, info] of Object.entries(taskOwners)) {
    if (info.refunded) continue;
    if (now < info.deadline + 60) continue; // 到期60秒后再处理
    try {
      const b = await contract.taskBase(Number(idStr));
      if (!b.active) { taskOwners[idStr].refunded = true; continue; }
      // 取消任务（合约退款给 Agent 钱包）
      const rem = b.totalReward - b.claimedCount * b.rewardPerWinner;
      const tx = await contract.cancelTask(Number(idStr));
      await tx.wait();
      console.log(`[refund] task #${idStr} cancelled, rem=${ethers.formatEther(rem)} BNB`);
      // 再把钱转给 job owner（扣 0.001 BNB gas）
      if (rem > 0n && info.owner && info.owner !== ethers.ZeroAddress) {
        const gasFee = ethers.parseEther('0.001');
        const netRefund = rem > gasFee ? rem - gasFee : 0n;
        if (netRefund > 0n) {
          const refundTx = await wallet.sendTransaction({ to: info.owner, value: netRefund });
          await refundTx.wait();
          console.log(`[refund] ${ethers.formatEther(netRefund)} BNB → ${info.owner}`);
          await logEntry(`💰 退款：任务 #${idStr} 到期退款 ${ethers.formatEther(netRefund)} BNB → ${info.owner.slice(0,10)}...`, 'INFO');
        }
      }
      taskOwners[idStr].refunded = true;
    } catch(e) { console.error(`[refund] task #${idStr}:`, e.message); }
  }
  try { fs.writeFileSync(taskOwnerFile, JSON.stringify(taskOwners, null, 2)); } catch {}
}


// ── 2. THINK ──────────────────────────────────
async function think(state, storyProgress, agentType = null) {
  // 优先使用委托时用户选择的 Agent 类型
  const personaKey  = (agentType && PERSONAS[agentType]) ? agentType : selectPersona(state);
  const persona     = PERSONAS[personaKey];
  const chapter     = STORY_CHAPTERS[storyProgress.chapter % STORY_CHAPTERS.length];

  // 检查故事线是否可以推进
  const canAdvance = storyProgress.lastTaskId !== null && (() => {
    const lastTask = state.allTasks.find(t => t.id === storyProgress.lastTaskId);
    return lastTask && lastTask.claimedCount >= chapter.unlockThreshold;
  })();

  const systemPrompt = `你是 MemeBounty 平台的链上 AI Agent，代号「${persona.emoji}${persona.name}」。

你的口吻风格：${persona.tone}

当前故事线进度：
- 章节：${chapter.title}（${chapter.desc}）
- 已完成任务数：${storyProgress.completedCount}
- ${canAdvance ? '✅ 上一关已解锁，可推进到下一章！' : `需再有 ${chapter.unlockThreshold} 人完成当前任务才能解锁下一章`}

链上状态：
- 代币：${state.symbol}${state.name ? ' ('+state.name+')' : ''}
- 价格：${state.priceInBNB ? state.priceInBNB.toFixed(8) + ' BNB' : '未上DEX/无流动性'}
- 流动性：${state.liquidity ? state.liquidity.toFixed(2) + ' BNB' : '无'}
- Agent BNB余额：${state.agentBNB.toFixed(4)} BNB
- 当前活跃任务：${state.activeTasks.length} 个，平均完成率 ${state.avgFillRate.toFixed(0)}%
- 抛压指数：${(state.sellPressure * 100).toFixed(0)}%（0=无抛压 100=严重抛压）
- 新增持有者：近期约 ${state.newHolders} 个

OKX 大盘信号（BNB Spot + 永续）：
- BNB价格：${state.marketSignal?.bnbPrice ? '$' + state.marketSignal.bnbPrice : '未知'}
- BNB 24h涨跌：${state.marketSignal?.bnbChange24h != null ? state.marketSignal.bnbChange24h + '%' : '未知'}
- 资金费率：${state.marketSignal?.fundingRate != null ? state.marketSignal.fundingRate + '%' : '未知'}（>0.05%=过热）
- 资金费率趋势：${state.marketSignal?.fundingTrend || 'normal'}（overheat=连续多头，panic=连续恐慌，normal=正常）
- 买卖盘深度比：${state.marketSignal?.orderBookRatio || '未知'}（>1.5=买盘强势，<0.7=卖盘主导）
- 盘口信号：${state.marketSignal?.obSignal || '未知'}
- 鲸鱼3分钟大单：买${state.marketSignal?.whaleBuys || 0}笔 / 卖${state.marketSignal?.whaleSells || 0}笔（>50BNB）
- 鲸鱼信号：${state.marketSignal?.whaleSignal || 'NONE'}（WHALE_BUY=鲸鱼入场，立刻发早鸟！）
- 市场情绪：${state.marketSignal?.sentiment || 'neutral'}
- 综合建议：${state.marketSignal?.signal || 'ANY'}
  （WHALE_BUY→5分钟早鸟抢先机, HOLD_TASK→持仓锁筹码, BUY_TASK→买入激励抄底, TOURNAMENT→拉长持仓, EARLYBIRD→热度造势）

链上价格信号：
- 1h成交量萎缩：${state.priceSignal?.volumeDropping ? '是（需冲量任务）' : '否'}
- 1h急跌：${state.priceSignal?.belowLaunch ? '是，跌幅' + state.priceSignal.dropPct.toFixed(1) + '%（抄底/解套任务）' : '否'}
- 需要激活：${state.priceSignal?.needsBoost ? '是（无活跃任务+量萎缩，发任务恢复热度）' : '否'}

特殊任务策略（根据信号自动选择）：
- 急跌>15% → 发买入任务，奖励提升2倍，吸引抄底（抄底任务）
- 成交量萎缩+无任务 → 同时发买入任务+持仓任务，恢复排名（冲量任务）
- BNB涨>5%+meme无活跃任务 → 发5-10分钟持仓任务，锁住跟涨筹码（BNB联动）
- BNB跌>8% → 买入任务奖励覆盖用户部分损失，稳住持有者（恐慌防护）
- 鲸鱼买入信号+量萎缩 → 双倍奖励早鸟任务，5分钟窗口（复合信号）
${state.activeTasks.length > 0 ? '- 任务列表：\n' + state.activeTasks.map(t => `  #${t.id} 类型${t.type} 完成率${t.fillRate}% 奖励${t.rewardPerWinner}BNB 截止${new Date(t.deadline*1000).toLocaleString('zh-CN')}`).join('\n') : ''}

任务类型说明：
0=持仓（需持仓X分钟，minHoldSeconds必须120-3600），1=买入AI验证，2=早鸟（前N名），4=锦标赛（推荐任务已移除）
⚠️ Meme币周期极短！任务生命周期建议10-30分钟，不要用小时或天！

${state.devConfig?.thresholds ? `
Dev 门槛设置（必须写入 task 参数，不可更改）：
${state.devConfig.thresholds.minTokenAmount > 0 ? `- minTokenAmount: ${state.devConfig.thresholds.minTokenAmount}（持有目标代币最低数量）` : ''}
${state.devConfig.thresholds.minBuyBNB > 0 ? `- minBuyBNB: ${state.devConfig.thresholds.minBuyBNB}（最低买入 BNB）` : ''}
${state.devConfig.thresholds.minHoldSeconds > 0 ? `- minHoldSeconds: ${state.devConfig.thresholds.minHoldSeconds}（最短持仓秒数，已在120-3600范围内）` : ''}
${state.devConfig.thresholds.minReferrals > 0 ? `- minReferrals: ${state.devConfig.thresholds.minReferrals}（推荐任务最低推荐数）` : ''}
这些门槛是项目方防白嫖设置，必须原样填入 task 对象对应字段。
` : ''}
规则：
1. Agent BNB余额不足0.005时只能WAIT（BNB只用于Gas）
2. 同类型任务同时最多1个活跃
3. 故事线章节：如果canAdvance=true，优先推进下一章
4. 优先从税收池发任务（taxPoolBNB > 0），其次从 Dev job.budget 发，最后才用 agentBNB
4b. 任务总花费不超过 taxPoolBNB 或 job.budget 的 20%（单次）
4c. 如有 Dev 设定的奖励范围，在范围内决策
5. minHoldSeconds必须在120到3600之间（2分钟到1小时）
6. deadlineMins 必须在 Dev 设定的窗口范围内（如有）

请以你的人格口吻做出决策，用JSON格式回复：
{
  "persona": "${personaKey}",
  "mood": "一个词描述当前情绪状态",
  "analysis": "用你的人格口吻分析当前局势（1-2句话，中文）",
  "action": "CREATE_TASK" | "CANCEL_TASK" | "WAIT",
  "reason": "决策原因（中文，1句话）",
  "task": {
    "taskType": 0-4,
    "rewardPerWinner": 0.005,
    "maxWinners": 50,
    "deadlineMins": 20,
    "minTokenAmount": "8888000000000000000000000", // 8,888,000 个代币（18位小数）
    "minHoldSeconds": 120,
    "minBuyBNB": "0",
    "minReferrals": 0,
    "title": "任务标题（简短有力，体现你的人格，15字以内）",
    "description": "任务描述（有故事感，体现当前章节背景，50字以内）"
  },
  "cancelTaskId": null,
  "storyAdvance": false,
  "broadcast": "给社区的一句话播报（体现人格，40字以内）"
}`;

  try {
    // 该接口强制返回 SSE 流，需要手动拼接 content
    const res = await axios.post(LLM_URL, {
      model: LLM_MODEL,
      messages: [{ role: 'user', content: systemPrompt }],
      temperature: 0.85,
      max_tokens: 600,
    }, {
      headers: { Authorization: `Bearer ${LLM_KEY}`, 'Content-Type': 'application/json' },
      timeout: 60000,
      responseType: 'text',
    });

    // 解析 SSE: 拼接所有 delta.content
    let content = '';
    const lines = (typeof res.data === 'string' ? res.data : JSON.stringify(res.data)).split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data:')) continue;
      const jsonStr = trimmed.slice(5).trim();
      if (jsonStr === '[DONE]') break;
      try {
        const chunk = JSON.parse(jsonStr);
        const delta = chunk.choices?.[0]?.delta?.content;
        if (delta) content += delta;
        // 也尝试从 item.choices
        const itemDelta = chunk.item?.choices?.[0]?.delta?.content;
        if (itemDelta) content += itemDelta;
      } catch {}
    }
    const jsonStr = content.match(/\{[\s\S]*\}/)?.[0];
    if (!jsonStr) throw new Error('no JSON in response');
    const decision = JSON.parse(jsonStr);
    decision._chapter = chapter;
    decision._canAdvance = canAdvance;
    return decision;
  } catch (e) {
    console.error('[think] LLM error:', e.message);
    return ruleBasedDecision(state, chapter, canAdvance);
  }
}

function ruleBasedDecision(state, chapter, canAdvance) {
  if (state.agentBNB < 0.03) {
    return { persona: 'strategist', mood: '低迷', analysis: '弹药告急，只能等待补给', action: 'WAIT', reason: 'Agent余额不足', broadcast: '🟡 军师：弹药告急，等待补给', _chapter: chapter, _canAdvance: canAdvance };
  }
  const badTask = state.activeTasks.find(t => {
    const minsLeft = (t.deadline - Date.now() / 1000) / 60;
    return t.fillRate < 10 && minsLeft < 6;
  });
  if (badTask) {
    return { persona: 'strategist', mood: '果断', analysis: '低效任务拖累资金，及时止损', action: 'CANCEL_TASK', cancelTaskId: badTask.id, reason: '完成率过低取消', broadcast: '🟡 军师：清理低效任务，优化弹药分配', _chapter: chapter, _canAdvance: canAdvance };
  }
  if (state.activeTasks.length === 0) {
    const t = chapter;
    return {
      persona: 'herald', mood: '兴奋',
      analysis: '社区寂静，传令官出击！',
      action: 'CREATE_TASK',
      reason: '无活跃任务，启动故事线章节',
      task: {
        taskType: t.taskType,
        rewardPerWinner: parseFloat((state.agentBNB * 0.05).toFixed(4)),
        maxWinners: t.maxWinners,
        deadlineMins: 30,
        minTokenAmount: BigInt("8888000000000000000000000"), // 8,888,000
        minHoldSeconds: t.taskType === 0 ? 300 : 0,
        minBuyBNB: '0',
        minReferrals: 0,
        title: t.title,
        description: t.flavor,
      },
      broadcast: `🟢 传令官：${t.title}正式开始！`,
      _chapter: t, _canAdvance: canAdvance,
    };
  }
  return { persona: 'strategist', mood: '观望', analysis: '任务运行中，保持观察', action: 'WAIT', reason: '生态稳定，无需干预', broadcast: '🟡 军师：链上平稳，继续观察', _chapter: chapter, _canAdvance: canAdvance };
}

// ── 3. ACT ────────────────────────────────────
async function act(decision, state, storyState) {
  const tokenKey = state.token.toLowerCase();
  const story    = storyState[tokenKey];
  const personaEmoji = { hunter: '🔴', strategist: '🟡', herald: '🟢' }[decision.persona] || '🤖';

  const logEntry = async (msg, tag, txHash) => {
    try {
      await axios.post('https://shuifenqian.xyz/api/log', {
        msg: txHash ? msg + ` [TX](https://bscscan.com/tx/${txHash})` : msg,
        tag, symbol: state.symbol,
        persona: decision.persona,
        mood: decision.mood || '',
        token: state.token.slice(0, 10) + '...',
        txHash: txHash || null,
      });
    } catch {}
    console.log(`[act][${tag}] ${msg}${txHash?' tx:'+txHash.slice(0,12)+'...':''}`);
  };

  if (decision.action === 'WAIT') {
    await logEntry(`${personaEmoji} ${decision.broadcast || decision.reason}`, 'WAIT');
    return { done: false, reason: decision.reason };
  }

  if (decision.action === 'CANCEL_TASK') {
    const id = decision.cancelTaskId;
    await logEntry(`${personaEmoji} 取消任务 #${id} — ${decision.reason}`, 'CANCEL');
    try {
      // 取消前记录任务余额（totalReward - claimedCount*rpw）
      const tb = await contract.taskBase(id);
      const rem = tb.totalReward - tb.claimedCount * tb.rewardPerWinner;

      const tx = await contract.cancelTask(id);
      const cancelReceipt = await tx.wait();
      await logEntry(`✅ 任务 #${id} 已取消，退回 ${ethers.formatEther(rem)} BNB`, 'CANCEL', cancelReceipt.hash);

      // 如果是 job.budget 路径发的任务，把退回的 BNB 补回 job
      if (rem > 0n && state.activeJob) {
        try {
          const jobId = state.activeJob.jobId;
          const curBudget = await registry.getJobBudgetRemaining(jobId);
          const newBudget = curBudget + rem;
          // 先 setBudget 更新金额，再 fund 补款
          const tx2 = await registry.setBudget(jobId, newBudget, '0x');
          await tx2.wait();
          const tx3 = await registry.fund(jobId, newBudget, '0x', { value: rem });
          await tx3.wait();
          await logEntry(`♻️ 退款 ${ethers.formatEther(rem)} BNB 已归还 Job #${jobId}`, 'INFO', tx3.hash);
        } catch(re) {
          console.error('[act] refund-to-job failed:', re.message);
          await logEntry(`⚠️ 退款归还 Job 失败: ${re.message.slice(0,60)}`, 'WARN');
        }
      }
    } catch (e) {
      console.error('[act] cancel failed:', e.message);
    }
    return { done: true, action: 'cancelled', taskId: id, reason: decision.reason };
  }

  if (decision.action === 'CREATE_TASK') {
    const t = decision.task;
    if (!t) return { done: false, reason: 'no task data' };

    const rewardPerWinner = ethers.parseEther(String(Math.max(0.001, parseFloat(t.rewardPerWinner) || 0.005)));
    const maxWinners      = BigInt(Math.max(1, parseInt(t.maxWinners) || 50));
    const deadlineSecs = (t.deadlineMins ? parseInt(t.deadlineMins) : 30) * 60;
    const deadline        = BigInt(Math.floor(Date.now() / 1000) + deadlineSecs);
    // 优先使用 Dev 门槛设置，其次用 LLM 决策值
    const th = state.devConfig?.thresholds || {};
    const minTokenAmount  = BigInt(Math.floor(th.minTokenAmount || parseInt(t.minTokenAmount) || 0));
    let   minHoldSeconds  = BigInt(th.minHoldSeconds || parseInt(t.minHoldSeconds) || 0);
    // 持仓任务强制 120s-3600s
    if (Number(t.taskType) === 0) {
      if (minHoldSeconds < 120n) minHoldSeconds = 300n;
      if (minHoldSeconds > 3600n) minHoldSeconds = 3600n;
    }
    const minBuyBNB       = ethers.parseEther(String(th.minBuyBNB || parseFloat(t.minBuyBNB) || 0));
    const minReferrals    = BigInt(th.minReferrals || parseInt(t.minReferrals) || 0);
    const total           = rewardPerWinner * maxWinners;
    const fee             = total * 300n / 10000n;

    console.log(`[act] CREATE task type=${t.taskType} reward=${ethers.formatEther(rewardPerWinner)}BNB x${maxWinners} hold=${minHoldSeconds}s`);

    try {
      let newId;

      const required = total + fee;
      const taskParams = {
        targetToken:     state.token,
        taskType:        t.taskType,
        maxWinners,
        rewardPerWinner,
        deadlineTs:      deadline,
        minTokenAmount,
        minHoldSeconds,
        minBuyBNB,
        minReferrals,
        bountyContract:  CONTRACT,
      };

      // ── 优先级1：税收池（主要路径，资金在合约里最安全）──
      try {
        const taxPool = await registry.taxPool();
        if (taxPool >= required) {
          console.log(`[act] Tax pool: ${ethers.formatEther(taxPool)} BNB, required: ${ethers.formatEther(required)} BNB`);
          const tx = await registry.createTaskFromTax(taskParams);
          const txR = await tx.wait();
          newId = Number(await contract.nextTaskId()) - 1;
          await logEntry(`💰 税收池发任务：消耗 ${ethers.formatEther(required)} BNB，税收池剩余 ${ethers.formatEther(taxPool - required)} BNB`, 'INFO', txR.hash);
        }
      } catch(taxErr) {
        console.error('[act] Tax pool path failed:', taxErr.message);
      }

      // ── 优先级2：Dev job.budget（加速路径）──
      if (newId === undefined) {
        const jobsFile = path.join(__dirname, '..', 'agent-jobs.json');
        let activeJob = null;
        try {
          const jobs = JSON.parse(fs.readFileSync(jobsFile,'utf8'));
          activeJob = jobs.find(j =>
            j.token && j.token.toLowerCase() === state.token.toLowerCase() &&
            j.active && j.jobId !== undefined
          );
        } catch {}

        if (activeJob) {
          try {
            const remaining = await registry.getJobBudgetRemaining(activeJob.jobId);
            console.log(`[act] Dev job #${activeJob.jobId} remaining: ${ethers.formatEther(remaining)} BNB, required: ${ethers.formatEther(required)} BNB`);
            if (remaining >= required) {
              const tx = await registry.createTaskAndPay(activeJob.jobId, taskParams);
              const txR = await tx.wait();
              newId = Number(await contract.nextTaskId()) - 1;
              await logEntry(`💡 Dev预算发任务：资金从 Job #${activeJob.jobId} 划拨（${ethers.formatEther(required)} BNB）`, 'INFO', txR.hash);
            } else if (remaining > ethers.parseEther('0.001')) {
              // budget 不够原方案，缩小规模：用 50% budget 发小任务
              const smallWinners = 2n;
              const smallReward  = remaining / (smallWinners + 1n); // 留 1 份作手续费
              const smallFee     = smallReward * smallWinners * 300n / 10000n;
              const smallTotal   = smallReward * smallWinners + smallFee;
              if (smallTotal <= remaining) {
                const smallParams = { ...taskParams, maxWinners: smallWinners, rewardPerWinner: smallReward };
                const tx = await registry.createTaskAndPay(activeJob.jobId, smallParams);
                await tx.wait();
                newId = Number(await contract.nextTaskId()) - 1;
                await logEntry(`💡 Dev预算(缩量)发任务：${ethers.formatEther(smallReward)}BNB×2人，剩余 ${ethers.formatEther(remaining)} BNB`, 'INFO');
              } else {
                console.log(`[act] Dev job #${activeJob.jobId} budget too low even for small task`);
              }
            } else {
              console.log(`[act] Dev job #${activeJob.jobId} budget insufficient (${ethers.formatEther(remaining)} BNB)`);
            }
          } catch(jobErr) {
            console.error('[act] Dev budget path failed:', jobErr.message);
          }
        }
      }

      // ── 优先级3：Agent 钱包 ── 已禁用
      // 任务必须由用户 budget（taxPool 或 job.budget）支付，不能从 Agent 钱包扣
      if (newId === undefined) {
        console.log('[act] 无可用资金（taxPool 不足且无 Dev budget），跳过本次发任务');
        await logEntry('⏸️ 资金不足：taxPool 为 0 且无 Dev budget，等待税收积累或用户充值', 'WAIT');
      }

      // 资金不足时跳过后续
      if (newId === undefined) {
        return { done: false, reason: '资金不足，等待 taxPool 或 Dev budget' };
      }

      // 保存元数据（带人格标记 + 章节信息）
      const chapter = decision._chapter;
      try {
        await axios.post('https://shuifenqian.xyz/api/meta', {
          id: newId,
          title: t.title || chapter.title,
          desc: t.description || chapter.flavor,
          isAgent: true,
          persona: decision.persona,
          chapter: chapter.chapter,
          mood: decision.mood,
        });
      } catch {}

      // 更新故事线状态
      if (decision._canAdvance) {
        story.chapter = (story.chapter + 1) % STORY_CHAPTERS.length;
      }
      story.lastTaskId = newId;
      story.completedCount++;
      saveStory(storyState);

      const broadcast = decision.broadcast || `${personaEmoji} 新任务上线：${t.title}`;
      await logEntry(
        `${personaEmoji}【${decision.mood || ''}】${broadcast} | 任务#${newId} 奖励${ethers.formatEther(rewardPerWinner)}BNB×${maxWinners}人`,
        'CREATE'
      );

      // 故事线推进通知
      if (decision._canAdvance) {
        const nextChapter = STORY_CHAPTERS[story.chapter % STORY_CHAPTERS.length];
        await logEntry(`📖 故事线推进！→ ${nextChapter.title}`, 'STORY');
      }

      return { done: true, action: 'created', taskType: t.taskType, reward: ethers.formatEther(rewardPerWinner), taskId: newId, reason: decision.reason, broadcast };
    } catch (e) {
      console.error('[act] createTask failed:', e.message);
      await logEntry(`创建任务失败: ${e.message.slice(0, 60)}`, 'ERROR');
      return { done: false, reason: 'createTask failed: ' + e.message };
    }
  }

  return { done: false, reason: 'unknown action' };
}

// ── 4. REPORT ─────────────────────────────────
async function report(results) {
  if (!TG_TOKEN || !TG_CHAT) return;
  const lines = results.map(r => {
    const res = r.result;
    if (!res.done) return `⚪ *${r.symbol}*: ${res.reason}`;
    if (res.action === 'created') return `✅ *${r.symbol}*: ${res.broadcast || '新任务#'+res.taskId} (${ethers.formatEther ? '' : ''}${res.reward}BNB×任务)`;
    if (res.action === 'cancelled') return `🗑 *${r.symbol}*: 取消任务#${res.taskId}`;
    return `⚪ *${r.symbol}*: ${res.reason}`;
  });
  try {
    await axios.post(`https://api.telegram.org/bot${TG_TOKEN}/sendMessage`, {
      chat_id: TG_CHAT,
      text: `🤖 *Agent 巡检* ${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}\n\n${lines.join('\n')}`,
      parse_mode: 'Markdown',
    });
  } catch (e) {
    console.error('[report] TG error:', e.message);
  }
}

// ── 主循环 ────────────────────────────────────
async function runOnce() {
  const dynamicTokens = getManagedTokens();
  if (!dynamicTokens.length) {
    console.log('[agent] 无委托代币，等待注册...');
    return;
  }

  console.log(`\n[agent] ===== ${new Date().toISOString()} =====`);
  const storyState = loadStory();
  const results = [];

  const agentSt = loadAgentState();

  for (const tokenAddr of dynamicTokens) {
    console.log(`[agent] processing ${tokenAddr}`);
    try {
      const state     = await observe(tokenAddr);
      // priceSignal 在 observe 内部已计算，但需要传入 activeTasks，补充计算
      if (state.hotSignal) {
        const vol1h = state.hotSignal.vol1h || 0;
        const vol6h = state.hotSignal.vol6h || 0;
        const chg1h = state.hotSignal.priceChange1h || 0;
        const avgH  = vol6h / 6;
        state.priceSignal = {
          volumeDropping: avgH > 0 && vol1h < avgH * 0.5,
          belowLaunch: chg1h < -15,
          dropPct: chg1h < -15 ? Math.abs(chg1h) : 0,
          needsBoost: (avgH > 0 && vol1h < avgH * 0.5) && state.activeTasks.length === 0,
        };
      } else { state.priceSignal = { volumeDropping: false, belowLaunch: false, dropPct: 0, needsBoost: false }; }
      const storyProg = getTokenStory(storyState, tokenAddr);
      const tkSt      = getTokenState(agentSt, tokenAddr);

      // ── 功能1: 热度峰值追踪（成交量10分钟内涨3x → 强制早鸟任务）──
      let forceEarlybird = false;
      if (state.hotSignal?.vol1h) {
        const prevVol = tkSt.vol24hPrev || 0;
        const now = Date.now();
        if (prevVol > 0 && state.hotSignal.vol1h > prevVol * 3 && now - tkSt.vol24hTs < 600000) {
          forceEarlybird = true;
          console.log(`[hot] ${state.symbol} 成交量3x突增！强制早鸟任务`);
          await logEntry(`🔥 ${state.symbol} 热度峰值！1h量$${state.hotSignal.vol1h.toFixed(0)} vs 前次$${prevVol.toFixed(0)}，触发早鸟任务`, 'INFO');
        }
        if (now - tkSt.vol24hTs > 600000) {
          tkSt.vol24hPrev = state.hotSignal.vol1h;
          tkSt.vol24hTs   = now;
        }
      }

      // ── 功能4: Agent 人格自动切换（每30分钟评估一次）──
      const now2 = Date.now();
      if (!tkSt.persona || now2 - tkSt.personaTs > 30 * 60 * 1000) {
        const sig = state.marketSignal?.signal || 'ANY';
        const fillRate = state.avgFillRate;
        if (sig === 'HOLD_TASK' || sig === 'EARLYBIRD') tkSt.persona = 'herald';      // 大涨→传令官造势
        else if (sig === 'BUY_TASK') tkSt.persona = 'hunter';                          // 大跌→猎手追击
        else if (fillRate < 15) tkSt.persona = 'hunter';                               // 完成率低→猎手刺激
        else if (fillRate > 70) tkSt.persona = 'strategist';                           // 完成率高→军师稳住
        else tkSt.persona = 'herald';
        tkSt.personaTs = now2;
        console.log(`[persona] ${state.symbol} → ${tkSt.persona} (sig=${sig} fill=${fillRate.toFixed(0)}%)`);
      }

      console.log(`[observe] ${state.symbol} price=${state.priceInBNB?.toFixed(8)||'N/A'} agentBNB=${state.agentBNB.toFixed(4)} story=ch${storyProg.chapter} persona=${tkSt.persona}`);

      // ── 功能5: 跨代币预算联动（多代币时，冷却代币让出预算）──
      if (dynamicTokens.length > 1) {
        const myFill = state.avgFillRate;
        // 如果本代币任务完成率 > 80%，说明热度高，分配更多预算比例
        tkSt.lastBudgetShare[tokenAddr] = myFill > 80 ? 1.5 : myFill < 20 ? 0.5 : 1.0;
      }

      const decision  = await think(state, storyProg, tkSt.persona);
      console.log(`[think] persona=${decision.persona} mood=${decision.mood} action=${decision.action}`);

      // ── 功能1: 热度峰值 → 覆盖决策为早鸟任务 ──
      if (forceEarlybird && decision.action === 'WAIT') {
        decision.action = 'CREATE';
        decision.task = decision.task || {};
        decision.task.taskType = 2; // 早鸟
        decision.task.maxWinners = 5;
        decision.task.deadlineMins = 5; // 只有5分钟
        decision.task.rewardPerWinner = Math.min(0.003, (state.taxPoolBNB || 0) * 0.05);
        decision.msg = `🔥 热度峰值自动触发早鸟任务`;
      }

      // ── 任务1: 抄底任务（急跌>15% → 买入任务，2倍奖励）──
      if (state.priceSignal?.belowLaunch && decision.action === 'WAIT' && state.taxPoolBNB > 0.003) {
        decision.action = 'CREATE';
        decision.task = decision.task || {};
        decision.task.taskType = 1; // 买入任务
        decision.task.rewardPerWinner = Math.min(0.006, state.taxPoolBNB * 0.06); // 2倍奖励
        decision.task.maxWinners = 5;
        decision.task.deadlineMins = 15;
        decision.msg = `📉 急跌${state.priceSignal.dropPct.toFixed(1)}%，抄底任务2倍奖励`;
        console.log(`[trigger] 抄底任务 drop=${state.priceSignal.dropPct.toFixed(1)}%`);
      }

      // ── 任务2: 解套任务（急跌+有活跃持仓者 → 持仓任务安慰）──
      if (state.priceSignal?.belowLaunch && state.activeTasks.some(t => t.type === 0) && decision.action === 'WAIT') {
        // 已有持仓任务在跑，让 LLM 决策是否追加奖励
        if (decision.task) decision.task.rewardPerWinner = (parseFloat(decision.task.rewardPerWinner || 0.002) * 1.5).toFixed(6);
      }

      // ── 任务3: 冲量任务（成交量萎缩+无活跃任务 → 双发）──
      if (state.priceSignal?.needsBoost && decision.action === 'WAIT' && state.taxPoolBNB > 0.005) {
        decision.action = 'CREATE';
        decision.task = {
          taskType: 1, // 买入任务冲量
          rewardPerWinner: Math.min(0.004, state.taxPoolBNB * 0.04),
          maxWinners: 8,
          deadlineMins: 20,
        };
        decision.msg = `📊 成交量萎缩，冲量任务激活`;
        console.log(`[trigger] 冲量任务 vol1h=${state.hotSignal?.vol1h?.toFixed(0)}`);
      }

      // ── 任务4: BNB涨>5%联动（无活跃任务 → 持仓任务锁筹码）──
      const bnbChg = state.marketSignal?.bnbChange24h || 0;
      if (bnbChg > 5 && state.activeTasks.length === 0 && decision.action === 'WAIT' && state.taxPoolBNB > 0.003) {
        decision.action = 'CREATE';
        decision.task = {
          taskType: 0, // 持仓任务
          rewardPerWinner: Math.min(0.004, state.taxPoolBNB * 0.04),
          maxWinners: 10,
          deadlineMins: 10,
          minHoldSeconds: 300, // 5分钟持仓
        };
        decision.msg = `🚀 BNB涨${bnbChg.toFixed(1)}%，持仓任务锁筹码`;
        console.log(`[trigger] BNB联动持仓任务 bnbChg=${bnbChg.toFixed(1)}%`);
      }

      // ── 任务5: BNB急跌>8%恐慌防护（买入任务高奖励）──
      if (bnbChg < -8 && decision.action === 'WAIT' && state.taxPoolBNB > 0.004) {
        decision.action = 'CREATE';
        decision.task = {
          taskType: 1, // 买入任务
          rewardPerWinner: Math.min(0.008, state.taxPoolBNB * 0.08), // 高奖励覆盖损失
          maxWinners: 5,
          deadlineMins: 20,
        };
        decision.msg = `🛡️ BNB急跌${Math.abs(bnbChg).toFixed(1)}%，恐慌防护任务`;
        console.log(`[trigger] 恐慌防护 bnbChg=${bnbChg.toFixed(1)}%`);
      }

      // ── 功能2: 滚雪球奖励（完成率 < 20% → 追加到下一任务）──
      let rolloverBonus = 0;
      if (state.avgFillRate < 20 && state.activeTasks.length > 0 && tkSt.rolloverBNB > 0) {
        rolloverBonus = tkSt.rolloverBNB;
        tkSt.rolloverBNB = 0;
        if (decision.task) {
          decision.task.rewardPerWinner = (parseFloat(decision.task.rewardPerWinner || 0) + rolloverBonus / Math.max(1, decision.task.maxWinners || 3)).toFixed(6);
          console.log(`[rollover] ${state.symbol} 追加奖励 +${rolloverBonus.toFixed(4)} BNB`);
        }
      }
      // 记录本次未消耗奖励用于下次滚雪球
      if (decision.action === 'WAIT' && state.activeTasks.length === 0 && state.taxPoolBNB > 0.005) {
        tkSt.rolloverBNB = Math.min(0.01, state.taxPoolBNB * 0.05);
      }

      const result    = await act(decision, state, storyState);

      // ── 功能3: 持仓钻石榜快照（每次循环记录活跃任务完成者）──
      // 这里记录时间戳，实际排名通过链上事件计算
      tkSt.lastRun = Date.now();

      results.push({ symbol: state.symbol, result });
    } catch (e) {
      console.error(`[agent] error for ${tokenAddr}:`, e.message);
      results.push({ symbol: tokenAddr.slice(0, 8), result: { done: false, reason: e.message } });
    }
  }

  saveAgentState(agentSt);

  await report(results);
}

async function main() {
  console.log('[agent] MemeBounty AI Agent v2 starting...');
  console.log(`[agent] wallet:  ${wallet.address}`);
  console.log(`[agent] tokens:  ${MANAGED_TOKENS.length ? MANAGED_TOKENS.join(', ') : '(none yet)'}`);
  console.log(`[agent] interval: ${INTERVAL_MS / 60000} min`);
  await runOnce();
  // 每次 runOnce 前先处理退款
async function mainLoop() { await refundExpiredFallbackTasks().catch(()=>{}); await runOnce(); }
setInterval(mainLoop, INTERVAL_MS);
}

main().catch(console.error);

// ══════════════════════════════════════════════
// X LAYER 双链支持
// ══════════════════════════════════════════════

const XLAYER_RPC      = process.env.XLAYER_RPC_URL || 'https://rpc.xlayer.tech';
const XLAYER_CONTRACT = process.env.XLAYER_CONTRACT;
const XLAYER_REGISTRY = process.env.XLAYER_REGISTRY || '0xCB778Ac6A811A2712764F2cee69748CaCb71b80f';

// X Layer provider + wallet（同一私钥，不同链）
let xlayerProvider, xlayerWallet, xlayerContract, xlayerRegistry;
function initXLayer() {
  try {
    xlayerProvider = new ethers.JsonRpcProvider(XLAYER_RPC);
    xlayerWallet   = new ethers.Wallet(process.env.PRIVATE_KEY, xlayerProvider);
    if (XLAYER_CONTRACT) {
      xlayerContract  = new ethers.Contract(XLAYER_CONTRACT, BOUNTY_ABI, xlayerWallet);
    }
    xlayerRegistry = new ethers.Contract(XLAYER_REGISTRY, REGISTRY_ABI, xlayerWallet);
    console.log('[xlayer] X Layer provider initialized');
  } catch (e) {
    console.warn('[xlayer] init failed:', e.message);
  }
}

// 获取 X Layer 活跃委托代币
function getXLayerTokens() {
  try {
    const jobsFile = path.join(__dirname, '..', 'agent-jobs.json');
    const jobs = JSON.parse(fs.readFileSync(jobsFile, 'utf8'));
    return jobs.filter(j => j.token && j.active && j.chain === 'xlayer').map(j => j.token.toLowerCase());
  } catch { return []; }
}

// X Layer observe（简化版：查任务数 + 链上状态）
async function observeXLayer(tokenAddr) {
  if (!xlayerContract) return null;
  try {
    const n = Number(await xlayerContract.nextTaskId().catch(() => 0n));
    let activeTasks = 0;
    for (let i = 0; i < n; i++) {
      try {
        const b = await xlayerContract.taskBase(i);
        if (b.active && b.targetToken.toLowerCase() === tokenAddr.toLowerCase()) activeTasks++;
      } catch {}
    }
    return { token: tokenAddr, activeTasks, chain: 'xlayer' };
  } catch (e) {
    console.warn('[xlayer] observe error:', e.message);
    return null;
  }
}

// X Layer 定时循环（每3分钟，独立于 BSC 循环）
async function runXLayerOnce() {
  const tokens = getXLayerTokens();
  if (!tokens.length) return;
  console.log(`[xlayer] checking ${tokens.length} tokens on X Layer`);
  for (const tok of tokens) {
    try {
      const state = await observeXLayer(tok);
      if (!state) continue;
      console.log(`[xlayer] token=${tok.slice(0,10)} activeTasks=${state.activeTasks}`);
      // X Layer 上活跃任务为0时尝试通过 registry 发任务
      if (state.activeTasks === 0 && xlayerRegistry) {
        try {
          // 查 X Layer registry job
          const jobs = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'agent-jobs.json'), 'utf8'));
          const job = jobs.find(j => j.token && j.token.toLowerCase() === tok && j.active && j.chain === 'xlayer');
          if (job && job.jobId != null) {
            const deadlineTs = BigInt(Math.floor(Date.now() / 1000) + 20 * 60); // 20 min
            const minAmt = BigInt('8888000000000000000000000');
            const taskParams = {
              targetToken: tok,
              taskType: 2, // free claim
              maxWinners: 5n,
              rewardPerWinner: ethers.parseEther('0.001'),
              deadlineTs,
              minTokenAmount: minAmt,
              minHoldSeconds: 0n,
              minBuyBNB: 0n,
              bountyContract: XLAYER_CONTRACT,
            };
            const tx = await xlayerRegistry.createTaskAndPay(BigInt(job.jobId), taskParams, { gasLimit: 500000n });
            console.log(`[xlayer] task created tx=${tx.hash}`);
            await axios.post('https://shuifenqian.xyz/api/log', {
              msg: `[X Layer] 任务已发布 TX: ${tx.hash.slice(0,12)}...`,
              tag: 'CREATE', symbol: tok.slice(0, 8),
              txHash: tx.hash,
            }).catch(() => {});
          }
        } catch (e) {
          console.warn('[xlayer] createTask error:', e.message.slice(0, 80));
        }
      }
    } catch (e) {
      console.warn('[xlayer] token error:', e.message);
    }
  }
}

// 初始化 X Layer 并启动双链循环
initXLayer();
if (getXLayerTokens().length > 0) {
  console.log('[agent] X Layer mode: dual-chain enabled');
  setInterval(() => runXLayerOnce().catch(console.error), INTERVAL_MS);
  runXLayerOnce().catch(console.error);
}
