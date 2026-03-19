function applyWorld(chainKey) {
  const w = WORLD[chainKey] || WORLD.bsc;
  const el = (id) => document.getElementById(id);
  const isXL = chainKey === 'xlayer';

  // ── 1. 强制背景色 ──
  document.body.style.cssText = isXL
    ? 'background:#08050f !important;background-image:radial-gradient(ellipse 100% 60% at 50% -10%,rgba(88,28,220,.3) 0%,transparent 65%),radial-gradient(ellipse 60% 40% at 90% 100%,rgba(99,58,237,.15) 0%,transparent 60%) !important;color:#f0f0f8;font-family:-apple-system,BlinkMacSystemFont,"Inter",sans-serif;-webkit-font-smoothing:antialiased;line-height:1.5;min-height:100vh'
    : 'background:#0d0d1a;background-image:radial-gradient(ellipse 80% 50% at 20% 0%,rgba(124,58,237,.2) 0%,transparent 60%),radial-gradient(ellipse 60% 40% at 80% 100%,rgba(59,130,246,.12) 0%,transparent 60%);color:#f0f0f8;font-family:-apple-system,BlinkMacSystemFont,"Inter",sans-serif;-webkit-font-smoothing:antialiased;line-height:1.5;min-height:100vh';

  // ── 2. 导航栏强制样式 ──
  const nav = document.querySelector('.nav');
  if (nav) {
    nav.style.background = isXL ? 'rgba(4,2,14,.97)' : 'rgba(13,13,26,.9)';
    nav.style.borderBottom = isXL ? '2px solid rgba(99,58,237,.6)' : '1px solid rgba(245,158,11,.2)';
  }

  // ── 3. CSS 变量覆盖（全局主色切换）──
  const root = document.documentElement;
  if (isXL) {
    root.style.setProperty('--p', '#818cf8');
    root.style.setProperty('--p2', '#4f46e5');
    root.style.setProperty('--pl', 'rgba(129,140,248,.12)');
  } else {
    root.style.setProperty('--p', '#a78bfa');
    root.style.setProperty('--p2', '#7c3aed');
    root.style.setProperty('--pl', 'rgba(167,139,250,.12)');
  }

  // ── 4. URL hash ──
  history.replaceState(null, '', isXL ? '#xlayer' : '#bsc');

  // ── 5. Logo 副标题 ──
  const logosub = document.querySelector('.nav-logo-sub');
  if (logosub) {
    logosub.textContent = isXL ? 'X LAYER' : 'AI Agent';
    logosub.style.color = isXL ? '#818cf8' : '';
    logosub.style.background = isXL ? 'rgba(99,58,237,.15)' : '';
    logosub.style.padding = isXL ? '2px 6px' : '';
    logosub.style.borderRadius = isXL ? '4px' : '';
  }

  // ── 6. 导航按钮 ──
  const navL = el('nav-launch'); if (navL) navL.style.display = isXL ? 'none' : '';
  const navA = el('nav-apps');   if (navA) navA.style.display = isXL ? '' : 'none';

  // ── 7. Hero 文案（淡入）──
  const fadeEls = ['hero-line1','hero-line2','hero-desc','hero-tagline','hero-badge-role','hero-taxpool-key'];
  fadeEls.forEach(id => { const e=el(id); if(e){e.style.transition='none';e.style.opacity='0';} });
  setTimeout(() => {
    if (el('hero-line1')) el('hero-line1').textContent = w.line1;
    if (el('hero-line2')) el('hero-line2').innerHTML = w.line2;
    if (el('hero-tagline')) el('hero-tagline').textContent = w.tagline;
    if (el('hero-desc')) el('hero-desc').innerHTML = w.desc;
    if (el('hero-badge-role')) el('hero-badge-role').textContent = w.badgeRole;
    if (el('hero-taxpool-key')) el('hero-taxpool-key').textContent = w.taxpoolKey;
    fadeEls.forEach(id => { const e=el(id); if(e){e.style.transition='opacity .35s ease';e.style.opacity='1';} });
  }, 80);

  // ── 8. CTA 按钮 ──
  const btn = el('hero-btn-main');
  if (btn) {
    btn.onclick = isXL
      ? () => G('apps', el('nav-apps'))
      : () => G('faoxing', el('nav-launch'));
    btn.style.cssText = isXL
      ? 'display:inline-flex;align-items:center;gap:8px;padding:14px 28px;background:linear-gradient(135deg,#4f46e5,#3730a3);color:#fff;border:none;border-radius:14px;font-size:15px;font-weight:700;cursor:pointer;font-family:inherit;box-shadow:0 4px 24px rgba(79,70,229,.5)'
      : 'display:inline-flex;align-items:center;gap:8px;padding:14px 28px;background:linear-gradient(135deg,#7c3aed,#6d28d9);color:#fff;border:none;border-radius:14px;font-size:15px;font-weight:700;cursor:pointer;font-family:inherit;box-shadow:0 4px 24px rgba(124,58,237,.4)';
  }
  if (el('hero-btn-text')) el('hero-btn-text').textContent = w.btnText;

  // ── 9. chain-switcher ──
  const sw = el('chain-switcher');
  if (sw) {
    sw.style.borderColor = isXL ? 'rgba(99,58,237,.6)' : 'rgba(245,158,11,.4)';
    sw.style.background = isXL ? 'rgba(79,70,229,.1)' : 'rgba(255,255,255,.05)';
  }

  // ── 10. 热门页切换 ──
  const xlPanel = el('xl-ecosystem-panel');
  const hotList = el('hot-page-list');
  const hotFilters = el('hot-filters');
  if (xlPanel) xlPanel.style.display = isXL ? 'block' : 'none';
  if (hotList) hotList.style.display = isXL ? 'none' : 'grid';
  if (hotFilters) hotFilters.style.display = isXL ? 'none' : 'flex';
  if (isXL) loadXLayerStats();

  // ── 11. 应用页链标签 ──
  const acl = el('apps-chain-label'); if (acl) acl.textContent = isXL ? 'X Layer' : 'BSC';
}

async function loadXLayerStats() {
  try {
    const xlP = new ethers.JsonRpcProvider('https://rpc.xlayer.tech');
    const mbC = new ethers.Contract('0xBce8A6124255c0bB1e65DF6bb72A53833261455f',
      ['function nextTaskId() view returns (uint256)'], xlP);
    const taskN = Number(await mbC.nextTaskId().catch(()=>0n));
    const e1=document.getElementById('xl-task-count'); if(e1) e1.textContent=taskN;
    const srC = new ethers.Contract('0x72F4eA26f2f7338C97618E623be420d840FFb7Bf',
      ['function nextServiceId() view returns (uint256)',
       'function nextTaskId() view returns (uint256)',
       'function nextProposalId() view returns (uint256)'], xlP);
    const [sN,bN,dN] = await Promise.all([
      srC.nextServiceId().catch(()=>0n),
      srC.nextTaskId().catch(()=>0n),
      srC.nextProposalId().catch(()=>0n),
    ]);
    const e2=document.getElementById('xl-service-count');if(e2)e2.textContent=Number(sN);
    const e3=document.getElementById('xl-bounty-count');if(e3)e3.textContent=Number(bN);
    const e4=document.getElementById('xl-proposal-count');if(e4)e4.textContent=Number(dN);
  } catch(e){console.warn('xlStats:',e.message);}
}

function switchChain(chainKey) {
  // X Layer 跳转到独立页面
  if (chainKey === 'xlayer') { location.href = '/xlayer'; return; }
  if (chainKey === 'bsc' && location.pathname === '/xlayer') { location.href = '/'; return; }
  currentChain = CHAINS[chainKey];
  // 更新全局变量
  window.CONTRACT = currentChain.contract;
  window.REGISTRY = currentChain.registry;
  window.RPC = currentChain.rpc;
  // 更新按钮样式
  const chainColors = {
    bsc: { bg:'rgba(245,158,11,.9)', color:'#000', border:'rgba(245,158,11,.4)' },
    xlayer: { bg:'rgba(99,58,237,.85)', color:'#fff', border:'rgba(99,58,237,.4)' }
  };
  ['bsc','xlayer'].forEach(k => {
    const btn = document.getElementById('chain-'+k);
    if(!btn) return;
    if(k === chainKey) {
      const c = chainColors[k];
      btn.style.background = c.bg; btn.style.color = c.color;
    } else {
      btn.style.background = 'transparent'; btn.style.color = 'var(--tx3)';
    }
  });
  // 更新切换器边框颜色
  const sw = document.getElementById('chain-switcher');
  if(sw) sw.style.borderColor = chainColors[chainKey].border;
  // 更新导航栏整体色调指示
  const nav = document.querySelector('.nav');
  if(nav) {
    if(chainKey==='xlayer') {
      nav.style.borderBottom = '1px solid rgba(99,58,237,.25)';
    } else {
      nav.style.borderBottom = '1px solid rgba(245,158,11,.2)';
    }
  }
  // 提示切链
  if(typeof window.ethereum !== 'undefined') {
    window.ethereum.request({
      method:'wallet_switchEthereumChain',
      params:[{chainId:'0x'+currentChain.id.toString(16)}]
    }).catch(async err => {
      if(err.code===4902) {
        // 添加网络
        await window.ethereum.request({method:'wallet_addEthereumChain', params:[{
          chainId:'0x'+currentChain.id.toString(16),
          chainName:currentChain.name,
          nativeCurrency:{name:currentChain.symbol,symbol:currentChain.symbol,decimals:18},
          rpcUrls:[currentChain.rpc],
          blockExplorerUrls:[currentChain.explorer]
        }]});
      }
    });
  }
  toast('已切换到 '+currentChain.name, 's');
  // 刷新价格和任务列表
  try{loadBnbPrice();}catch(e){}
  // 重新初始化合约连接（切链后用新 RPC + 新合约地址）
  try{
    const newP = new ethers.JsonRpcProvider(currentChain.rpc);
    roCon = new ethers.Contract(currentChain.contract, ABI, newP);
    if(sign) con = new ethers.Contract(currentChain.contract, ABI, sign);
  }catch(e){}
  setTimeout(()=>{ try{loadAll();}catch(e){} }, 500);
  // 发币页：X Layer 不支持
  const launchWarn = document.getElementById('xlayer-launch-warn');
  if(launchWarn) launchWarn.style.display = currentChain.id===196 ? 'block' : 'none';
}

function G(id,el){
 var all=document.querySelectorAll('.pw,.page');
 all.forEach(p=>{p.style.display='none';});
 document.querySelectorAll('.nl').forEach(a=>a.classList.remove('on'));
 var pg=document.getElementById('page-'+id);
 if(pg){
   pg.style.cssText='display:block !important;visibility:visible !important;height:auto !important;min-height:100px !important;';
 }
 if(el)el.classList.add('on');
 // 延迟调用副作用，避免崩溃影响页面显示
 setTimeout(function(){
  try{if(id==='my'){loadMy();loadMyDelegations();}}catch(e){}
  try{if(id==='square'){loadDash();loadJobMonitor();startSSE();loadMarketSentiment();}}catch(e){}
  try{if(id==='square')setTimeout(loadAgentReport,500);}catch(e){}
  try{if(id==='delegate')loadDelegations();}catch(e){}
  try{if(id==='hot')loadHotPage();}catch(e){}
  try{if(id==='wendang'){docTab('logic',document.getElementById('dtag-logic'));loadOnchainDecisions();}}catch(e){}
  try{if(id==='apps'){const acl=document.getElementById('apps-chain-label');if(acl)acl.textContent=currentChain?currentChain.name:'BSC';}}catch(e){}
 },0);
}

function setF(f,el){
 curF=f;document.querySelectorAll('.ft,.hf,.hf2').forEach(b=>b.classList.remove('on'));el.classList.add('on');render();
}

// TOAST
function toast(msg,type='i'){
 const w=document.getElementById('tw');
 const d=document.createElement('div');d.className='toast '+type;
 const ic={s:'✓',e:'✗',i:'◆'};
 d.innerHTML='<span style="color:'+(type==='s'?'var(--gr)':type==='e'?'var(--re)':'var(--p)')+'">'+ic[type]+'</span>'+escH(msg);
 w.appendChild(d);setTimeout(()=>d.remove(),4500);
}

initRO();

let selectedAgent = null;
const AGENT_DATA = {
 hunter: {
 name: '猎手 Hunter',
 avatar: '🔴',
 avatarBg: 'linear-gradient(135deg,#dc2626,#7f1d1d)',
 tagline: '激进型 · 专打抛压 · 窗口5–20分钟',
 },
 strategist: {
 name: '军师 Strategist',
 avatar: '🟡',
 avatarBg: 'linear-gradient(135deg,#d97706,#78350f)',
 tagline: '稳健型 · 数据驱动 · 窗口20–45分钟',
 },
 herald: {
 name: '传令官 Herald',
 avatar: '🟢',
 avatarBg: 'linear-gradient(135deg,#059669,#064e3b)',
 tagline: '扩张型 · 冷启动专家 · 拉新第一',
 },
 custom: {
 name: '自定义 Custom',
 avatar: '',
 avatarBg: 'linear-gradient(135deg,#0f766e,#0369a1)',
 tagline: '手动配置任务参数，精确控制每个门槛',
 }
};
function selectAgent(type, card) {
 selectedAgent = type;
 document.querySelectorAll('.agent-card').forEach(c => c.classList.remove('selected'));
 card.classList.add('selected');
 const d = AGENT_DATA[type];
 if(!d) return;
 document.getElementById('df-avatar').style.background = d.avatarBg;
 document.getElementById('df-avatar').textContent = d.avatar;
 document.getElementById('df-name').textContent = d.name;
 document.getElementById('df-tagline').textContent = d.tagline;
 document.getElementById('df-btn-name').textContent = d.name.split(' ')[0];
 const form = document.getElementById('delegate-form');
 form.style.display = 'block';
 const isCustom = type === 'custom';
 const sw = document.getElementById('strat-box-wrap');
 const mp = document.getElementById('manual-panel');
 const mt = document.getElementById('mode-toggle');
 if(sw) sw.style.display = isCustom ? 'none' : '';
 if(mp) mp.style.display = isCustom ? '' : 'none';
 if(mt) mt.style.display = isCustom ? 'none' : '';
 setTimeout(()=>form.scrollIntoView({behavior:'smooth',block:'start'}),100);
}

function checkMBTHolding(){
 // 仅在有 officialToken 且连接钱包时检查
 if(!addr) return;
 // 暂时只做前端提示，合约层会做真正的检查
 const tip = document.getElementById('mbt-check');
 if(tip) tip.style.display = 'none'; // 等 MBT 发行后再启用
}
function clearAgent() {
 selectedAgent = null;
 document.querySelectorAll('.agent-card').forEach(c => c.classList.remove('selected'));
 document.getElementById('delegate-form').style.display = 'none';
}

// ── Personal Agent JS ──────────────────────────────────────────
const PA_MB = '0xea43a24a1baefb89494126c12fe8921b5b8e3d8d';
const PA_RPC = 'https://bsc-dataseed.binance.org/';
const PA_ABI = [
  'function nextTaskId() view returns (uint256)',
  'function taskBase(uint256) view returns (address,address,uint256,uint256,uint256,uint256,uint256,uint8,uint8,bool)',
  'function taskCond(uint256) view returns (address,uint256,uint256,uint256,uint256)',
  'function claimEarlyBird(uint256)',
  'function hasClaimed(uint256,address) view returns (bool)',
];

let paW = null;      // ethers.Wallet
let paWorker = null; // Web Worker
let paTmr = null;    // fallback interval

function paNot(msg, type) {
  const el = document.getElementById('pa-smsg');
  if (!el) return;
  el.textContent = msg;
  el.style.cssText = 'display:block;margin-top:8px;font-size:12px;padding:6px 10px;border-radius:6px;' +
    (type === 'e' ? 'background:rgba(248,113,113,.1);color:#f87171;' : 'background:rgba(52,211,153,.08);color:#34d399;');
  setTimeout(() => { el.style.display = 'none'; }, 4000);
}

function paXorKey() { return 'seki_pa_xor_2024'; }
function paEncrypt(str) {
  const k = paXorKey(); let r = '';
  for (let i = 0; i < str.length; i++) r += String.fromCharCode(str.charCodeAt(i) ^ k.charCodeAt(i % k.length));
  return btoa(r);
}
function paDecrypt(b64) {
  try { const k = paXorKey(); const str = atob(b64); let r = '';
    for (let i = 0; i < str.length; i++) r += String.fromCharCode(str.charCodeAt(i) ^ k.charCodeAt(i % k.length));
    return r; } catch(e) { return null; }
}

function paShowUnlocked() {
  document.getElementById('pa-wallet-locked').style.display = 'none';
  document.getElementById('pa-wallet-unlocked').style.display = 'block';
  document.getElementById('pa-addr').textContent = paW.address.slice(0,6) + '...' + paW.address.slice(-4);
  paRefBal();
}

window.paCreate = function() {
  const e = window.ethers;
  if (!e) { paNot('请等待 ethers.js 加载', 'e'); return; }
  const w = e.Wallet.createRandom();
  const enc = paEncrypt(w.privateKey);
  localStorage.setItem('seki_pa_wallet', enc);
  paW = w;
  paShowUnlocked();
  paNot('新钱包已创建并加密保存');
};

window.paImport = function() {
  const pk = prompt('输入私钥（0x...）：');
  if (!pk) return;
  try {
    const e = window.ethers;
    const w = new e.Wallet(pk.trim());
    localStorage.setItem('seki_pa_wallet', paEncrypt(w.privateKey));
    paW = w;
    paShowUnlocked();
    paNot('私钥已导入');
  } catch(err) { paNot('私钥无效：' + err.message, 'e'); }
};

window.paUnlock = function() {
  const enc = localStorage.getItem('seki_pa_wallet');
  if (!enc) { paNot('未找到保存的钱包，请先创建', 'e'); return; }
  const pk = paDecrypt(enc);
  if (!pk) { paNot('解密失败', 'e'); return; }
  try {
    paW = new window.ethers.Wallet(pk);
    paShowUnlocked();
    paNot('钱包已解锁');
    paLoadStrat();
  } catch(e) { paNot('解锁失败：' + e.message, 'e'); }
};

window.paLock = function() {
  paW = null;
  paStop();
  document.getElementById('pa-wallet-locked').style.display = 'block';
  document.getElementById('pa-wallet-unlocked').style.display = 'none';
  paNot('钱包已锁定');
};

window.paExport = function() {
  if (!paW) { paNot('请先解锁钱包', 'e'); return; }
  if (!confirm('确认导出私钥？请妥善保管，不要泄露！')) return;
  prompt('你的私钥（请立即复制保存）：', paW.privateKey);
};

window.paRefBal = async function() {
  if (!paW) return;
  try {
    const res = await fetch(PA_RPC, { method: 'POST', headers: {'Content-Type':'application/json'},
      body: JSON.stringify({jsonrpc:'2.0',id:1,method:'eth_getBalance',params:[paW.address,'latest']}) });
    const j = await res.json();
    const bnb = (parseInt(j.result, 16) / 1e18).toFixed(4);
    const el = document.getElementById('pa-bal');
    if (el) el.textContent = bnb + ' BNB';
  } catch(e) {}
};

window.paSave = function() {
  const strat = {
    autoExecute: document.getElementById('pa-auto')?.checked || false,
    taskTypes: [0,1,2].filter(t => document.getElementById('pa-t'+t)?.checked),
    minReward: document.getElementById('pa-minr')?.value || '0',
    maxPerDay: parseInt(document.getElementById('pa-maxd')?.value) || 10,
    tokenWhitelist: []
  };
  localStorage.setItem('seki_pa_strategy', JSON.stringify(strat));
  paNot('策略已保存');
  if (strat.autoExecute && paW) paStart();
};

window.paLoadStrat = function() {
  try {
    const s = JSON.parse(localStorage.getItem('seki_pa_strategy') || '{}');
    const tog = document.getElementById('pa-auto'); if (tog) tog.checked = !!s.autoExecute;
    [0,1,2].forEach(t => { const cb = document.getElementById('pa-t'+t); if (cb) cb.checked = !s.taskTypes || s.taskTypes.includes(t); });
    const mr = document.getElementById('pa-minr'); if (mr && s.minReward) mr.value = s.minReward;
    const md = document.getElementById('pa-maxd'); if (md && s.maxPerDay) md.value = s.maxPerDay;
  } catch(e) {}
};

window.paOnTog = function() {
  const on = document.getElementById('pa-auto')?.checked;
  if (on && paW) { paStart(); } else { paStop(); }
};

window.paStart = function() {
  if (!paW) { paNot('请先解锁钱包', 'e'); return; }
  const strat = JSON.parse(localStorage.getItem('seki_pa_strategy') || '{}');
  const startBtn = document.getElementById('pa-start-btn');
  const stopBtn = document.getElementById('pa-stop-btn');
  if (startBtn) startBtn.style.display = 'none';
  if (stopBtn) stopBtn.style.display = '';

  if (typeof Worker !== 'undefined') {
    if (paWorker) { paWorker.terminate(); }
    paWorker = new Worker('/pa-worker.js');
    paWorker.onmessage = paWorkerMsg;
    paWorker.onerror = e => paNot('Worker 错误：' + e.message, 'e');
    paWorker.postMessage({ action: 'start', strategy: strat });
    paNot('执行器已在后台启动（Web Worker）');
  } else {
    paNot('执行器已启动（轮询模式）');
    paAutoRun();
    paTmr = setInterval(paAutoRun, 3 * 60 * 1000);
  }
};

window.paStop = function() {
  if (paWorker) { paWorker.postMessage({ action: 'stop' }); paWorker.terminate(); paWorker = null; }
  if (paTmr) { clearInterval(paTmr); paTmr = null; }
  const startBtn = document.getElementById('pa-start-btn');
  const stopBtn = document.getElementById('pa-stop-btn');
  if (startBtn) startBtn.style.display = '';
  if (stopBtn) stopBtn.style.display = 'none';
  paNot('执行器已停止');
};

function paWorkerMsg(e) {
  const { type, msg, taskId, reward, taskType } = e.data;
  if (type === 'need_sign') {
    paWorkerSign(taskId, reward);
  } else if (type === 'log' || type === 'scanning' || type === 'done' || type === 'idle') {
    console.log('[PA]', msg || JSON.stringify(e.data));
  } else if (type === 'error') {
    paNot('执行器：' + msg, 'e');
  }
}

window.paWorkerSign = async function(taskId, reward) {
  if (!paW) return;
  try {
    const e = window.ethers;
    const provider = new e.JsonRpcProvider(PA_RPC);
    const wallet = paW.connect(provider);
    const con = new e.Contract(PA_MB, PA_ABI, wallet);
    const tx = await con.claimEarlyBird(taskId);
    const receipt = await tx.wait();
    paAddH({ taskId, reward, tx: tx.hash, status: 'ok', time: Date.now() });
    paNot('✅ 任务 #' + taskId + ' 执行成功，奖励 ' + reward + ' BNB');
  } catch(err) {
    paAddH({ taskId, reward, tx: '', status: 'fail', msg: err.message, time: Date.now() });
    paNot('任务 #' + taskId + ' 失败：' + err.message, 'e');
  }
};

window.paAutoRun = async function() {
  if (!paW) return;
  const strat = JSON.parse(localStorage.getItem('seki_pa_strategy') || '{}');
  if (!strat.autoExecute) return;
  try {
    const res = await fetch(PA_RPC, { method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({jsonrpc:'2.0',id:1,method:'eth_call',params:[{to:PA_MB,data:'0xfdc3d8d7'},'latest']}) });
    const j = await res.json();
    const nextId = parseInt(j.result, 16);
    if (!nextId) return;
    const now = Math.floor(Date.now()/1000);
    for (let i = nextId-1; i >= Math.max(0, nextId-20); i--) {
      await paWorkerSign(i, '?');
    }
  } catch(e) { console.error('[PA autorun]', e); }
};

window.paAddH = function(item) {
  const h = JSON.parse(localStorage.getItem('seki_pa_history') || '[]');
  h.unshift(item);
  if (h.length > 50) h.splice(50);
  localStorage.setItem('seki_pa_history', JSON.stringify(h));
  paRenderHist();
};

window.paClearH = function() {
  localStorage.removeItem('seki_pa_history');
  paRenderHist();
};

function paRenderHist() {
  const el = document.getElementById('pa-hist');
  if (!el) return;
  const h = JSON.parse(localStorage.getItem('seki_pa_history') || '[]');
  if (!h.length) { el.innerHTML = '<div style="font-size:12px;color:var(--tx3);text-align:center;padding:20px">暂无记录</div>'; return; }
  el.innerHTML = h.slice(0,20).map(item => `<div class="pa-hist-item">
    <span style="color:${item.status==='ok'?'#34d399':'#f87171'}">${item.status==='ok'?'✅':'❌'}</span>
    任务#${item.taskId} · ${item.reward} BNB
    ${item.tx ? `· <a href="https://bscscan.com/tx/${item.tx}" target="_blank" style="color:var(--p)">TX↗</a>` : item.msg||''}
    <span style="color:var(--tx3);float:right">${new Date(item.time).toLocaleTimeString()}</span>
  </div>`).join('');
}

window.paLoadTasks = async function() {
  const el = document.getElementById('pa-tasks');
  if (!el) return;
  el.textContent = '加载中...';
  try {
    const res = await fetch(PA_RPC, { method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({jsonrpc:'2.0',id:1,method:'eth_call',params:[{to:PA_MB,data:'0xfdc3d8d7'},'latest']}) });
    const j = await res.json();
    const nextId = parseInt(j.result || '0', 16);
    if (!nextId) { el.textContent = '链上暂无任务'; return; }
    const strat = JSON.parse(localStorage.getItem('seki_pa_strategy') || '{}');
    const now = Math.floor(Date.now()/1000);
    let html = '';
    for (let i = nextId-1; i >= Math.max(0, nextId-10); i--) {
      try {
        const r = await fetch(PA_RPC, { method:'POST', headers:{'Content-Type':'application/json'},
          body: JSON.stringify({jsonrpc:'2.0',id:1,method:'eth_call',params:[{to:PA_MB,data:'0x595f62a4'+i.toString(16).padStart(64,'0')},'latest']}) });
        const rj = await r.json();
        if (!rj.result || rj.result === '0x') continue;
        const hex = rj.result.replace('0x','');
        const sl = n => hex.slice(n*64,(n+1)*64);
        const active = BigInt('0x'+sl(9)) !== 0n;
        const deadline = Number(BigInt('0x'+sl(6)));
        const taskType = Number(BigInt('0x'+sl(7)));
        const claimedCount = Number(BigInt('0x'+sl(5)));
        const maxWinners = Number(BigInt('0x'+sl(2)));
        const rewardPerWinner = Number(BigInt('0x'+sl(3))) / 1e18;
        if (!active || deadline < now) continue;
        const types = ['持仓','交互','早鸟'];
        const colors = ['#a78bfa','#34d399','#f59e0b'];
        const match = strat.taskTypes ? strat.taskTypes.includes(taskType) : true;
        html += `<div style="padding:8px 0;border-bottom:1px solid rgba(255,255,255,.06);font-size:12px">
          <span style="color:${colors[taskType]||'var(--p)'}">${types[taskType]||'未知'}</span>
          任务#${i} · <b>${rewardPerWinner.toFixed(4)} BNB</b> · ${claimedCount}/${maxWinners}名额
          ${match ? '<span style="color:#34d399;font-size:10px"> ✓策略匹配</span>' : ''}
          <span style="color:var(--tx3);float:right">${Math.round((deadline-now)/60)}分钟后截止</span>
        </div>`;
      } catch(e) {}
    }
    el.innerHTML = html || '暂无活跃任务';
  } catch(e) { el.textContent = '加载失败：' + e.message; }
};

// AI 策略解析
window._paAiStrat = null;
window.paAiParse = async function() {
  const inp = document.getElementById('pa-ai-inp');
  const btn = document.getElementById('pa-ai-btn');
  const loading = document.getElementById('pa-ai-loading');
  const res = document.getElementById('pa-ai-result');
  const txt = document.getElementById('pa-ai-text');
  if (!inp || !inp.value.trim()) { paNot('请输入策略描述', 'e'); return; }
  btn.disabled = true; if(loading) loading.style.display = '';
  try {
    const sysPrompt = '你是 Seki AI Agent 策略解析器。用户描述策略，你必须返回：第一行中文摘要，然后一个JSON代码块。JSON字段：autoExecute(bool),taskTypes(array of 0/1/2),minReward(string, BNB数量),maxPerDay(int),tokenWhitelist(array)。只返回摘要+JSON，不要其他内容。';
    const resp = await fetch('/api/chat', { method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ messages: [{role:'system',content:sysPrompt},{role:'user',content:inp.value}] }) });
    let fullText = '';
    const reader = resp.body.getReader();
    while (true) {
      const {done, value} = await reader.read();
      if (done) break;
      const lines = new TextDecoder().decode(value).split('\n');
      for (const line of lines) {
        if (!line.startsWith('data:')) continue;
        const d = line.slice(5).trim();
        if (d === '[DONE]') break;
        try { const j = JSON.parse(d); fullText += j.choices?.[0]?.delta?.content || ''; } catch(e) {}
      }
    }
    // 解析 JSON
    let s = null;
    const m1 = fullText.match(/```(?:json)?\s*([\s\S]+?)```/);
    if (m1) { try { s = JSON.parse(m1[1]); } catch(e) {} }
    if (!s) { const m2 = fullText.match(/\{[\s\S]+\}/); if (m2) try { s = JSON.parse(m2[0]); } catch(e) {} }
    if (s) {
      if (!Array.isArray(s.taskTypes)) s.taskTypes = s.taskTypes ? [Number(s.taskTypes)] : [0,1,2];
      else s.taskTypes = s.taskTypes.map(Number);
      if (typeof s.minReward !== 'string') s.minReward = String(s.minReward || '0');
      s.maxPerDay = parseInt(s.maxPerDay) || 10;
      window._paAiStrat = s;
      const desc = fullText.split('\n')[0].replace(/[#*`]/g,'').trim() || '策略解析成功';
      const detail = '类型: ' + (s.taskTypes||[]).map(t=>['持仓','交互','早鸟'][t]||t).join('+') +
        ' · 最低: ' + s.minReward + 'BNB · 每日: ' + s.maxPerDay + '次';
      if (txt) txt.innerHTML = '<div style="color:#34d399;font-weight:700;margin-bottom:4px">' + desc + '</div>'
        + '<div style="font-size:11px;color:var(--tx3)">' + detail + '</div>'
        + '<div style="margin-top:8px;padding:6px 10px;background:rgba(52,211,153,.08);border:1px solid rgba(52,211,153,.2);border-radius:7px;font-size:11px;color:#34d399">✓ 策略已预览到下方表单，点「应用此策略」永久保存</div>';
      if (res) res.style.display = 'block';
      // 预填表单
      try {
        const tog = document.getElementById('pa-auto'); if(tog) tog.checked = !!s.autoExecute;
        [0,1,2].forEach(t => { const cb = document.getElementById('pa-t'+t); if(cb) cb.checked = !s.taskTypes || s.taskTypes.includes(t); });
        const mr = document.getElementById('pa-minr'); if(mr) mr.value = s.minReward;
        const md = document.getElementById('pa-maxd'); if(md) md.value = s.maxPerDay;
        const pcard = document.querySelector('.pa-card');
        if(pcard){pcard.style.border='1px solid rgba(52,211,153,.5)';pcard.style.boxShadow='0 0 16px rgba(52,211,153,.12)';}
        if(pcard) pcard.scrollIntoView({behavior:'smooth',block:'center'});
      } catch(ex) {}
    } else {
      if (txt) txt.innerHTML = '<div style="color:#f87171">解析失败，请换种说法</div><div style="font-size:10px;color:var(--tx3)">' + fullText.slice(0,80) + '</div>';
      if (res) res.style.display = 'block';
    }
  } catch(e) {
    if (txt) txt.innerHTML = '<div style="color:#f87171">请求失败：' + e.message + '</div>';
    if (res) res.style.display = 'block';
  }
  btn.disabled = false; if(loading) loading.style.display = 'none';
};

window.paApplyAi = function() {
  const s = window._paAiStrat;
  if (!s) { paNot('没有可用的 AI 策略', 'e'); return; }
  localStorage.setItem('seki_pa_strategy', JSON.stringify(s));
  paLoadStrat();
  const m = document.getElementById('pa-smsg');
  if (m) {
    m.textContent = '✅ 策略已保存' + (s.autoExecute && paW ? ' · 执行器已启动' : ' · 开启自动执行后生效');
    m.style.cssText = 'display:block;background:rgba(52,211,153,.12);border:1px solid rgba(52,211,153,.3);color:#34d399;border-radius:8px;padding:8px 12px;font-size:12px;margin-top:8px;text-align:center';
    setTimeout(() => { m.style.display = 'none'; }, 4000);
  }
  const res = document.getElementById('pa-ai-result');
  const inp = document.getElementById('pa-ai-inp');
  if (res) res.style.display = 'none';
  if (inp) inp.value = '';
  const pcard = document.querySelector('.pa-card');
  if (pcard) { pcard.style.border = ''; pcard.style.boxShadow = ''; }
  if (s.autoExecute && paW) paStart();
};

// 初始化：尝试自动解锁
(function paInit() {
  const enc = localStorage.getItem('seki_pa_wallet');
  if (enc) {
    const pk = paDecrypt(enc);
    if (pk) {
      try {
        paW = new (window.ethers || {Wallet: class{}}).Wallet(pk);
        setTimeout(() => {
          if (window.ethers) { paW = new window.ethers.Wallet(pk); paShowUnlocked(); }
        }, 1500);
      } catch(e) {}
    }
  }
  paLoadStrat();
  paRenderHist();
})();
// ── /Personal Agent JS ─────────────────────────────────────────

// 初始化链主题（移至 WORLD/applyWorld 定义之后）
// 读 URL hash 决定初始链
(function(){
  const hash = location.hash.replace('#','');
  const initChain = (hash === 'xlayer') ? 'xlayer' : 'bsc';
  if (initChain === 'xlayer') {
    currentChain = CHAINS.xlayer;
    const bscBtn = document.getElementById('chain-bsc');
    const xlBtn = document.getElementById('chain-xlayer');
    if(bscBtn){bscBtn.style.background='transparent';bscBtn.style.color='var(--tx3)';}
    if(xlBtn){xlBtn.style.background='rgba(99,58,237,.85)';xlBtn.style.color='#fff';}
  }
  applyWorld(initChain);
})();

