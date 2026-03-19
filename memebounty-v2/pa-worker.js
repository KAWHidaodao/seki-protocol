// Seki Personal Agent - Web Worker
// 在后台线程运行，不阻塞 UI
// 只扫描 taskType=2 (早鸟/EarlyBird) 任务，调用 claimEarlyBird(id)
// 用户需先持有 >= minTokenAmount 的目标代币

const PA_MB = '0xe2D7f97A6C63ADcAf14Fe70B8bdAD022349A9655';
const PA_RPC = 'https://bsc-dataseed.binance.org/';

let paStrategy = {};
let paDayCount = 0;
let paDayDate = '';
let paRunning = false;
let paTimer = null;

// JSON-RPC fetch
async function rpc(method, params) {
  const res = await fetch(PA_RPC, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params })
  });
  const j = await res.json();
  if (j.error) throw new Error(j.error.message);
  return j.result;
}

function pad64(n) { return n.toString(16).padStart(64, '0'); }
function hex2n(hex) { return BigInt('0x' + (hex || '0').replace('0x', '').slice(0, 64)); }

// eth_call
async function call(data) {
  return await rpc('eth_call', [{ to: PA_MB, data }, 'latest']);
}

// nextTaskId() -> 0xfdc3d8d7
async function getNextTaskId() {
  const r = await call('0xfdc3d8d7');
  return Number(hex2n(r));
}

// hasClaimed(uint256,address) -> 0x873f6f9e
async function hasClaimed(taskId, addr) {
  const data = '0x873f6f9e' + pad64(taskId) + addr.replace('0x', '').padStart(64, '0');
  const r = await call(data);
  return hex2n(r) !== 0n;
}

// taskBase(uint256) -> 0x595f62a4
// returns: creator,targetToken,maxWinners,rewardPerWinner,totalReward,claimedCount,deadline,taskType,rewardType,active
async function getTaskBase(id) {
  const data = '0x595f62a4' + pad64(id);
  const r = await call(data);
  if (!r || r === '0x') return null;
  const hex = r.replace('0x', '');
  // slot offsets (each 32 bytes = 64 hex chars)
  // 0: creator (address, right-padded in 32 bytes)
  // 1: targetToken
  // 2: maxWinners
  // 3: rewardPerWinner
  // 4: totalReward
  // 5: claimedCount
  // 6: deadline
  // 7: taskType
  // 8: rewardType
  // 9: active (bool)
  const sl = (i) => hex.slice(i * 64, (i + 1) * 64);
  return {
    creator: '0x' + sl(0).slice(24),
    targetToken: '0x' + sl(1).slice(24),
    maxWinners: Number(hex2n('0x' + sl(2))),
    rewardPerWinner: hex2n('0x' + sl(3)),
    claimedCount: Number(hex2n('0x' + sl(5))),
    deadline: Number(hex2n('0x' + sl(6))),
    taskType: Number(hex2n('0x' + sl(7))),
    active: hex2n('0x' + sl(9)) !== 0n,
  };
}

// taskCond(uint256) -> 0x432ba4d5
// returns: rewardToken,minTokenAmount,minHoldSeconds,minBuyBNB,minReferrals
async function getTaskCond(id) {
  const data = '0x432ba4d5' + pad64(id);
  const r = await call(data);
  if (!r || r === '0x') return null;
  const hex = r.replace('0x', '');
  const sl = (i) => hex.slice(i * 64, (i + 1) * 64);
  return {
    minTokenAmount: hex2n('0x' + sl(1)),
  };
}

// balanceOf(address) on a token
async function tokenBalance(tokenAddr, walletAddr) {
  const data = '0x70a08231' + walletAddr.replace('0x', '').padStart(64, '0');
  const res = await fetch(PA_RPC, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0', id: 1, method: 'eth_call',
      params: [{ to: tokenAddr, data }, 'latest']
    })
  });
  const j = await res.json();
  return j.result ? hex2n(j.result) : 0n;
}

// 扫描早鸟任务
async function autoScan() {
  if (!paRunning) return;
  if (!paStrategy.autoExecute) return;

  const today = new Date().toDateString();
  if (paDayDate !== today) { paDayDate = today; paDayCount = 0; }
  if (paDayCount >= (paStrategy.maxPerDay || 10)) {
    postMessage({ type: 'log', msg: '今日执行上限已达，等待明天重置' });
    return;
  }

  postMessage({ type: 'scanning', msg: '扫描早鸟任务中...' });

  try {
    const nextId = await getNextTaskId();
    if (!nextId) { postMessage({ type: 'idle', msg: '链上暂无任务' }); return; }

    const minR = parseFloat(paStrategy.minReward || '0');
    const now = Math.floor(Date.now() / 1000);

    for (let i = nextId - 1; i >= Math.max(0, nextId - 20); i--) {
      if (paDayCount >= (paStrategy.maxPerDay || 10)) break;

      try {
        const b = await getTaskBase(i);
        if (!b) continue;

        // 只处理早鸟任务 (taskType=2)
        if (b.taskType !== 2) continue;
        if (!b.active) continue;
        if (b.deadline <= now) continue;
        if (b.claimedCount >= b.maxWinners) continue;

        // 检查奖励是否达到策略最低
        const rwd = Number(b.rewardPerWinner) / 1e18;
        if (rwd < minR) continue;

        // 通知主线程签名执行
        postMessage({
          type: 'need_sign',
          taskId: i,
          reward: rwd.toFixed(4),
          taskType: '早鸟',
          targetToken: b.targetToken,
          minTokenAmount: b.maxWinners > 0
            ? String(hex2n('0x')) : '0', // will be filled by main thread check
          deadline: b.deadline,
        });

        paDayCount++;
        // 等主线程处理（2s防止重复）
        await new Promise(r => setTimeout(r, 2000));

      } catch (e) { /* 单任务失败跳过 */ }
    }

    postMessage({ type: 'done', todayCount: paDayCount, max: paStrategy.maxPerDay || 10 });
  } catch (e) {
    postMessage({ type: 'error', msg: e.message });
  }
}

self.onmessage = function (e) {
  const { action, strategy } = e.data;

  if (action === 'start') {
    paStrategy = strategy || {};
    paRunning = true;
    paDayCount = 0;
    paDayDate = '';
    postMessage({ type: 'started' });
    autoScan();
    paTimer = setInterval(autoScan, 3 * 60 * 1000);
  }

  if (action === 'stop') {
    paRunning = false;
    if (paTimer) { clearInterval(paTimer); paTimer = null; }
    postMessage({ type: 'stopped' });
  }

  if (action === 'update_strategy') {
    paStrategy = e.data.strategy;
    postMessage({ type: 'strategy_updated' });
  }

  if (action === 'scan_now') {
    autoScan();
  }
};
