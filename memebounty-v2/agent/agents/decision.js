/**
 * DecisionAgent — AI 推理决策者
 * 职责：读取 ObserverAgent 的信号，调用 LLM 推理，
 *       输出结构化决策写入 agent-shared.json
 * 不发交易，只做推理
 */
require('dotenv').config({ path: __dirname + '/../../backend/.env' });
const axios = require('axios');
const fs = require('fs');
const path = require('path');

const SHARED_FILE = path.join(__dirname, '../../agent-shared.json');
const LLM_URL   = 'https://code.newcli.com/codex/v1/chat/completions';
const LLM_MODEL = 'gpt-5.4';
const LLM_KEY   = process.env.OPENAI_API_KEY || 'sk-ant-oat01-biFe9ra5JZFx7RWA1_pFNjay2Vr3MOSOJuf9rxtdw5MTxP_-yggQmxZWsYuIgZfjr2vA3qgFBSz2ZmK83ZbAgvAZZR7mHAA';

function loadShared() {
  try { return JSON.parse(fs.readFileSync(SHARED_FILE, 'utf8')); } catch { return {}; }
}
function saveShared(d) {
  fs.writeFileSync(SHARED_FILE, JSON.stringify(d, null, 2));
}

// 规则引擎（无需 LLM 的快速决策）
function ruleEngine(bsc) {
  const bnbChg = bsc.bnbChg || 0;
  const obRatio = bsc.obRatio || 1;
  const fundRate = bsc.fundRate || 0;

  if (bnbChg < -8) return { action: 'CREATE', taskType: 1, reason: '恐慌防护', priority: 'HIGH', rewardMul: 2.0, persona: 'hunter' };
  if (bnbChg > 5)  return { action: 'CREATE', taskType: 0, reason: 'BNB上涨联动', priority: 'MED', rewardMul: 1.0, persona: 'herald' };
  if (obRatio < 0.6) return { action: 'CREATE', taskType: 1, reason: '买盘压制', priority: 'MED', rewardMul: 1.5, persona: 'hunter' };
  if (fundRate < -0.01) return { action: 'CREATE', taskType: 2, reason: '资金费负值抄底', priority: 'MED', rewardMul: 1.2, persona: 'strategist' };
  return null; // 需要 LLM
}

async function llmDecide(signals) {
  const prompt = `你是 Seki AI Agent，管理 BSC meme 代币激励任务。
当前信号：
- BNB 24h涨跌: ${signals.bnbChg?.toFixed(2)}%
- 资金费率: ${signals.fundRate?.toFixed(4)}
- 买卖盘比: ${signals.obRatio?.toFixed(2)}
- X Layer 活跃任务: ${signals.xlActiveTasks || 0}

输出JSON（只输出JSON）：{"action":"CREATE"|"WAIT","taskType":0|1|2,"rewardMul":1.0,"maxWinners":5,"deadlineMins":20,"reason":"...","persona":"hunter"|"strategist"|"herald"}`;
  try {
    const r = await axios.post(LLM_URL, {
      model: LLM_MODEL,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.3, max_tokens: 200, stream: false,
    }, { headers: { Authorization: `Bearer ${LLM_KEY}` }, timeout: 15000, responseType: 'text' });
    const raw = typeof r.data === 'string' ? r.data : JSON.stringify(r.data);
    const lines = raw.split('\n').filter(l => l.trim().startsWith('{') || l.includes('"action"'));
    for (const line of lines) {
      try { return JSON.parse(line.trim()); } catch {}
    }
    const m = raw.match(/\{[^{}]+\}/s);
    if (m) return JSON.parse(m[0]);
  } catch (e) {
    console.warn('[DecisionAgent] LLM error:', e.message.slice(0,60));
  }
  return { action: 'WAIT', reason: 'LLM unavailable', persona: 'strategist' };
}

async function decide() {
  const shared = loadShared();
  if (!shared.bsc) { console.log('[DecisionAgent] waiting for ObserverAgent...'); return; }
  if (Date.now() - (shared.lastObserve || 0) > 10 * 60 * 1000) {
    console.log('[DecisionAgent] signals stale, skipping');
    return;
  }

  console.log('[DecisionAgent] reasoning...');
  const bsc = shared.bsc;

  // 1. 先跑规则引擎（快速）
  let decision = ruleEngine(bsc);
  let source = 'rules';

  // 2. 规则未触发时调 LLM
  if (!decision) {
    decision = await llmDecide({ ...bsc, xlActiveTasks: shared.xlayer?.activeTasks || 0 });
    source = 'llm';
  }

  decision.decidedAt = Date.now();
  decision.source = source;
  decision.pending = true; // ExecutorAgent 消费后设为 false

  shared.decision = decision;
  shared.decisionAgent = { alive: true, lastRun: Date.now() };
  saveShared(shared);

  console.log(`[DecisionAgent] decision: ${decision.action} via ${source} — ${decision.reason}`);

  // 通知服务器记录日志
  await axios.post('https://shuifenqian.xyz/api/log', {
    msg: `[DecisionAgent] ${decision.action} — ${decision.reason} (${source})`,
    tag: decision.action === 'CREATE' ? 'DECIDE' : 'WAIT',
    symbol: 'AGENT',
    persona: decision.persona,
  }).catch(() => {});
}

const INTERVAL = parseInt(process.env.AGENT_INTERVAL_MIN || '3') * 60 * 1000 + 30000; // 比 Observer 晚30s
setTimeout(() => {
  decide().catch(console.error);
  setInterval(() => decide().catch(console.error), INTERVAL);
}, 35000); // 等 Observer 先跑
console.log('[DecisionAgent] started, will begin in 35s');
