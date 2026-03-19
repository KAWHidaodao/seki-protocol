const CHAINS={
  bsc:{
    id:56, name:'BSC', rpc:'https://bsc-dataseed.binance.org/',
    contract:'0xea43a24a1baefb89494126c12fe8921b5b8e3d8d',
    registry:'0x8c98f9821299e531353dd004b722851cf1b4c8a2',
    symbol:'BNB', explorer:'https://bscscan.com'
  },
  xlayer:{
    id:196, name:'X Layer', rpc:'https://rpc.xlayer.tech',
    contract:'0xBce8A6124255c0bB1e65DF6bb72A53833261455f',
    registry:'0xCB778Ac6A811A2712764F2cee69748CaCb71b80f',
    symbol:'OKB', explorer:'https://www.oklink.com/xlayer'
  }
};
let currentChain = CHAINS.bsc;
const CONTRACT=currentChain.contract;
const REGISTRY=currentChain.registry;
const RPC=currentChain.rpc;
const HOOK_ADDR='0x246b067858f785dbDAB0fbAc2072F56BDaB4358E';
const REG_ABI=[
 'function createJob(address,address,uint256,string,address) returns (uint256)',
 'function setBudget(uint256,uint256,bytes)',
 'function fund(uint256,uint256,bytes) payable',
 'function submit(uint256,bytes32,bytes)',
 'function complete(uint256,bytes32,bytes)',
 'function reject(uint256,bytes32,bytes)',
 'function claimRefund(uint256)',
 'function getJob(uint256) view returns (tuple(address client,address provider,address evaluator,string description,uint256 budget,uint256 expiredAt,uint8 status,address hook,bytes32 deliverable,bytes32 reason))',
 'function nextJobId() view returns (uint256)',
 'function getJobStatus(uint256) view returns (uint8)',
 'function getJobBudgetRemaining(uint256) view returns (uint256)',
 'function whitelistedHooks(address) view returns (bool)',
 'event JobCreated(uint256 indexed,address indexed,address,address,uint256,address)',
 'event JobFunded(uint256 indexed,address indexed,uint256)',
 'event JobSubmitted(uint256 indexed,address indexed,bytes32)',
 'event JobCompleted(uint256 indexed,address indexed,bytes32)',
 'event JobRejected(uint256 indexed,address indexed,bytes32)',
 'event JobExpired(uint256 indexed)',
 'event PaymentReleased(uint256 indexed,address indexed,uint256)',
 'event Refunded(uint256 indexed,address indexed,uint256)',
];
const ABI=[
 'function nextTaskId() view returns (uint256)',
 'function taskBase(uint256) view returns (address creator,address targetToken,uint256 maxWinners,uint256 rewardPerWinner,uint256 totalReward,uint256 claimedCount,uint256 deadline,uint8 taskType,uint8 rewardType,bool active)',
 'function taskCond(uint256) view returns (address rewardToken,uint256 minTokenAmount,uint256 minHoldSeconds,uint256 minBuyBNB,uint256 minReferrals)',
 'function claimed(uint256,address) view returns (bool)',
 'function holdStart(uint256,address) view returns (uint256)',
 'function joined(uint256,address) view returns (bool)',
 'event RewardClaimed(uint256 indexed taskId,address indexed user,uint256 amount)',
 'event TaskCancelled(uint256 indexed taskId)',
 'function createTask(address,uint8,uint8,address,uint256,uint256,uint256,uint256,uint256,uint256,uint256) payable returns (uint256)',
 'function startHold(uint256)','function claimHold(uint256)',
 'function claimEarlyBird(uint256)',
 'function joinTournament(uint256)','function cancelTask(uint256)',
 'event RewardClaimed(uint256 indexed id,address indexed user,uint256 amount)',
];
const TNAMES=['持仓','买入','早鸟','推荐','锦标赛'];
let prov,sign,con,roCon,addr,tasks=[],curF='all',meta={};
let _sigToken=null;


async function loadMeta(){try{const r=await fetch('/api/meta');meta=await r.json()}catch{}}
async function saveMeta(id,title,desc,isAgent=false){try{await fetch('/api/meta',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id,title,desc,isAgent})})}catch{}}




// ── Logo 上传 ──────────────────────────────────────
let logoBase64 = null;
let logoMime = null;

function onLogoUpload(input) {
 const file = input.files[0];
 if (!file) return;
 logoMime = 'image/jpeg';
 const img = new Image();
 const url = URL.createObjectURL(file);
 img.onload = () => {
 // 压缩到最大 400px，减少上传体积
 const MAX = 400;
 let w = img.width, h = img.height;
 if (w > MAX || h > MAX) {
 if (w > h) { h = Math.round(h * MAX / w); w = MAX; }
 else { w = Math.round(w * MAX / h); h = MAX; }
 }
 const canvas = document.createElement('canvas');
 canvas.width = w; canvas.height = h;
 canvas.getContext('2d').drawImage(img, 0, 0, w, h);
 const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
 logoBase64 = dataUrl.split(',')[1];
 URL.revokeObjectURL(url);
 // 更新预览
 const prev = document.getElementById('lk-preview-img');
 if(prev){ prev.style.backgroundImage = 'url('+dataUrl+')'; prev.textContent = ''; }
 // 更新上传区
 const area = document.getElementById('lh-upload-area');
 if(area) area.classList.add('has-img');
 const icon = document.getElementById('lh-upload-icon');
 if(icon) icon.innerHTML = '<img src="'+dataUrl+'" style="width:48px;height:48px;border-radius:8px;object-fit:cover">';
 const tip = document.getElementById('lh-upload-tip');
 if(tip) tip.textContent = file.name + ' (已压缩)';
 };
 img.src = url;
}

// ── 一键发币 ──────────────────────────────────────
// 实时计算预算
function calcLaunchBudget(){
 const r=parseFloat(document.getElementById('lk-reward').value)||0.005;
 const w=parseInt(document.getElementById('lk-winners').value)||100;
 const total=(r*w*1.03).toFixed(4);
 const el=document.getElementById('lk-total');
 if(el)el.textContent=total;
}
document.addEventListener('DOMContentLoaded',()=>{
 ['lk-reward','lk-winners'].forEach(id=>{
 const el=document.getElementById(id);
 if(el)el.addEventListener('input',calcLaunchBudget);
 });
});

function resetLaunch(){
 document.getElementById('launch-result').style.display='none';
 document.getElementById('lk-name').value='';
 document.getElementById('lk-sym').value='';
 document.getElementById('lk-desc').value='';
 document.getElementById('lk-img').value='';
 document.getElementById('lk-preview-name').textContent='seki';
 document.getElementById('lk-preview-sym').textContent='$TEST';
 document.getElementById('lk-preview-img').textContent='';
 document.getElementById('lk-preview-img').style.backgroundImage='none';
}

function lpStep(steps, active, msg) {
 document.getElementById('lp-msg').textContent = msg;
 document.getElementById('lp-steps').innerHTML = steps.map((s,i) =>
 '<div style="display:flex;align-items:center;gap:10px;padding:8px 0">'
 +'<div style="width:22px;height:22px;border-radius:50%;background:'+(i<active?'#10b981':i===active?'#7c3aed':'#e5e7eb')+';color:#fff;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;flex-shrink:0">'+(i<active?'✓':i+1)+'</div>'
 +'<div style="font-size:13px;color:'+(i<=active?'#1a1a2e':'#9ca3af')+'">'+(i===active?'<strong>'+s+'</strong>':s)+'</div>'
 +'</div>'
 ).join('');
}



function showInlineDelegate() {
 const el = document.getElementById('inline-delegate');
 if(!el) return;
 el.style.display = el.style.display==='none' ? '' : 'none';
 if(el.style.display !== 'none') {
 // 自动填入代币地址到 d0（委托页备用）
 if(window._lastLaunchedToken?.addr) document.getElementById('d0') && (document.getElementById('d0').value = window._lastLaunchedToken.addr);
 toast('选择 Agent 类型，填写预算后提交','i');
 }
}
async function submitInlineDelegate() {
 const bnb = document.getElementById('id1').value;
 const mins = document.getElementById('id2').value || '120';
 const tok = window._lastLaunchedToken?.addr;
 if(!tok){toast('代币地址获取失败','e');return;}
 if(!bnb||parseFloat(bnb)<0.01){toast('预算至少 0.01 BNB','e');return;}
 if(!_dgSelectedAgent){toast('请先选择 Agent 类型','e');return;}
 if(!addr){await connectWallet();if(!addr)return;}
 // 同步到委托页表单并复用 submitDelegate
 document.getElementById('d0').value = tok;
 document.getElementById('d1').value = bnb;
 document.getElementById('d2').value = mins;
 document.getElementById('inline-dg-btn').disabled = true;
 document.getElementById('inline-dg-btn').textContent = '处理中...';
 try {
 await submitDelegate();
 } catch(e) {
 toast('委托失败: '+e.message.slice(0,60),'e');
 }
 document.getElementById('inline-dg-btn').disabled = false;
 document.getElementById('inline-dg-btn').textContent = ' 确认委托（需签名2次）';
}

function goDelegateFromLaunch() {
 G('delegate', document.querySelectorAll('.nl')[2]);
 setTimeout(()=>{
 if (window._lastLaunchedToken?.addr) {
 const d0 = document.getElementById('d0');
 if(d0) { d0.value = window._lastLaunchedToken.addr; dgCalc(); }
 }
 if(!_dgSelectedAgent) toast('👆 请先选择一个 Agent','i');
 }, 300);
}
function updateTaxFlow(rate) {
 const el = document.getElementById('tax-flow-desc');
 if (!el) return;
 if (!rate) {
 el.innerHTML = '<div style="font-size:12px;color:var(--tx3)">无税模式：Agent 不会自动收到税收，需要手动委托预算才能运营。</div>';
 return;
 }
 const examples = {
 '1': {vol:'1 BNB', tax:'0.01 BNB', tasks:'约2个', freq:'每小时'},
 '3': {vol:'1 BNB', tax:'0.03 BNB', tasks:'约6个', freq:'每小时'},
 '5': {vol:'1 BNB', tax:'0.05 BNB', tasks:'约10个', freq:'每小时'},
 };
 const ex = examples[rate] || examples['3'];
 el.innerHTML = [
 `<div style="display:flex;align-items:center;gap:8px;font-size:12px">
 <span style="color:var(--tx3)">每笔交易</span>
 <span style="color:var(--p);font-weight:700">${rate}% 税收</span>
 <span style="color:var(--tx3)">→</span>
 <span style="font-weight:600">Agent 钱包</span>
 </div>`,
 `<div style="display:flex;align-items:center;gap:8px;font-size:12px">
 <span style="color:var(--tx3)">交易量 ${ex.vol} 时</span>
 <span style="color:var(--tx3)">→</span>
 <span style="color:var(--gr);font-weight:700">税收 ${ex.tax}</span>
 <span style="color:var(--tx3)">→ 自动发 ${ex.tasks}激励任务</span>
 </div>`,
 `<div style="font-size:11px;color:var(--tx3);padding-top:4px;border-top:1px solid rgba(255,255,255,.06)">
 交易越活跃 → 税收越多 → Agent 发更多任务 → 用户参与 → 更多交易
 </div>`,
 ].join('');
}

async function launchToken() {
 console.log('[launch] start, addr=', addr);
 const name = document.getElementById('lk-name').value.trim();
 const symbol = document.getElementById('lk-sym').value.trim().toUpperCase();
 const desc = document.getElementById('lk-desc').value.trim();
 const label = document.getElementById('lk-label').value;
 const tax = document.querySelector('input[name="tax"]:checked')?.value || '';
 const webUrl = document.getElementById('lk-web')?.value.trim() || '';
 const twitterUrl = document.getElementById('lk-twitter')?.value.trim() || '';
 const tgUrl = document.getElementById('lk-tg')?.value.trim() || '';
 const preSale = '';
 console.log('[launch] fields: name='+name+' symbol='+symbol+' desc='+desc);
 if (!name || !symbol || !desc) {
 toast(' 请填写名称、代币符号和项目描述，缺一不可','e');
 if (!name) document.getElementById('lk-name').focus();
 else if (!symbol) document.getElementById('lk-sym').focus();
 else if (!desc) document.getElementById('lk-desc').focus();
 return;
 }

 // 必须先连钱包
 if (!addr) {
 console.log('[launch] no addr, calling connectWallet');
 await connectWallet();
 if (!addr) { console.log('[launch] still no addr after connect, abort'); return; }
 }
 console.log('[launch] addr ok:', addr);

 const btn = document.getElementById('launch-btn');
 btn.disabled = true;

 // 签名验证身份
 let _sigData;
 try {
 toast('请在 MetaMask 中签名确认身份（不消耗 Gas）...', 'i');
 console.log('[sig] calling getSignature, sign=', sign, 'prov=', prov);
 _sigData = await getSignature();
 console.log('[sig] success:', _sigData?.nonce);
 } catch(se) {
 console.error('[sig] error:', se);
 alert('签名错误（调试用）: ' + se.message);
 toast('签名失败: ' + (se.message||'').slice(0,60), 'e');
 btn.disabled = false;
 return;
 }

 // 从服务器查真实次数
 try {
 const qr = await fetch('/api/launch-count?addr='+addr);
 const qd = await qr.json();
 const _qel = document.getElementById('launch-quota');
 if(_qel) _qel.textContent = '剩余发币次数：'+qd.remaining+' / '+qd.limit;
 if (qd.remaining <= 0) { toast('每个钱包最多发布 3 个代币，已用完','e'); btn.disabled=false; return; }
 } catch {}
 const steps = ['上传图片 + 调用发币 API', '广播上链', '保存记录'];
 document.getElementById('launch-progress').style.display = 'flex';
 document.getElementById('launch-result').style.display = 'none';
 const errEl2 = document.getElementById('launch-error');
 if(errEl2) errEl2.style.display='none';
 lpStep(steps, 0, '正在发币（约10-30秒）...');

 try {
 const r = await fetch('/api/create-token', {
 method: 'POST',
 headers: { 'Content-Type': 'application/json' },
 body: JSON.stringify({
 name, symbol, desc, label,
 imageBase64: logoBase64||null, imageMime: logoMime||null,
 taxRate: tax||null,
 webUrl: webUrl||null,
 twitterUrl: twitterUrl||null,
 tgUrl: tgUrl||null,
 walletAddr: addr,
 sig: _sigData.sig,
 nonce: _sigData.nonce
 })
 });
 const data = await r.json();
 if (!data.ok) throw new Error(data.error || '发币失败');
 const tokenAddr = data.tokenAddress;
 const txHash2 = data.txHash;
 const isPending = !tokenAddr && !!txHash2;

 lpStep(steps, isPending?1:1, isPending ? '交易已提交，等待确认...' : '✓ 代币地址: '+tokenAddr.slice(0,10)+'...');
 lpStep(steps, 2, '保存记录...');

 // 保存到"我的发币记录"（有没有地址都保存）
 console.log('[launch] saving to localStorage, addr:', addr);
 const myTokens2 = JSON.parse(localStorage.getItem('mb_my_tokens')||'[]');
 myTokens2.unshift({ addr: tokenAddr||null, name, symbol, txHash: txHash2, ts: Date.now(), label, wallet: addr, pending: isPending });
 localStorage.setItem('mb_my_tokens', JSON.stringify(myTokens2.slice(0,50)));

 document.getElementById('launch-progress').style.display = 'none';
 console.log('[launch] showing result, txHash:', txHash2, 'tokenAddr:', tokenAddr);
 document.getElementById('launch-result').style.display = 'flex';

 if (tokenAddr) {
 document.getElementById('lr-addr').textContent = tokenAddr;
 document.getElementById('lr-scan').href = 'https://bscscan.com/token/'+tokenAddr;
 document.getElementById('lr-fourmeme').href = 'https://four.meme/token/'+tokenAddr;
 window._lastLaunchedToken = { addr: tokenAddr, symbol, name };
 } else {
 document.getElementById('lr-addr').textContent = '⏳ 上链确认中... (txHash: '+txHash2.slice(0,16)+'...)';
 document.getElementById('lr-scan').href = 'https://bscscan.com/tx/'+txHash2;
 document.getElementById('lr-fourmeme').href = '#';
 // 后台轮询取地址
 resolveTokenAddr(txHash2, name, symbol, addr);
 }

 document.getElementById('lr-task').innerHTML = tax
 ? ' 税率 '+tax+'% 已设置 → 税收自动流入 Agent taxPool，Agent 将自动发任务激励持币者'
 : ' 未设置税率 → Agent 无自动收入，建议委托预算给 Agent 运营';
 toast(' '+symbol+' 交易已提交！','s');

 } catch(e) {
 document.getElementById('launch-progress').style.display = 'none';
 console.error('launchToken error:', e);
 const errMsg = (e.message||'未知错误').slice(0,100);
 toast(' '+errMsg, 'e');
 // 持久显示错误（toast会消失）
 const errEl = document.getElementById('launch-error');
 if(errEl){ errEl.textContent = ' '+errMsg; errEl.style.display='block'; }
 }
 btn.disabled = false;
}

// 异步轮询补全代币地址（pending 状态时用）
async function resolveTokenAddr(txHash, name, symbol, wallet) {
 for (let i = 0; i < 20; i++) {
 await new Promise(r => setTimeout(r, 3000));
 try {
 const body = JSON.stringify({jsonrpc:'2.0',method:'eth_getTransactionReceipt',params:[txHash],id:1});
 const r = await fetch('https://bsc-dataseed.binance.org/', {method:'POST',headers:{'Content-Type':'application/json'},body});
 const d = await r.json();
 if (d.result && d.result.logs && d.result.logs.length > 0) {
 const tokenAddr = d.result.logs[0].address;
 document.getElementById('lr-addr').textContent = tokenAddr;
 document.getElementById('lr-scan').href = 'https://bscscan.com/token/'+tokenAddr;
 document.getElementById('lr-fourmeme').href = 'https://four.meme/token/'+tokenAddr;
 window._lastLaunchedToken = { addr: tokenAddr, symbol, name };
 const mt = JSON.parse(localStorage.getItem('mb_my_tokens')||'[]');
 const idx = mt.findIndex(t => t.txHash === txHash);
 if (idx >= 0) { mt[idx].addr = tokenAddr; mt[idx].pending = false; localStorage.setItem('mb_my_tokens', JSON.stringify(mt)); }
 // 同步回服务器
 fetch('/api/update-token',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({wallet,txHash,addr:tokenAddr})}).catch(()=>{});
 toast(symbol+' 代币地址已确认 ✓','s');
 return;
 }
 } catch {}
 }
}

// 获取签名（缓存10分钟，避免每次都弹签名框）
async function getSignature() {
 if (!addr) throw new Error('请先连接钱包');
 // sign 为 null 时重新获取 signer
 if (!sign) {
 try {
 if (!prov) prov = new ethers.BrowserProvider(window.ethereum);
 sign = await prov.getSigner();
 addr = await sign.getAddress();
 } catch(e) {
 throw new Error('获取签名账户失败: ' + e.message);
 }
 }
 // 检查缓存
 if (_sigToken && _sigToken.addr.toLowerCase() === addr.toLowerCase() && Date.now() - _sigToken.ts < 10 * 60 * 1000) {
 return _sigToken;
 }
 // 向服务器申请 nonce
 let nonce, message;
 try {
 const nr = await fetch('/api/nonce?addr=' + addr);
 const nd = await nr.json();
 nonce = nd.nonce; message = nd.message;
 if (!nonce) throw new Error('服务器未返回 nonce: ' + JSON.stringify(nd));
 } catch(e) { throw new Error('获取 nonce 失败: ' + e.message); }
 // 弹出 MetaMask 签名
 let sig;
 try {
 sig = await sign.signMessage(message);
 } catch(e) { throw new Error('MetaMask 签名失败: ' + e.message); }
 _sigToken = { sig, nonce, addr, ts: Date.now() };
 return _sigToken;
}

// ── AI TASK PUBLISH ──────────────────────────────
const TNAMES_FULL = ['⏳ 持仓','买入',' 早鸟','锦标赛'];
let generatedTask = null;

function switchDTab(tab, el) {
 document.querySelectorAll('.dtab').forEach(b => b.classList.remove('on'));
 el.classList.add('on');
 document.getElementById('dt-agent').style.display = tab === 'agent' ? '' : 'none';
 document.getElementById('dt-publish').style.display = tab === 'publish' ? '' : 'none';
}

function setIntent(el) {
 const t = el.textContent.replace(/^[^\s]+\s/, '').trim();
 document.getElementById('p-intent').value = el.textContent.replace(/^\S+\s+/, '');
}

async function generateTask() {
 const intent = document.getElementById('p-intent').value.trim();
 const token = document.getElementById('p-token').value.trim();
 const symbol = document.getElementById('p-symbol').value.trim();
 const budget = document.getElementById('p-budget').value;
 if (!intent) { toast('请先描述你想要的效果','e'); return; }
 if (!token) { toast('请填写代币地址','e'); return; }

 document.getElementById('ai-step1').style.display = 'none';
 document.getElementById('ai-step2').style.display = '';
 document.getElementById('ai-loading').style.display = 'flex';
 document.getElementById('ai-result').style.display = 'none';

 try {
 const res = await fetch('/api/generate-task', {
 method: 'POST',
 headers: { 'Content-Type': 'application/json' },
 body: JSON.stringify({ intent, tokenSymbol: symbol, budget: budget || '0.5' })
 });
 const data = await res.json();
 if (!data.ok) throw new Error(data.error || 'AI 生成失败');

 generatedTask = { ...data.task, token };
 renderTaskPreview(data.task);
 document.getElementById('ai-loading').style.display = 'none';
 document.getElementById('ai-result').style.display = '';
 } catch(e) {
 toast('AI 生成失败: ' + e.message, 'e');
 backToStep1();
 }
}

function renderTaskPreview(t) {
 document.getElementById('r-type-badge').textContent = TNAMES_FULL[t.taskType] || '未知';
 document.getElementById('r-reasoning').textContent = (t.reasoning || '').replace(/\n+/g,' ').trim();
 document.getElementById('r-title').textContent = t.title || '';
 document.getElementById('r-desc').textContent = t.description || '';

 const params = [
 { k: '每人奖励', v: t.rewardPerWinner + ' BNB' },
 { k: '最多获奖人数', v: t.maxWinners + ' 人' },
 { k: '有效时长', v: t.deadlineHours + ' 小时' },
 t.taskType === 0 ? { k: '最低持仓', v: Number(t.minTokenAmount).toLocaleString() + ' 枚' } : null,
 t.taskType === 0 ? { k: '持仓时长', v: t.minHoldHours + ' 小时' } : null,
 t.taskType === 1 ? { k: '最低买入', v: t.minBuyBNB + ' BNB' } : null,
 t.taskType === 3 ? { k: '推荐人数', v: t.minReferrals + ' 人' } : null,
 { k: '总奖励预算', v: (t.rewardPerWinner * t.maxWinners).toFixed(3) + ' BNB' },
 ].filter(Boolean);

 document.getElementById('r-params').innerHTML = params.map(p =>
 '<div class="ai-param"><div class="ai-param-k">'+p.k+'</div><div class="ai-param-v">'+p.v+'</div></div>'
 ).join('');
}

function backToStep1() {
 document.getElementById('ai-step1').style.display = '';
 document.getElementById('ai-step2').style.display = 'none';
 generatedTask = null;
}

async function confirmPublish() {
 if (!con) { toast('请先连接钱包', 'e'); return; }
 if (!generatedTask) return;

 document.getElementById('ai-step2').style.display = 'none';
 document.getElementById('ai-step3').style.display = '';

 const t = generatedTask;
 const { ethers } = window;
 try {
 document.getElementById('publish-status').textContent = '等待钱包确认...';
 const rewardPerWinner = ethers.parseEther(String(t.rewardPerWinner));
 const maxWinners = BigInt(t.maxWinners);
 const deadline = BigInt(Math.floor(Date.now()/1000) + t.deadlineHours * 3600);
 const minTokenAmount = BigInt(t.minTokenAmount || 0);
 const minHoldSeconds = BigInt(Math.round((t.minHoldHours||0) * 3600));
 const minBuyBNB = ethers.parseEther(String(t.minBuyBNB || 0));
 const minReferrals = BigInt(t.minReferrals || 0);
 const total = rewardPerWinner * maxWinners;
 const fee = total * 300n / 10000n;

 const tx = await con.createTask(
 t.token, t.taskType, 0,
 ethers.ZeroAddress,
 rewardPerWinner, maxWinners, deadline,
 minTokenAmount, minHoldSeconds, minBuyBNB, minReferrals,
 { value: total + fee }
 );
 document.getElementById('publish-status').textContent = '交易已提交，等待链上确认...';
 await tx.wait();

 const newId = Number(await(con||roCon).nextTaskId()) - 1;
 await saveMeta(newId, t.title, t.description, false);

 toast(' 任务 #' + newId + ' 发布成功！', 's');
 await loadAll();
 G('home', document.querySelectorAll('.nl')[0]);
 document.getElementById('ai-step3').style.display = 'none';
 document.getElementById('ai-step1').style.display = '';
 generatedTask = null;
 } catch(e) {
 toast('发布失败: ' + (e.reason || e.message.slice(0,60)), 'e');
 document.getElementById('ai-step3').style.display = 'none';
 document.getElementById('ai-step2').style.display = '';
 }
}

async function initRO(){
 await loadMeta();
 const p=new ethers.JsonRpcProvider(RPC);
 roCon=new ethers.Contract(CONTRACT,ABI,p);
 await loadAll();
 listenEv(p);
}

const connectW = () => connectWallet();
async function connectWallet(){
 if(!window.ethereum){
 toast('请先安装 MetaMask 或使用支持 Web3 的浏览器','e');
 return;
 }
 try{
 prov = new ethers.BrowserProvider(window.ethereum);
 toast('请在钱包中授权...','i');
 await prov.send('eth_requestAccounts',[]);

 // 切换到 BSC 主网
 try{
 await prov.send('wallet_switchEthereumChain',[{chainId:'0x38'}]);
 } catch(sw){
 if(sw.code===4902 || sw.code===-32603){
 try{
 await prov.send('wallet_addEthereumChain',[{
 chainId:'0x38',
 chainName:'BNB Smart Chain',
 nativeCurrency:{name:'BNB',symbol:'BNB',decimals:18},
 rpcUrls:['https://bsc-dataseed.binance.org/'],
 blockExplorerUrls:['https://bscscan.com/']
 }]);
 } catch(add){ toast('添加 BSC 网络失败，请手动切换','e'); return; }
 } else if(sw.code===4001){
 toast('用户拒绝切换网络','e'); return;
 } else {
 toast('请手动切换到 BNB Smart Chain','e'); return;
 }
 }

 sign = await prov.getSigner();
 addr = await sign.getAddress();
 con = new ethers.Contract(CONTRACT, ABI, sign);

 // 更新 UI
 const wbtn = document.getElementById('wbtn');
 const wi = document.getElementById('wi');
 const wa = document.getElementById('wa');
 if(wbtn) wbtn.style.display = 'none';
 if(wi) wi.style.display = 'flex';
 if(wa) wa.textContent = addr.slice(0,6)+'...'+addr.slice(-4);

 toast('钱包已连接 ✓','s');
 // 从服务器查剩余次数
 fetch('/api/launch-count?addr='+addr).then(r=>r.json()).then(d=>{

 }).catch(()=>{});
 await loadAll();
 await loadMy();
 listenEv(prov);
 } catch(e){
 console.error('connectWallet error:', e);
 if(e.code===4001 || e.message?.includes('rejected')){
 toast('已取消连接','e');
 } else if(e.message?.includes('network')){
 toast('网络错误，请检查 RPC 连接','e');
 } else {
 toast('连接失败：'+(e.shortMessage||e.message||'未知错误').slice(0,50),'e');
 }
 }
}

async function updateHeroStats(){
 try{
 const p2=new ethers.JsonRpcProvider(RPC);
 const RABI=['function taxPool() view returns (uint256)','function nextJobId() view returns (uint256)'];
 const reg=new ethers.Contract(REGISTRY,RABI,p2);
 // taxPool 余额
 const tp=await reg.taxPool().catch(()=>0n);
 const tpStr=parseFloat(ethers.formatEther(tp)).toFixed(4)+' BNB';
 const e0=document.getElementById('ag-taxpool');if(e0)e0.textContent=tpStr;
 // hero 面板也显示 taxPool
 const e1=document.getElementById('hero-bal');if(e1)e1.textContent=tpStr;
 // 活跃任务数
 const n=Number(await(roCon||new ethers.Contract(CONTRACT,ABI,p2)).nextTaskId().catch(()=>0n));
 const e2=document.getElementById('hero-tasks');if(e2)e2.textContent=n;
 }catch{}
}
async function loadAll(){
 const c=con||roCon;if(!c)return;
 try{
 const n=Number(await c.nextTaskId());tasks=[];
 for(let i=0;i<n;i++){try{const b=await c.taskBase(i),cd=await c.taskCond(i);tasks.push({id:i,b,cd})}catch{}}
 render();updateStats();
 }catch(e){console.error(e)}
}

function updateStats(){
 const act=tasks.filter(t=>t.b.active).length;
 const agentN=Object.values(meta).filter(m=>m.isAgent).length;
 const cl=tasks.reduce((s,t)=>s+Number(t.b.claimedCount),0);
 const tks=new Set(Object.values(meta).filter(m=>m.isAgent).map((_,i)=>tasks[i]?.b?.targetToken).filter(Boolean)).size;
 animNum('s0',act);animNum('s1',agentN);animNum('s2',cl);animNum('s3',tks||0);
}

function animNum(id,target){
 const el=document.getElementById(id);if(!el)return;
 const n=Number(target);if(isNaN(n)){el.textContent=target;return}
 let cur=0,step=Math.max(n/30,1);
 const t=setInterval(()=>{cur=Math.min(cur+step,n);el.textContent=Math.round(cur);if(cur>=n)clearInterval(t)},30);
}

async function render(){
 const g=document.getElementById('task-list')||document.getElementById('tgrid');
 let fl=tasks.filter(t=>t.b.active);
 if(curF==='agent')fl=fl.filter(t=>meta[t.id]?.isAgent);
 else if(curF!=='all')fl=fl.filter(t=>Number(t.b.taskType)===parseInt(curF));
 const hc=document.getElementById('hall-count');
 if(hc) hc.textContent=fl.length+' 个任务';
 if(!fl.length){g.innerHTML=`
 <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:60vh;gap:20px;opacity:.6">
 <div style="position:relative;width:80px;height:80px">
 <div style="position:absolute;inset:0;border-radius:50%;border:1px solid rgba(124,58,237,.3);animation:spin 8s linear infinite"></div>
 <div style="position:absolute;inset:8px;border-radius:50%;border:1px dashed rgba(96,165,250,.2);animation:spin 5s linear infinite reverse"></div>
 <div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:28px"></div>
 </div>
 <div style="text-align:center">
 <div style="font-size:14px;font-weight:700;color:var(--tx2);margin-bottom:6px">Agent 正在待命</div>
 <div style="font-size:12px;color:var(--tx3);line-height:1.6">首个代币发布并委托后<br>任务将自动出现在这里</div>
 </div>
 <button class="hero-btn-primary" style="font-size:13px;padding:10px 22px" onclick="G('launch',document.querySelectorAll('.nl')[1])">立即发币 →</button>
 </div>`;return}
 const cards=await Promise.all(fl.map(mkCard));
 g.innerHTML=cards.join('');
}

async function mkCard({id,b,cd}){
 const tp=Number(b.taskType),rt=Number(b.rewardType);
 // 修正：若 maxWinners 异常大（fallback 参数顺序错误），自动纠正
 let _maxW=b.maxWinners, _rpw=b.rewardPerWinner;
 if(_maxW > 10000n && _rpw < 1000000000000000n) { const tmp=_maxW; _maxW=_rpw; _rpw=tmp; }
 const pct=_maxW>0n?Math.round(Number(b.claimedCount)*100/Number(_maxW)):0;
 const rem=Number(_maxW)-Number(b.claimedCount);
 const full=rem<=0||!b.active;
 const deadlineSec=Number(b.deadline);const now=Math.floor(Date.now()/1000);const dl=deadlineSec>now?fmtTime(deadlineSec-now):'已结束';
 const rstr=rt===0?ethers.formatEther(_rpw).replace(/\.?0+$/,'')+' BNB':Number(ethers.formatUnits(_rpw,18)).toFixed(4)+['','USDT',' Token'][rt];
 let cl=false,hs=false,jn=false;
 if(addr){try{cl=await(con||roCon).claimed(id,addr)}catch{}
 if(tp===0)try{const s=await(con||roCon).holdStart(id,addr);hs=Number(s)>0}catch{}
 if(tp===4)try{jn=await(con||roCon).joined(id,addr)}catch{}}
 const m=meta[id]||{};
 const isAg=!!m.isAgent;
 const title=m.title||(isAg?'[Agent] 任务 #'+id:'任务 #'+id);
 const desc=m.desc||_cond(tp,cd,b);
 const btnMap={
 0:hs?{l:'领取奖励',fn:'doAct(0,'+id+',"claim")'}:{l:'开始持仓计时',fn:'doAct(0,'+id+',"start")'},
 1:{l:'等待 AI 验证',dis:true},
 2:{l:'立即参与 →',fn:'doAct(2,'+id+')'},
 3:{l:'填写推荐码',fn:'openRef('+id+')'},
 4:jn?{l:'已报名 ✓',dis:true}:{l:'报名参赛 →',fn:'doAct(4,'+id+')'},
 };
 const btn=cl?{l:'✓ 已领取',dis:true,cls:'dn'}:full?{l:'名额已满',dis:true}:btnMap[tp]||{l:'参与',dis:true};
 const badge=isAg?'<span class="cbg ag"> Agent</span>':'<span class="cbg">'+TNAMES[tp]+'</span>';
 const agentBadge = isAg
 ? '<span class="cbg ag"> Agent</span>'
 : '<span class="cbg">'+TNAMES[tp]+'</span>';
 const statusBadge = full
 ? '<span class="cs no">已满</span>'
 : '<span class="cs go">进行中</span>';
 const idx2 = (tasks||[]).findIndex(t=>Number(t.id)===Number(id));
 const num = String(idx2>=0?idx2+1:1).padStart(2,'0');
 return '<div class="tc'+(full?' full':'')+'" onclick="openTask('+id+')">'
 +'<div class="tc-num">'+num+'</div>'
 +'<div class="tc-body">'
 +'<div class="tch">'+agentBadge+statusBadge+'</div>'
 +'<div class="cti">'+escH(title)+'</div>'
 +(m.desc?'<div class="cde">'+escH(m.desc)+'</div>':'')
 +'</div>'
 +'<div class="tc-meta">'
 +'<div class="crw">'+rstr+'</div>'
 +'<div class="tc-remain">'+rem+'/'+Number(_maxW)+' 名额</div>'
 +'<div class="tc-dl">'+dl+'</div>'
 +'</div>'
 +'</div>'
}

function _cond(tp,cd,b){
 if(tp===0){
 const sec=Number(cd.minHoldSeconds);
 const t=sec>=3600?(sec/3600).toFixed(1)+'小时':(sec/60).toFixed(0)+'分钟';
 return'持仓满 '+t+'，持有 ≥ '+Number(cd.minTokenAmount).toLocaleString()+' 枚即可领奖';
 }
 if(tp===1)return'单次买入 ≥ '+ethers.formatEther(cd.minBuyBNB)+' BNB 自动发奖';
 if(tp===2)return'前 '+Number(b.maxWinners)+' 名持仓者先到先得，立即参与！';
 if(tp===3)return'推荐满 '+Number(cd.minReferrals)+' 人买入可领奖';
 if(tp===4)return'截止时持仓量排名前 '+Number(b.maxWinners)+' 名瓜分奖励';
 return'链上任务';
}
function fmtTime(s){
 if(s<=0)return'已结束';
 const h=Math.floor(s/3600),m=Math.floor((s%3600)/60),sec=Math.floor(s%60);
 if(h>48)return Math.floor(h/24)+'天'+h%24+'h';
 if(h>0)return h+'h '+String(m).padStart(2,'0')+'m '+String(sec).padStart(2,'0')+'s';
 if(m>0)return m+'m '+String(sec).padStart(2,'0')+'s';
 return sec+'s';
}
function escH(s){return(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}

async function doAct(tp,id,sub){
 if(!con){toast('请先连接钱包','e');return}
 const fns={0:{start:()=>con.startHold(id),claim:()=>con.claimHold(id)},2:{undefined:()=>con.claimEarlyBird(id)},4:{undefined:()=>con.joinTournament(id)}};
 const msgs={0:{start:'持仓计时开始！达标后可领奖 ✓',claim:'奖励已到账 '},2:{undefined:'早鸟奖励已到账 '},4:{undefined:'报名成功！截止时按持仓排名 ✓'}};
 try{toast('交易发送中...','i');
 const fn=(fns[tp]||{})[sub]||(fns[tp]||{})[undefined];if(!fn){toast('暂不支持','e');return}
 const tx=await fn();await tx.wait();
 toast((msgs[tp]||{})[sub]||(msgs[tp]||{})[undefined]||'操作成功 ✓','s');
 await loadAll();if(addr)await loadMy();
 }catch(e){toast('失败: '+(e.reason||e.message.slice(0,50)),'e')}
}

function openRef(id){
 document.getElementById('ptitle').textContent='填写推荐人';
 document.getElementById('pbody').innerHTML='<div class="pr"><span class="pk">任务</span><span class="pv">#'+id+'</span></div>'
 +'<div style="margin-top:16px"><label class="fl">推荐人钱包地址</label>'
 +'<div style="display:flex;gap:8px;margin-top:6px">'
 +'<input class="fi" id="refa" placeholder="0x...">'
 +'<button class="btnp" style="white-space:nowrap" onclick="doRef('+id+')">确认</button></div></div>';
 document.getElementById('panel').classList.add('on');
 document.getElementById('pbody').innerHTML='<div style="padding:60px 0;text-align:center;color:var(--tx3)">加载中...</div>';
}

async function doRef(id){
 if(!con){toast('请先连接钱包','e');return}
 const r=document.getElementById('refa').value.trim();
 if(!r){toast('请输入推荐人地址','e');return}
 try{toast('注册推荐关系...','i');const tx=await con.registerReferral(id,r);await tx.wait();toast('推荐关系已上链 ✓','s');closeP()}
 catch(e){toast('失败: '+(e.reason||e.message.slice(0,40)),'e')}
}

async function openTask(id){
 const t=tasks.find(x=>x.id===id);if(!t)return;
 const {b,cd}=t,m=meta[id]||{};
 const rt=Number(b.rewardType);
 const rstr=rt===0?ethers.formatEther(b.rewardPerWinner)+' BNB':Number(ethers.formatUnits(b.rewardPerWinner,18)).toFixed(4)+['','USDT',' Token'][rt];
 document.getElementById('ptitle').textContent=m.title||'任务 #'+id;
 const tp=Number(b.taskType);
 const hs_=addr?(async()=>Number(await(con||roCon).holdStart(id,addr).catch(()=>0)))():Promise.resolve(0);
 const cl_=addr?(con||roCon).claimed(id,addr).catch(()=>false):Promise.resolve(false);
 const full=Number(b.claimedCount)>=Number(b.maxWinners)||!b.active;
 const condText=_cond(tp,cd,b);
 Promise.all([hs_,cl_]).then(async ([hs,cl])=>{
 let actHtml='';
 if(!addr){actHtml='<button class="pn-btn-main" onclick="connectW()">连接钱包参与</button>';}
 else if(cl){actHtml='<div style="text-align:center;margin-top:16px;color:var(--gr);font-weight:700">✓ 已领取奖励</div>';}
 else if(full){actHtml='<div style="text-align:center;margin-top:16px;color:var(--su)">名额已满</div>';}
 else if(tp===0){
 if(hs>0){
 const elapsed=Math.floor(Date.now()/1000)-hs;
 const need=Number(cd.minHoldSeconds);
 const remain=Math.max(0,need-elapsed);
 const done=elapsed>=need;
 actHtml=done
 ?'<button class="pn-btn-main" onclick="closeP();doAct(0,'+id+',\"claim\")"> 领取奖励</button>'
 :'<div style="margin-top:16px;background:var(--g1);border-radius:10px;padding:14px;text-align:center"><div style="font-size:12px;color:var(--su);margin-bottom:6px">持仓计时中</div><div style="font-size:22px;font-weight:800;color:var(--p)" id="pcd">'+fmtTime(remain)+'</div><div style="font-size:11px;color:var(--su);margin-top:4px">达标后刷新页面领奖</div></div>';
 if(!done)setTimeout(()=>{const el=document.getElementById('pcd');if(el)el.textContent=fmtTime(Math.max(0,Number(cd.minHoldSeconds)-(Math.floor(Date.now()/1000)-hs)))},1000);
 } else {
 actHtml='<button class="pn-btn-main" onclick="closeP();doAct(0,'+id+',\"start\")">⏱ 开始持仓计时</button>';
 }
 } else if(tp===1){
 // 实时查用户持仓
 const minAmt = cd.minTokenAmount ? BigInt(cd.minTokenAmount) : 0n;
 const targetTok = b.targetToken;
 let userBal = 0n;
 try {
   if(addr && targetTok && targetTok !== '0x0000000000000000000000000000000000000000') {
     const tokAbi = ['function balanceOf(address) view returns (uint256)'];
     const tokCon = new ethers.Contract(targetTok, tokAbi, new ethers.JsonRpcProvider(currentChain.rpc));
     userBal = await tokCon.balanceOf(addr);
   }
 } catch(e) {}
 const pctHold = minAmt > 0n ? Math.min(100, Math.round(Number(userBal * 100n / minAmt))) : 0;
 const reached = userBal >= minAmt;
 const minFmt = minAmt > 0n ? (Number(minAmt) / 1e18).toLocaleString() : '—';
 const balFmt = (Number(userBal) / 1e18).toLocaleString();
 const nativeSym = currentChain ? currentChain.symbol : 'BNB';
 const buyBnbAmt = cd.minBuyBNB && cd.minBuyBNB !== '0' ? ethers.formatEther(cd.minBuyBNB) : '';
 actHtml = '<div style="margin-top:16px;background:rgba(59,130,246,.06);border:1px solid rgba(59,130,246,.2);border-radius:12px;padding:16px">'
  + '<div style="font-size:11px;font-weight:700;letter-spacing:1px;color:#60a5fa;margin-bottom:12px">◆ 持仓进度</div>'
  + (addr ? (
    '<div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:8px">'
    + '<span style="color:var(--tx3)">当前持仓</span>'
    + '<span style="font-weight:700;color:'+(reached?'#34d399':'var(--tx)')+'">'+balFmt+' / '+minFmt+'</span>'
    + '</div>'
    + '<div style="height:6px;background:rgba(255,255,255,.08);border-radius:3px;margin-bottom:10px;overflow:hidden">'
    + '<div style="height:100%;width:'+pctHold+'%;background:'+(reached?'#34d399':'#60a5fa')+';border-radius:3px;transition:width .5s"></div>'
    + '</div>'
    + (reached
      ? '<div style="display:flex;align-items:center;gap:6px;font-size:12px;color:#34d399;margin-bottom:10px"><span>✓ 持仓已达标</span></div>'
        + '<button class="pn-btn-main" onclick="closeP();doAct(1,'+id+',\"claim\")">领取奖励</button>'
      : '<div style="font-size:12px;color:var(--tx3);line-height:1.7;margin-bottom:10px">还差 <strong style="color:#f59e0b">'+(Number((minAmt-userBal<0n?0n:minAmt-userBal))/1e18).toLocaleString()+'</strong> 枚达标</div>'
        + (buyBnbAmt ? '<div style="font-size:11px;color:var(--tx3);margin-bottom:10px">或买入 ≥ '+buyBnbAmt+' '+nativeSym+' 后 AI 自动核查</div>' : '')
        + '<a href="https://www.okx.com/web3/dex-swap#inputChain='+currentChain.id+'&inputCurrency=0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee&outputChain='+currentChain.id+'&outputCurrency='+targetTok+'" target="_blank" class="pn-btn-main" style="display:block;text-align:center;text-decoration:none;background:rgba(96,165,250,.15);color:#60a5fa;border:1px solid rgba(96,165,250,.3)">去买入代币 ↗</a>')
  ) : '<button class="pn-btn-main" onclick="connectW()">连接钱包查看进度</button>')
  + '</div>';
 } else if(tp===2){
 actHtml='<button class="pn-btn-main" onclick="closeP();doAct(2,'+id+')"> 立即领取</button>';
 } else if(tp===3){
 actHtml='<button class="pn-btn-main" onclick="closeP();openRef('+id+')"> 填写推荐人</button>';
 } else if(tp===4){
 actHtml='<button class="pn-btn-main" onclick="closeP();doAct(4,'+id+')"> 报名参赛</button>';
 }
 // 更新顶部信息
 const pct2=Number(b.maxWinners)>0?Math.round(Number(b.claimedCount)*100/Number(b.maxWinners)):0;
 document.getElementById('ptask-type').textContent = m.isAgent?' Agent 任务':TNAMES[tp];
 document.getElementById('ptask-id').textContent = '#'+id;
 document.getElementById('ptask-reward').textContent = rstr;
 document.getElementById('ptask-claimed').textContent = Number(b.claimedCount);
 document.getElementById('ptask-max').textContent = Number(b.maxWinners);
 document.getElementById('ptask-remain').textContent = Math.max(0,Number(b.maxWinners)-Number(b.claimedCount));
 document.getElementById('ptask-bar').style.width = pct2+'%';

 // 构建步骤
 const holdAmt=Number(cd.minTokenAmount),holdSec=Number(cd.minHoldSeconds);
 const buyBnb=cd.minBuyBNB&&cd.minBuyBNB!=='0'?ethers.formatEther(cd.minBuyBNB):'';
 const holdAmtStr=holdAmt>0?'持有 ≥ '+holdAmt.toLocaleString()+' 枚目标代币':'持有目标代币';
 const holdSecStr=holdSec>0?'等待持仓达 '+(holdSec>=60?(holdSec/60).toFixed(0)+'分钟':holdSec+'秒'):'等待达标';
 const stepsMap=[
 [holdAmtStr,'点击「开始持仓计时」',holdSecStr,'点击「领取奖励」'],
 [(buyBnb?'买入 ≥ '+buyBnb+' BNB':'买入目标代币'),'AI 自动核查链上记录','核查通过自动派发'],
 [holdAmtStr,'点击「立即领取」（先到先得）','奖励打入你的钱包'],
 ['持有目标代币','填写推荐人地址','被推荐人购买后领取'],
 [holdAmtStr,'报名参赛','截止时按持仓排名前'+Number(b.maxWinners)+'名获奖'],
 ];
 const stepsArr = stepsMap[tp]||stepsMap[0];
 const stepsHtml = '<div class="pn-steps">'
 +'<div style="font-size:10px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:var(--p);margin-bottom:8px">如何参与</div>'
 +stepsArr.map((s,i)=>'<div class="pn-step"><div class="pn-step-num">'+(i+1)+'</div><div class="pn-step-txt">'+s+'</div></div>').join('')
 +'</div>';

 // 门槛卡片
 const thItems=[];
 if(Number(cd.minTokenAmount)>0) thItems.push(['','持币','≥ '+Number(cd.minTokenAmount).toLocaleString()+' 枚']);
 if(Number(cd.minHoldSeconds)>0){const t=holdSec>=60?(holdSec/60).toFixed(0)+'分钟':holdSec+'秒';thItems.push(['⏱','持仓','≥ '+t]);}
 if(Number(cd.minBuyBNB)>0) thItems.push(['','买入','≥ '+ethers.formatEther(cd.minBuyBNB)+' BNB']);
 if(Number(cd.minReferrals)>0) thItems.push(['','推荐','≥ '+Number(cd.minReferrals)+' 人']);
 if(!thItems.length) thItems.push(['','无门槛','任意持币地址']);
 const thHtml = '<div class="pn-thresholds">'
 +thItems.map(([ico,key,val])=>'<div class="pn-th"><div class="pn-th-ico">'+ico+'</div><div class="pn-th-key">'+key+'</div><div class="pn-th-val">'+val+'</div></div>').join('')
 +'</div>';

 // 描述
 const descHtml = m.desc?'<div style="font-size:13px;color:var(--tx3);line-height:1.7;margin-bottom:20px;padding:12px 14px;background:rgba(255,255,255,.03);border-radius:10px;border-left:2px solid rgba(124,58,237,.3)">'+escH(m.desc)+'</div>':'';

 // meta 行
 const metaHtml = ''
 +'<div class="pr"><span class="pk">目标代币</span><span class="pv" style="font-family:monospace;font-size:11px">'+b.targetToken.slice(0,8)+'···'+b.targetToken.slice(-4)+'</span></div>'
 +(m.persona?'<div class="pr"><span class="pk">Agent 人格</span><span class="pv">'+{hunter:'🔴 猎手',strategist:'🟡 军师',herald:'🟢 传令官'}[m.persona]+'</span></div>':'')
 +'<div class="pr"><span class="pk">截止</span><span class="pv">'+fmtTime(Math.max(0,Number(b.deadline)-Math.floor(Date.now()/1000)))+'</span></div>';

 document.getElementById('pbody').innerHTML=
 stepsHtml + thHtml + descHtml + metaHtml
 +'<div class="pn-action">'+actHtml+'</div>'
 +'<div style="margin-top:12px;padding:10px 14px;background:rgba(52,211,153,.06);border:1px solid rgba(52,211,153,.15);border-radius:10px;font-size:11px;color:#34d399;line-height:1.6"> 已领取的奖励不可撤销 · 链上直接打入你的钱包 · 项目方取消任务也无法追回</div>'
 +'<div style="margin-top:14px;display:flex;gap:8px;flex-wrap:wrap">'
 +'<a href="https://www.okx.com/web3/dex-swap#inputChain=56&inputCurrency=0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee&outputChain=56&outputCurrency='+b.targetToken+'" target="_blank" class="btns" style="text-decoration:none;flex:1;text-align:center">去 OKX DEX 买入</a>'
 +'</div>'
 +'<div id="okx-chart-'+id+'" style="margin-top:14px;background:rgba(255,255,255,.03);border:1px solid var(--bd);border-radius:10px;padding:10px"><canvas id="okx-cv-'+id+'" width="320" height="80" style="width:100%;height:80px"></canvas></div>'+'<div id="holder-chart-'+id+'" style="margin-top:10px;background:rgba(255,255,255,.03);border:1px solid var(--bd);border-radius:10px;padding:12px"><div style="font-size:11px;color:var(--tx3);margin-bottom:8px">持有人分布（前10）</div><canvas id="holder-cv-'+id+'" width="200" height="200" style="display:block;margin:0 auto"></canvas><div id="holder-legend-'+id+'" style="margin-top:8px;font-size:10px;color:var(--tx3)"></div></div>'
 +(addr&&b.creator.toLowerCase()===addr.toLowerCase()&&b.active
 ?'<button class="pn-btn-cancel" onclick="closeP();doCancel('+id+')">✕ 取消任务并退款</button>'
 :'')
 +'<div style="margin-top:12px;text-align:center">'
 +'<a href="https://bscscan.com/address/'+CONTRACT+'#events" target="_blank" style="font-size:11px;color:var(--p);text-decoration:none;opacity:.7"> 查看链上所有奖励记录（BSCScan）↗</a>'
 +'</div>';
 });
 document.getElementById('ptitle').textContent=m.title||'任务 #'+id;
 document.getElementById('pbody').innerHTML='<div style="text-align:center;padding:32px;color:var(--su)">加载中...</div>';
 document.getElementById('panel').classList.add('on');
 document.getElementById('pbody').innerHTML='<div style="padding:60px 0;text-align:center;color:var(--tx3)">加载中...</div>';
}
function closeP(){document.getElementById('panel').classList.remove('on')}


function switchMode(m){
 document.getElementById('tab-auto').classList.toggle('on', m==='auto');
 document.getElementById('tab-manual').classList.toggle('on', m==='manual');
 document.getElementById('mode-desc-auto').style.display = m==='auto'?'':'none';
 document.getElementById('mode-desc-manual').style.display = m==='manual'?'':'none';
 document.getElementById('manual-panel').style.display = m==='manual'?'':'none';
 document.getElementById('strat-box-wrap').style.display = m==='auto'?'':'none';
}

function setStrat(el){
 const map={
 '🙌 鼓励长期持仓':'持仓超过20分钟的用户可以领取奖励，鼓励钻石手长期持有，减少抛压',
 ' 奖励早期买入':'买入超过0.05 BNB的早鸟用户直接获得奖励，限前30名',
 ' 推荐奖励裂变':'推荐新用户买入的老用户获得奖励，被推荐人成功购买后双方都有奖励',
 ' 持仓量排名竞赛':'按持仓量排名，截止时持仓量最高的前10名用户瓜分奖池'
 };
 const txt=map[el.textContent.trim()]||el.textContent;
 document.getElementById('strat-input').value=txt;
}

document.getElementById('panel').addEventListener('click',e=>{if(e.target===e.currentTarget)closeP()});

// DELEGATE
function calcD(){
 const b=parseFloat(document.getElementById('d1').value)||0;
 const d=parseInt(document.getElementById('d2').value)||0; // minutes
 if(!b||!d){document.getElementById('ds').style.display='none';return}
 const perMin=(b/d).toFixed(4);
 const tasks=Math.floor(b/0.005);
 document.getElementById('db').textContent=b.toFixed(2);
 document.getElementById('dd').textContent=perMin;
 document.getElementById('dt').textContent=tasks+' 个';
 document.getElementById('ds').style.display='block';
}
let _dgSelectedAgent = null;
function dgSelectAgent(type) {
  // 自定义专属区块
  var cb = document.getElementById('dg-custom-block');
  if(cb) cb.style.display = type==='custom' ? '' : 'none';
 _dgSelectedAgent = type;
 document.querySelectorAll('.dg-agent-card').forEach(el => {
 el.style.borderColor = 'rgba(255,255,255,.1)';
 el.style.background = 'rgba(255,255,255,.04)';
 });
 const el = document.getElementById('dga-'+type);
 if(el) { el.style.borderColor = 'rgba(124,58,237,.6)'; el.style.background = 'rgba(124,58,237,.1)'; }
 const names = {hunter:'猎手',strategist:'军师',herald:'传令官',custom:'自定义'};
 const btnName = document.getElementById('df-btn-name');
 if(btnName) btnName.textContent = names[type]||type;
 dgCalc();
}
function dgCalc() {
 const bnb = parseFloat(document.getElementById('d1')?.value||0);
 if(!bnb) return;
 const fee = bnb * 0.05;
 const net = bnb - fee;
 const perTask = 0.005; // 约每任务花费
 const tasks = Math.floor(net / perTask);
 const el1 = document.getElementById('dg-est-tasks');
 const el2 = document.getElementById('dg-est-reward');
 const el3 = document.getElementById('dg-est-fee');
 if(el1) el1.textContent = tasks + ' 个';
 if(el2) el2.textContent = (perTask*0.8).toFixed(3) + ' BNB';
 if(el3) el3.textContent = fee.toFixed(4) + ' BNB';
}
function dgReset() {
 document.getElementById('dg-form').style.display='';
 document.getElementById('dg-progress').style.display='none';
 document.getElementById('dg-success').style.display='none';
 document.getElementById('dg-submit-btn').disabled=false;
 document.getElementById('d0').value='';
 document.getElementById('d1').value='';
 document.getElementById('d2').value='120';
}
function dgStep(n, status) {
 // status: pending/active/done/error
 const el = document.getElementById('dgps-'+n);
 const ico = document.getElementById('dgps-'+n+'-ico');
 if(!el||!ico) return;
 el.style.opacity='1';
 ico.textContent = status==='done'?'':status==='error'?'':status==='active'?'⏳':'⏳';
 el.style.background = status==='done'?'rgba(52,211,153,.1)':status==='error'?'rgba(239,68,68,.1)':status==='active'?'rgba(124,58,237,.12)':'rgba(255,255,255,.04)';
}

async function submitDelegate(){
 const tok = document.getElementById('d0').value.trim();
 const bnb = document.getElementById('d1').value;
 const mins = document.getElementById('d2').value || '120';
 const tg = document.getElementById('d4')?.value || '';
 if(!tok){toast('请填写代币合约地址','e');return}
 if(!bnb||parseFloat(bnb)<0.01){toast('预算至少 0.01 BNB','e');return}
 if(!_dgSelectedAgent){toast('请先选择一个 Agent','e');return}
 if(!addr){await connectWallet();if(!addr)return;}

 // 切换到进度界面
 document.getElementById('dg-form').style.display='none';
 document.getElementById('dg-progress').style.display='';
 document.getElementById('dg-submit-btn').disabled=true;
 dgStep(1,'active'); dgStep(2,'pending'); dgStep(3,'pending');

 try {
 if(!sign){if(!prov)prov=new ethers.BrowserProvider(window.ethereum);sign=await prov.getSigner();addr=await sign.getAddress();}
 const regCon = new ethers.Contract(REGISTRY, REG_ABI, sign);
 const budget = ethers.parseEther(bnb);
 const expiredAt = Math.floor(Date.now()/1000) + Number(mins)*60;
 const agentName = {hunter:'猎手',strategist:'军师',herald:'传令官',custom:'自定义'}[_dgSelectedAgent]||_dgSelectedAgent;
 const desc = `Seki Agent:${agentName} | ${tok.slice(0,10)} | ${bnb}BNB | ${mins}min`;

 // 第1步：createJob（不扣钱）
 document.getElementById('dg-prog-title').textContent = '第1步：创建委托';
 document.getElementById('dg-prog-desc').textContent = '请在 MetaMask 中确认（不扣费）';
 let jobId;
 try {
 const tx1 = await regCon.createJob('0x0000000000000000000000000000000000000000', addr, expiredAt, desc, HOOK_ADDR);
 const r1 = await tx1.wait();
 const ev = r1.logs.map(l=>{try{return regCon.interface.parseLog(l)}catch{}}).find(e=>e&&e.name==='JobCreated');
 jobId = ev ? Number(ev.args[0]) : null;
 if(jobId===null) throw new Error('未获取到 JobId');
 dgStep(1,'done');
 } catch(e1) { dgStep(1,'error'); throw new Error('创建委托失败: '+(e1.reason||e1.message)); }

 // 服务器帮做 setBudget（Agent 是 provider，有权调用）
 document.getElementById('dg-prog-title').textContent = '自动设置预算...';
 document.getElementById('dg-prog-desc').textContent = 'Agent 正在配置预算参数';
 try {
 const sbr = await fetch('/api/set-budget', {
 method:'POST', headers:{'Content-Type':'application/json'},
 body: JSON.stringify({jobId, budget: bnb})
 });
 const sbd = await sbr.json();
 if(!sbd.ok) throw new Error(sbd.error||'setBudget 失败');
 } catch(e2) { throw new Error('设置预算失败: '+e2.message); }

 // 第2步：fund（真正扣款）
 dgStep(2,'active');
 document.getElementById('dg-prog-title').textContent = '第2步：锁定资金';
 document.getElementById('dg-prog-desc').textContent = `请在 MetaMask 中确认（扣款 ${bnb} BNB）`;
 try {
 const tx3 = await regCon.fund(jobId, budget, '0x', { value: budget });
 await tx3.wait();
 dgStep(2,'done');
 } catch(e3) { dgStep(2,'error'); throw new Error('锁定资金失败: '+(e3.reason||e3.message)); }

 // 第3步：通知后端
 dgStep(3,'active');
 document.getElementById('dg-prog-title').textContent = '激活 Agent...';
 const thresholds = {
 minTokenAmount: parseFloat(document.getElementById('th-amount')?.value)||0,
 minBuyBNB: parseFloat(document.getElementById('th-buy')?.value)||0,
 minHoldSeconds: parseInt(document.getElementById('th-hold')?.value)||0,
 minReferrals: parseInt(document.getElementById('th-ref')?.value)||0,
 };
 await fetch('/api/jobs', {
 method:'POST', headers:{'Content-Type':'application/json'},
 body: JSON.stringify({token:tok, agentType:_dgSelectedAgent, budget:bnb, hours:mins, tg, jobId, owner:addr, thresholds})
 }).catch(()=>{});
 // 本地存
 const list = JSON.parse(localStorage.getItem('mb_delegations')||'[]');
 list.push({jobId, token:tok, agentType:_dgSelectedAgent, agentName, budget:bnb, hours:mins, tg, ts:Date.now(), status:'Funded', owner:addr, expiredAt});
 localStorage.setItem('mb_delegations', JSON.stringify(list));
 dgStep(3,'done');

 // 成功界面
 document.getElementById('dg-progress').style.display='none';
 document.getElementById('dg-success').style.display='';
 document.getElementById('dg-success-desc').textContent = agentName+' 已激活，正在监控 '+tok.slice(0,10)+'...';
 document.getElementById('dg-success-info').innerHTML =
 '<div style="font-size:12px;color:var(--tx2);line-height:1.8">'
 +'<div>Job ID: <strong style="color:var(--p)">#'+jobId+'</strong></div>'
 +'<div>预算: <strong style="color:var(--p)">'+bnb+' BNB</strong></div>'
 +'<div>运营时长: <strong style="color:var(--tx)">'+mins+' 分钟</strong></div>'
 +'<div style="margin-top:8px;font-size:11px;color:var(--tx3)">到期后在「我的」页取回剩余预算</div>'
 +'</div>';

 } catch(e) {
 console.error('[delegate]', e);
 toast(' '+e.message.slice(0,80), 'e');
 document.getElementById('dg-form').style.display='';
 document.getElementById('dg-progress').style.display='none';
 document.getElementById('dg-submit-btn').disabled=false;
 }
}

function loadDelegations(){
 const list=JSON.parse(localStorage.getItem('mb_delegations')||'[]');
 const el=document.getElementById('dlist');
 if(!el)return;
 if(!list.length){el.innerHTML='<div class="empty">暂无委托记录</div>';return}
 const GOALS={hold:'提升持仓',grow:'增加地址',trade:'活跃交易',refer:'裂变推荐'};
 el.innerHTML=list.slice().reverse().map((d,ri)=>{
 const i=list.length-1-ri;
 return '<div class="dlrow"><div class="dlinfo"><h4>'+d.token.slice(0,10)+'...'+d.token.slice(-6)+'</h4>'
 +'<div class="dlmeta">'+GOALS[d.goal]+' · 预算 '+d.budget+' BNB · '+d.days+' 天 · '
 +new Date(d.ts).toLocaleDateString('zh-CN')+'</div></div>'
 +'<button class="bsm" onclick="delD('+i+')">取消</button></div>';
 }).join('');
}
function delD(i){
 const list=JSON.parse(localStorage.getItem('mb_delegations')||'[]');
 list.splice(i,1);localStorage.setItem('mb_delegations',JSON.stringify(list));
 loadDelegations();toast('委托已取消','s');
}

// DASHBOARD

async function loadDiscover() {
 const el = document.getElementById('discover-list');
 if (!el) return;
 try {
 const r = await fetch('/api/okx/discover');
 const d = await r.json();
 if (!d.ok || !d.tokens.length) { el.innerHTML='<div class="empty">暂无新代币</div>'; return; }
 el.innerHTML = d.tokens.map(t=>`
 <div style="background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);border-radius:12px;padding:12px;cursor:pointer" onclick="window.open('https://four.meme/token/${t.addr}','_blank')">
 <div style="font-weight:700;font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escH(t.name)}</div>
 <div style="font-size:11px;color:var(--p);margin:2px 0">\$${escH(t.symbol)}</div>
 <div style="font-size:10px;color:var(--tx3);font-family:monospace">${t.addr.slice(0,10)}...${t.addr.slice(-6)}</div>
 <div style="font-size:10px;color:var(--tx3);margin-top:4px">${new Date(t.ts*1000).toLocaleString('zh-CN')}</div>
 </div>
 `).join('');
 } catch(e) { el.innerHTML='<div class="empty">加载失败</div>'; }
}


// ── 功能3: 日志时间轴（增强现有loadLog，txHash可点击）
// 已有 loadLog，通过 linkifyMsg 处理 txHash 链接，已满足需求


async function loadAgentReport() {
 const el = document.getElementById('agent-report');
 const elD = document.getElementById('agent-report-days');
 if (!el) return;
 try {
 const r = await fetch('/api/agent/report');
 const d = await r.json();
 if (!d.ok) return;
 el.innerHTML = [
 {label:'总发布任务',val:d.total.tasks,color:'#34d399'},
 {label:'日志总条数',val:d.total.logs,color:'#7c3aed'},
 {label:'运营天数',val:Object.keys(d.days).length,color:'#3b82f6'},
 ].map(s=>`<div style="background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);border-radius:12px;padding:16px;text-align:center"><div style="font-size:24px;font-weight:900;color:${s.color}">${s.val}</div><div style="font-size:11px;color:var(--tx3);margin-top:4px">${s.label}</div></div>`).join('');
 if (elD && Object.keys(d.days).length) {
 elD.innerHTML = Object.entries(d.days).reverse().slice(0,7).map(([day,v])=>`<div style="display:flex;justify-content:space-between;font-size:12px;padding:6px 0;border-bottom:1px solid rgba(255,255,255,.05)"><span style="color:var(--tx3)">${day}</span><span style="color:#34d399">发布 ${v.tasks} 任务</span></div>`).join('');
 } else if(elD) { elD.innerHTML='<div class="empty">暂无运营数据</div>'; }
 } catch(e) { if(el) el.innerHTML='<div class="empty">加载失败</div>'; }
}

// ── 功能4: 委托代币监控
const ATYPE = ['基础持仓型','交易激励型','社区增长型','锦标赛型'];
async function loadJobMonitor() {
 const el = document.getElementById('job-monitor'); if(!el) return;
 try {
 const r = await fetch('/api/jobs');
 const jobs = await r.json();
 const active = jobs.filter(j=>j.active);
 if (!active.length) { el.innerHTML='<div class="empty">暂无委托代币</div>'; return; }
 el.innerHTML = active.map(j=>`
 <div style="background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);border-radius:14px;padding:16px">
 <div style="font-weight:700;font-size:14px;margin-bottom:4px">${escH(j.token?.slice(0,10)+'...'+j.token?.slice(-6)||'—')}</div>
 <div style="font-size:11px;color:var(--p);margin-bottom:8px">Agent: ${escH(ATYPE[j.agentType]||j.agentType)}</div>
 <div style="display:flex;justify-content:space-between;font-size:11px;color:var(--tx3)">
 <span>预算</span><span style="color:#34d399">${j.budget||0} BNB</span>
 </div>
 <div style="display:flex;justify-content:space-between;font-size:11px;color:var(--tx3);margin-top:4px">
 <span>TG</span><span>${escH(j.tg||'—')}</span>
 </div>
 <div style="margin-top:10px;font-size:10px;color:var(--tx3)">${new Date(j.createdAt||0).toLocaleDateString('zh-CN')}</div>
 </div>
 `).join('');
 } catch(e) { el.innerHTML='<div class="empty">加载失败</div>'; }
}

// ── 功能5: 排行榜
async function loadLeaderboard() {
 const el = document.getElementById('task-leaderboard'); if(!el) return;
 if (!tasks.length) { el.innerHTML='<div class="empty">暂无任务数据</div>'; return; }
 const sorted = [...tasks].filter(t=>t.b.claimedCount>0).sort((a,b)=>b.b.claimedCount-a.b.claimedCount).slice(0,10);
 if (!sorted.length) { el.innerHTML='<div class="empty">暂无完成记录</div>'; return; }
 const tnames=['持仓','买入','早鸟','锦标赛'];
 el.innerHTML = '<div style="display:flex;flex-direction:column;gap:8px">'+sorted.map((t,i)=>`
 <div style="display:flex;align-items:center;gap:12px;padding:10px 14px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.06);border-radius:10px">
 <div style="font-size:20px;font-weight:900;color:rgba(255,255,255,.15);min-width:28px">${i+1}</div>
 <div style="flex:1">
 <div style="font-size:13px;font-weight:600">${tnames[t.b.taskType]||'任务'} #${t.id}</div>
 <div style="font-size:10px;color:var(--tx3);font-family:monospace">${t.b.targetToken.slice(0,12)}...</div>
 </div>
 <div style="text-align:right">
 <div style="font-size:13px;font-weight:700;color:#34d399">${t.b.claimedCount} 人完成</div>
 <div style="font-size:10px;color:var(--tx3)">${(Number(t.b.totalReward)/1e18).toFixed(4)} BNB</div>
 </div>
 </div>
 `).join('')+'</div>';
}

// ── 功能6: 鲸鱼持仓监控
let _portfolioLast = {};
let _portfolioTimer = null;
async function loadPortfolio() {
 if (!addr) return;
 const el = document.getElementById('portfolio-list'); if(!el) return;
 try {
 const r = await fetch('/api/okx/portfolio?wallet='+addr);
 const d = await r.json();
 if (!d.ok) return;
 const assets = [];
 (d.data||[]).forEach(chain=>{ (chain.tokenAssets||[]).forEach(t=>assets.push(t)); });
 // 检测变化
 assets.forEach(t=>{
 const k = t.tokenContractAddress;
 const prev = _portfolioLast[k];
 if (prev && Math.abs(parseFloat(t.balance)-parseFloat(prev))/parseFloat(prev) > 0.1) {
 const diff = parseFloat(t.balance) - parseFloat(prev);
 toast((diff>0?' 鲸鱼买入':' 鲸鱼减仓')+' '+t.tokenSymbol+' 变化 '+(diff>0?'+':'')+diff.toFixed(2), diff>0?'s':'e');
 }
 _portfolioLast[k] = t.balance;
 });
 if (!assets.length) { el.innerHTML='<div class="empty">暂无持仓</div>'; return; }
 el.innerHTML = assets.slice(0,12).map(t=>`
 <div style="background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);border-radius:12px;padding:12px">
 <div style="font-weight:700;font-size:13px">${escH(t.tokenSymbol||'—')}</div>
 <div style="font-size:11px;color:var(--tx3);margin-top:2px">${escH(t.tokenName||'')}</div>
 <div style="font-size:13px;font-weight:600;color:#34d399;margin-top:6px">${parseFloat(t.balance||0).toFixed(4)}</div>
 <div style="font-size:11px;color:var(--tx3)">≈ $${parseFloat(t.tokenValue||0).toFixed(2)}</div>
 </div>
 `).join('');
 } catch(e) { console.warn('portfolio err',e); }
}
function startPortfolioMonitor() {
 if (_portfolioTimer) clearInterval(_portfolioTimer);
 loadPortfolio();
 _portfolioTimer = setInterval(loadPortfolio, 60000);
}


// SSE 实时任务推送
let _sseConn = null;
function startSSE() {
 if (_sseConn) return;
 try {
 _sseConn = new EventSource('/api/sse');
 _sseConn.onmessage = e => {
 const d = JSON.parse(e.data);
 if (d.type==='log' && d.tag==='CREATE') {
 toast(' Agent 发布新任务: '+(d.symbol||d.msg?.slice(0,30)||''),'i');
 loadAll();
 }
 };
 _sseConn.onerror = () => { _sseConn=null; };
 } catch {}
}


async function loadMarket() {
 // 新上线
 const elN = document.getElementById('market-new');
 const elH = document.getElementById('market-hot');
 if (elN) {
 elN.innerHTML='<div class="empty">加载中...</div>';
 try {
 const r=await fetch('/api/okx/discover');
 const d=await r.json();
 elN.innerHTML=(d.tokens||[]).map(t=>`<div style="background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);border-radius:12px;padding:12px;cursor:pointer" onclick="window.open('https://four.meme/token/${t.addr}','_blank')"><div style="font-weight:700;font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escH(t.name)}</div><div style="font-size:11px;color:var(--p);margin:2px 0">$${escH(t.symbol)}</div><div style="font-size:10px;color:var(--tx3);font-family:monospace">${t.addr.slice(0,10)}...</div><div style="font-size:10px;color:var(--tx3);margin-top:4px">${new Date(t.ts*1000).toLocaleString('zh-CN')}</div></div>`).join('')||'<div class="empty">暂无</div>';
 } catch { elN.innerHTML='<div class="empty">加载失败</div>'; }
 }
 // 热度榜（按任务claimedCount）
 if (elH && tasks.length) {
 const sorted=[...tasks].sort((a,b)=>b.b.claimedCount-a.b.claimedCount).slice(0,10);
 const tnames=['持仓','买入','早鸟','锦标赛'];
 elH.innerHTML=sorted.map((t,i)=>`<div style="display:flex;align-items:center;gap:12px;padding:10px 14px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.06);border-radius:10px"><div style="font-size:20px;font-weight:900;color:rgba(255,255,255,.15);min-width:28px">${i+1}</div><div style="flex:1"><div style="font-size:13px;font-weight:600">${tnames[t.b.taskType]||'任务'} #${t.id}</div><div style="font-size:10px;color:var(--tx3);font-family:monospace">${t.b.targetToken.slice(0,14)}...</div></div><div style="text-align:right"><div style="font-size:13px;font-weight:700;color:#34d399">${t.b.claimedCount} 人</div></div></div>`).join('');
 } else if (elH) { elH.innerHTML='<div class="empty">暂无任务数据</div>'; }
}



document.addEventListener('click', function(e){
 // 关闭 公平保障 下拉
 var fairWrap = document.getElementById('nav-fair-wrap');
 var fairDd = document.getElementById('fair-dropdown');
 if(fairDd && fairWrap && !fairWrap.contains(e.target)) fairDd.style.display='none';

});


// 热门代币页
let _hotAll = [];
async function loadHotPage() {
 const el = document.getElementById('hot-page-list');
 if (!el) return;
 el.innerHTML = '<div style="text-align:center;padding:48px;color:var(--tx3);grid-column:1/-1">加载中...</div>';
 const isXLayer = currentChain && currentChain.id === 196;
 try {
 if (isXLayer) {
   // X Layer: 用 OKLink API 查活跃代币
   const r = await fetch('/api/okx/discover?chain=xlayer');
   const d = await r.json();
   _hotAll = d.tokens || [];
   if (!_hotAll.length) {
     el.innerHTML = '<div style="text-align:center;padding:64px 20px;color:var(--tx3);grid-column:1/-1"><div style=\'font-size:15px;margin-bottom:8px\'>X Layer 热门代币数据加载中</div><div style=\'font-size:12px\'>X Layer 生态正在成长，数据将持续更新</div><div style=\'margin-top:20px\'><a href=\'https://dyorswap.org/\' target=\'_blank\' style=\'color:var(--p);text-decoration:none;font-size:12px\'>→ 前往 DyorSwap 查看 X Layer 代币</a></div></div>';
     return;
   }
 } else {
   // BSC: 用现有接口
   const r = await fetch('/api/okx/discover');
   const d = await r.json();
   _hotAll = d.tokens || [];
 }
 renderHotPage(_hotAll, isXLayer);
 } catch {
 el.innerHTML = '<div style="text-align:center;padding:48px;color:var(--tx3);grid-column:1/-1">加载失败</div>';
 }
}

function hotFilter(type, btn) {
 document.querySelectorAll('[id^="hot-filter-"]').forEach(b => b.style.opacity = '.5');
 btn.style.opacity = '1';
 let list = [..._hotAll];
 if (type === 'up') list = list.filter(t=>t.change24h>0).sort((a,b)=>b.change24h-a.change24h);
 else if (type === 'down') list = list.filter(t=>t.change24h<0).sort((a,b)=>a.change24h-b.change24h);
 renderHotPage(list, currentChain && currentChain.id === 196);
}

async function renderHotPage(tokens, isXLayer) {
 const el = document.getElementById('hot-page-list');
 if (!el) return;
 if (!tokens.length) { el.innerHTML = '<div style="text-align:center;padding:48px;color:var(--tx3);grid-column:1/-1">暂无数据</div>'; return; }
 // 批量拉价格
 // CoinGecko数据已含价格，直接用
 const withPrice = tokens.slice(0, 40).map(t => ({ ...t }));
 // 存储到全局供点击查找
 window._hotTokens = withPrice;
 el.innerHTML = withPrice.map((t,idx) => {
 const p = t.price || 0;
 const priceStr = p < 0.000001 ? '$'+p.toExponential(2) : p < 0.01 ? '$'+p.toFixed(8) : p < 1 ? '$'+p.toFixed(4) : '$'+p.toFixed(2);
 const chg = t.change24h;
 const chgStr = chg != null ? (chg >= 0 ? '+' : '') + chg.toFixed(2) + '%' : '—';
 const chgColor = chg >= 0 ? '#34d399' : '#f87171';
 const vol = t.volume ? (t.volume >= 1e6 ? '$'+(t.volume/1e6).toFixed(1)+'M' : '$'+(t.volume/1e3).toFixed(0)+'K') : '—';
 const avatar = t.image ? `<img src="${t.image}" style="width:36px;height:36px;border-radius:50%;object-fit:cover" onerror="this.style.display='none'">` : `<div style="width:36px;height:36px;border-radius:50%;background:linear-gradient(135deg,rgba(124,58,237,.3),rgba(59,130,246,.2));display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:900;color:var(--p)">${escH((t.symbol||'?').slice(0,2))}</div>`;
 const chainId = isXLayer ? 196 : 56;
 const link = t.addr ? `https://www.okx.com/web3/dex-swap#inputChain=${chainId}&inputCurrency=0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee&outputChain=${chainId}&outputCurrency=${t.addr}` : (t.pairUrl || '#');
 return `<div style="background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);border-radius:16px;padding:16px;cursor:pointer;transition:border-color .2s" onmouseover="this.style.borderColor='rgba(124,58,237,.4)'" onmouseout="this.style.borderColor='rgba(255,255,255,.08)'" onclick="window.open('${link}','_blank')">
 <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px">
 ${avatar}
 <div style="overflow:hidden;flex:1">
 <div style="font-size:13px;font-weight:800;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escH(t.name||t.symbol||'Unknown')}</div>
 <div style="font-size:11px;color:var(--p);font-weight:700">${escH(t.symbol||'')}</div>
 </div>
 <div style="font-size:12px;font-weight:700;color:${chgColor}">${chgStr}</div>
 </div>
 <div style="font-size:18px;font-weight:900;margin-bottom:8px">${priceStr}</div>
 <div style="display:flex;justify-content:space-between;align-items:center">
 <div style="font-size:10px;color:var(--tx3)">24h量 ${vol}</div>
 </div>
 </div>`;
 }).join('');
}

// ===== OKX 扩展功能 =====

// BNB 实时价格（30s刷新）
async function loadBnbPrice() {
 try {
 // BSC: WBNB, X Layer: OKB (用 OKX spot price)
 const isXLayer = currentChain && currentChain.id === 196;
 const tokenAddr = isXLayer
   ? '0x3f4b6664338f23d2397c953f2ab4ce8031663f80' // OKB on BSC (proxy price)
   : '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c'; // WBNB
 const r = await fetch('/api/okx/price?token='+tokenAddr);
 const d = await r.json();
 const el = document.getElementById('bnb-val');
 if (el && d.price) {
   const sym = isXLayer ? 'OKB' : 'BNB';
   el.textContent = '$' + parseFloat(d.price).toFixed(2) + ' ' + sym;
 }
 } catch {}
}
setInterval(loadBnbPrice, 30000);
loadBnbPrice();
// [applyWorld moved to end]

// 热门代币横滚
async function loadHotTicker() {
 try {
 const r = await fetch('/api/okx/discover');
 const d = await r.json();
 const tokens = (d.tokens || []).slice(0, 20);
 if (!tokens.length) return;
 const inner = document.getElementById('hot-ticker-inner');
 if (!inner) return;
 // 获取价格
 const items = await Promise.all(tokens.map(async t => {
 try {
 const pr = await fetch('/api/okx/price?token=' + t.addr);
 const pd = await pr.json();
 return { ...t, price: pd.price ? '$' + parseFloat(pd.price).toFixed(6) : '' };
 } catch { return { ...t, price: '' }; }
 }));
 const html = items.map(t =>
 `<span style="cursor:pointer;font-size:12px" onclick="window.open('https://www.okx.com/web3/dex-swap#inputChain=56&inputCurrency=0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee&outputChain=56&outputCurrency=${t.addr}','_blank')">` +
 `<span style="font-weight:700;color:var(--tx)">${escH(t.symbol)}</span>` +
 `<span style="color:var(--tx3);margin:0 4px">/</span>` +
 `<span style="color:#34d399">${t.price || '—'}</span>` +
 `</span>`
 ).join('<span style="color:rgba(255,255,255,.15);margin:0 8px">·</span>');
 // 复制两份实现无缝滚动
 inner.innerHTML = html + '<span style="margin:0 32px"></span>' + html;
 } catch {}
}
loadHotTicker();

// 价格异动监控（委托代币涨跌>15%时推送toast）
let _priceSnapshots = {};
async function monitorPriceAlerts() {
 try {
 const jr = await fetch('/api/jobs');
 const jobs = (await jr.json() || []).filter(j => j.active && j.token);
 for (const job of jobs) {
 const r = await fetch('/api/okx/price?token=' + job.token);
 const d = await r.json();
 if (!d.price) continue;
 const cur = parseFloat(d.price);
 const prev = _priceSnapshots[job.token];
 if (prev && Math.abs((cur - prev) / prev) >= 0.15) {
 const pct = ((cur - prev) / prev * 100).toFixed(1);
 const sym = job.token.slice(0, 6) + '...';
 toast((cur > prev ? '' : '') + ' ' + sym + ' 价格' + (cur > prev ? '涨' : '跌') + pct + '%', cur > prev ? 's' : 'e');
 }
 _priceSnapshots[job.token] = cur;
 }
 } catch {}
}
setInterval(monitorPriceAlerts, 60000);
setTimeout(monitorPriceAlerts, 5000);


function fairTab(tab, el) {
  // 同步页面内 TAB 按钮高亮
  var ps = document.getElementById('fair-page-security');
  var ph = document.getElementById('fair-page-howto');
  if(ps && ph) {
    [ps,ph].forEach(function(b){ b.style.background='transparent'; b.style.color='var(--tx2)'; b.style.border='1px solid rgba(255,255,255,.15)'; });
    var active = tab==='security' ? ps : ph;
    active.style.background='rgba(124,58,237,.15)'; active.style.color='var(--p)'; active.style.border='1px solid var(--p)';
  }
 document.querySelectorAll('[id^="fair-tab-"]').forEach(b=>b.classList.remove('on'));
 el.classList.add('on');
 document.getElementById('fair-section-security').style.display = tab==='security'?'':'none';
 document.getElementById('fair-section-howto').style.display = tab==='howto'?'':'none';
}


// ===== 市场情绪仪表盘 =====
async function loadMarketSentiment() {
 try {
 const r = await fetch('/api/market/sentiment');
 const d = await r.json();
 if (!d.ok) return;
 // 情绪分仪表
 const score = d.score;
 document.getElementById('sentiment-score').textContent = score;
 document.getElementById('sentiment-cursor').style.left = score + '%';
 const badge = document.getElementById('sentiment-badge');
 const colors = score>=75?['#f59e0b','rgba(245,158,11,.15)']:score>=55?['#34d399','rgba(52,211,153,.15)']:score>=45?['var(--tx2)','rgba(255,255,255,.08)']:score>=25?['#f87171','rgba(248,113,113,.15)']:['#ef4444','rgba(239,68,68,.15)'];
 badge.textContent = d.sentiment;
 badge.style.color = colors[0];
 badge.style.background = colors[1];
 // 指标格子
 const bnbEl = document.getElementById('mkt-bnb');
 if (bnbEl) { bnbEl.textContent=(d.bnbChg>=0?'+':'')+d.bnbChg+'%'; bnbEl.style.color=d.bnbChg>=0?'#34d399':'#f87171'; }
 const frEl = document.getElementById('mkt-fr');
 if (frEl) { frEl.textContent=d.fundRate+'%'; frEl.style.color=d.fundRate>0.05?'#f59e0b':d.fundRate<-0.01?'#f87171':'#34d399'; }
 const obEl = document.getElementById('mkt-ob');
 if (obEl) { obEl.textContent=d.obRatio+'x'; obEl.style.color=d.obRatio>1.3?'#34d399':d.obRatio<0.8?'#f87171':'var(--tx)'; }
 const whaleEl = document.getElementById('mkt-whale');
 if (whaleEl) { whaleEl.textContent=''+d.whaleBuys+'买/'+d.whaleSells+'卖'; whaleEl.style.color=d.whaleBuys>d.whaleSells?'#34d399':d.whaleSells>d.whaleBuys?'#f87171':'var(--tx)'; }
 // 更新 Agent 决策理由
 const reasoning = document.getElementById('agent-reasoning');
 if (reasoning) {
 const signal = score>=75?'市场极度贪婪，优先发持仓任务锁住筹码':
 score>=55?'市场偏多，适合发早鸟任务趁热度':
 score>=45?'市场中性，LLM 自由决策任务类型':
 score>=25?'市场偏恐慌，发买入任务激励抄底':
 '极度恐慌，发高奖励买入任务护盘';
 const whale = d.whaleBuys>=3&&d.whaleBuys>d.whaleSells*2?'　检测到鲸鱼入场（'+d.whaleBuys+'笔大单），强制触发5分钟早鸟任务':'';
 reasoning.innerHTML = '<strong style="color:var(--p)">当前决策依据：</strong>情绪分 '+score+'/100（'+d.sentiment+'）　BNB '+d.bnbChg+'%　资金费率 '+d.fundRate+'%　盘口比 '+d.obRatio+'x<br><span style="color:#34d399">→ '+signal+whale+'</span>';
 }
 } catch {}
}
setInterval(loadMarketSentiment, 30000);

// ===== AI 逻辑页情绪 =====
async function loadLogicSentiment() {
 try {
 const r = await fetch('/api/market/sentiment');
 const d = await r.json();
 if (!d.ok) return;
 const score = d.score;
 const colors = score>=75?['#f59e0b','rgba(245,158,11,.15)']:score>=55?['#34d399','rgba(52,211,153,.15)']:score>=45?['var(--tx)','rgba(255,255,255,.08)']:score>=25?['#f87171','rgba(248,113,113,.15)']:['#ef4444','rgba(239,68,68,.15)'];
 const badge=document.getElementById('logic-sentiment-badge');if(badge){badge.textContent=d.sentiment;badge.style.color=colors[0];badge.style.background=colors[1];}
 const cursor=document.getElementById('logic-sentiment-cursor');if(cursor)cursor.style.left=score+'%';
 const scoreEl=document.getElementById('logic-sentiment-score');if(scoreEl)scoreEl.textContent=score;
 const bnbEl=document.getElementById('logic-bnb');if(bnbEl){bnbEl.textContent=(d.bnbChg>=0?'+':'')+d.bnbChg+'%';bnbEl.style.color=d.bnbChg>=0?'#34d399':'#f87171';}
 const frEl=document.getElementById('logic-fr');if(frEl){frEl.textContent=d.fundRate+'%';frEl.style.color=d.fundRate>0.05?'#f59e0b':d.fundRate<-0.01?'#f87171':'#34d399';}
 const obEl=document.getElementById('logic-ob');if(obEl){obEl.textContent=d.obRatio+'x';obEl.style.color=d.obRatio>1.3?'#34d399':d.obRatio<0.8?'#f87171':'var(--tx)';}
 const wEl=document.getElementById('logic-whale');if(wEl){wEl.textContent=d.whaleBuys+'B/'+d.whaleSells+'S';wEl.style.color=d.whaleBuys>d.whaleSells?'#34d399':d.whaleSells>d.whaleBuys?'#f87171':'var(--tx)';}
 const signal=score>=75?'市场极度贪婪，优先发持仓任务锁住筹码，防止获利盘砸盘':score>=55?'市场偏多，适合发早鸟任务趁热度造势':score>=45?'市场中性，LLM 自由推理综合链上数据决策':score>=25?'市场偏恐慌，发买入任务激励抄底稳住底部支撑':'极度恐慌，触发高奖励买入任务覆盖用户损失';
 const whale=d.whaleBuys>=3&&d.whaleBuys>d.whaleSells*2?' 鲸鱼入场（3m '+d.whaleBuys+'笔大买单），强制5分钟早鸟任务！':'';
 const rEl=document.getElementById('logic-reasoning');
 if(rEl)rEl.innerHTML='<strong style="color:var(--p)">当前决策依据：</strong>情绪分 '+score+'/100（'+d.sentiment+'） BNB '+d.bnbChg+'% 资金费率 '+d.fundRate+'% 盘口比 '+d.obRatio+'x<br><span style="color:#34d399">→ '+signal+whale+'</span>';
 } catch(e){}
}


// SekiRegistry 合约配置
const SEKI_REGISTRY = {
  bsc: '0xe56a01cacb7d31a5e15c81de9f69c430ee597ae2',
  xlayer: '0x72F4eA26f2f7338C97618E623be420d840FFb7Bf',
};
const SEKI_ABI = [
  'function createService(address agentAddr,uint256 pricePerCycle,uint256 cycleSecs,string name,string description) returns (uint256)',
  'function subscribeService(uint256 serviceId,uint256 cycles) payable',
  'function createBountyTask(string title,string description,string verifyRule,uint256 rewardPerWinner,uint256 maxWinners,uint256 deadlineSecs,bool agentVerified) payable returns (uint256)',
  'function submitWork(uint256 taskId,string proofUrl)',
  'function createProposal(string description,address callTarget,bytes callData,uint256 deadlineSecs) payable returns (uint256)',
  'function vote(uint256 proposalId,bool support)',
  'function executeProposal(uint256 proposalId)',
  'function nextServiceId() view returns (uint256)',
  'function nextTaskId() view returns (uint256)',
  'function nextProposalId() view returns (uint256)',
  'function isSubscribed(uint256 serviceId,address user) view returns (bool)',
];

function getSekiContract(signer) {
  const addr = currentChain && currentChain.id === 196 ? SEKI_REGISTRY.xlayer : SEKI_REGISTRY.bsc;
  return new ethers.Contract(addr, SEKI_ABI, signer || new ethers.JsonRpcProvider(currentChain ? currentChain.rpc : 'https://bsc-dataseed.binance.org/'));
}

function showAppModal(type) {
  const modal = document.getElementById('app-modal');
  const title = document.getElementById('modal-title');
  const body = document.getElementById('modal-body');
  const sym = currentChain ? currentChain.symbol : 'BNB';
  if (type === 'subscribe') {
    title.textContent = '注册 Agent 服务';
    body.innerHTML = `
      <div style="display:flex;flex-direction:column;gap:14px">
        <div><label style="font-size:11px;color:var(--tx3);font-weight:700;display:block;margin-bottom:6px">服务名称</label>
          <input id="svc-name" placeholder="例: AI 推文生成" style="width:100%;padding:10px 14px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);border-radius:10px;color:var(--tx);font-size:13px;box-sizing:border-box"></div>
        <div><label style="font-size:11px;color:var(--tx3);font-weight:700;display:block;margin-bottom:6px">服务描述</label>
          <textarea id="svc-desc" rows="2" placeholder="描述你的 Agent 能做什么" style="width:100%;padding:10px 14px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);border-radius:10px;color:var(--tx);font-size:13px;resize:none;box-sizing:border-box"></textarea></div>
        <div><label style="font-size:11px;color:var(--tx3);font-weight:700;display:block;margin-bottom:6px">每周期价格 (${sym})</label>
          <input id="svc-price" type="number" step="0.001" placeholder="0.01" style="width:100%;padding:10px 14px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);border-radius:10px;color:var(--tx);font-size:13px;box-sizing:border-box"></div>
        <div><label style="font-size:11px;color:var(--tx3);font-weight:700;display:block;margin-bottom:6px">周期时长（分钟）</label>
          <input id="svc-cycle" type="number" placeholder="1440" value="1440" style="width:100%;padding:10px 14px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);border-radius:10px;color:var(--tx);font-size:13px;box-sizing:border-box"></div>
        <button onclick="submitCreateService()" style="padding:14px;background:rgba(124,58,237,.8);border:none;border-radius:12px;color:#fff;font-size:14px;font-weight:700;cursor:pointer;margin-top:4px">注册服务</button>
        <div id="svc-status" style="font-size:12px;color:var(--tx3);text-align:center"></div>
      </div>`;
  } else if (type === 'bounty') {
    title.textContent = '发布外包任务';
    body.innerHTML = `
      <div style="display:flex;flex-direction:column;gap:14px">
        <div><label style="font-size:11px;color:var(--tx3);font-weight:700;display:block;margin-bottom:6px">任务标题</label>
          <input id="bt-title" placeholder="例: 设计 Seki 品牌 Logo" style="width:100%;padding:10px 14px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);border-radius:10px;color:var(--tx);font-size:13px;box-sizing:border-box"></div>
        <div><label style="font-size:11px;color:var(--tx3);font-weight:700;display:block;margin-bottom:6px">任务描述</label>
          <textarea id="bt-desc" rows="2" style="width:100%;padding:10px 14px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);border-radius:10px;color:var(--tx);font-size:13px;resize:none;box-sizing:border-box"></textarea></div>
        <div><label style="font-size:11px;color:var(--tx3);font-weight:700;display:block;margin-bottom:6px">AI 验收规则</label>
          <input id="bt-rule" placeholder="例: 提交图片链接，需含 Seki 文字" style="width:100%;padding:10px 14px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);border-radius:10px;color:var(--tx);font-size:13px;box-sizing:border-box"></div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
          <div><label style="font-size:11px;color:var(--tx3);font-weight:700;display:block;margin-bottom:6px">每人奖励 (${sym})</label>
            <input id="bt-reward" type="number" step="0.001" placeholder="0.01" style="width:100%;padding:10px 14px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);border-radius:10px;color:var(--tx);font-size:13px;box-sizing:border-box"></div>
          <div><label style="font-size:11px;color:var(--tx3);font-weight:700;display:block;margin-bottom:6px">名额</label>
            <input id="bt-max" type="number" placeholder="5" value="5" style="width:100%;padding:10px 14px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);border-radius:10px;color:var(--tx);font-size:13px;box-sizing:border-box"></div>
        </div>
        <button onclick="submitBountyTask()" style="padding:14px;background:rgba(52,211,153,.2);border:1px solid rgba(52,211,153,.4);border-radius:12px;color:#34d399;font-size:14px;font-weight:700;cursor:pointer">发布任务</button>
        <div id="bt-status" style="font-size:12px;color:var(--tx3);text-align:center"></div>
      </div>`;
  } else if (type === 'dao') {
    title.textContent = '创建 DAO 提案';
    body.innerHTML = `
      <div style="display:flex;flex-direction:column;gap:14px">
        <div><label style="font-size:11px;color:var(--tx3);font-weight:700;display:block;margin-bottom:6px">提案描述</label>
          <textarea id="dao-desc" rows="3" placeholder="描述这个提案要做什么" style="width:100%;padding:10px 14px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);border-radius:10px;color:var(--tx);font-size:13px;resize:none;box-sizing:border-box"></textarea></div>
        <div><label style="font-size:11px;color:var(--tx3);font-weight:700;display:block;margin-bottom:6px">目标合约地址</label>
          <input id="dao-target" placeholder="0x..." style="width:100%;padding:10px 14px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);border-radius:10px;color:var(--tx);font-size:13px;box-sizing:border-box"></div>
        <div><label style="font-size:11px;color:var(--tx3);font-weight:700;display:block;margin-bottom:6px">调用数据 (calldata hex)</label>
          <input id="dao-data" placeholder="0x" value="0x" style="width:100%;padding:10px 14px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);border-radius:10px;color:var(--tx);font-size:13px;box-sizing:border-box"></div>
        <div><label style="font-size:11px;color:var(--tx3);font-weight:700;display:block;margin-bottom:6px">投票时长（分钟）</label>
          <input id="dao-dur" type="number" placeholder="60" value="60" style="width:100%;padding:10px 14px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);border-radius:10px;color:var(--tx);font-size:13px;box-sizing:border-box"></div>
        <button onclick="submitDAOProposal()" style="padding:14px;background:rgba(245,158,11,.15);border:1px solid rgba(245,158,11,.3);border-radius:12px;color:#f59e0b;font-size:14px;font-weight:700;cursor:pointer">创建提案</button>
        <div id="dao-status" style="font-size:12px;color:var(--tx3);text-align:center"></div>
      </div>`;
  }
  modal.style.display = 'block';
}

function closeAppModal() {
  document.getElementById('app-modal').style.display = 'none';
}

async function submitCreateService() {
  const st = document.getElementById('svc-status');
  if (!con) { st.textContent = '请先连接钱包'; return; }
  try {
    st.textContent = '等待确认...';
    const c = getSekiContract(sign);
    const price = ethers.parseEther(document.getElementById('svc-price').value || '0.01');
    const cycle = BigInt((parseInt(document.getElementById('svc-cycle').value) || 1440) * 60);
    const tx = await c.createService(addr, price, cycle,
      document.getElementById('svc-name').value,
      document.getElementById('svc-desc').value);
    st.textContent = '交易提交...';
    await tx.wait();
    st.textContent = '✓ 服务注册成功！';
    st.style.color = '#34d399';
  } catch(e) { st.textContent = '失败: ' + (e.reason || e.message.slice(0,60)); st.style.color = '#f87171'; }
}

async function submitBountyTask() {
  const st = document.getElementById('bt-status');
  if (!con) { st.textContent = '请先连接钱包'; return; }
  try {
    st.textContent = '等待确认...';
    const c = getSekiContract(sign);
    const rPW = ethers.parseEther(document.getElementById('bt-reward').value || '0.01');
    const maxW = BigInt(document.getElementById('bt-max').value || '5');
    const total = rPW * maxW;
    const fee = total * 500n / 10000n;
    const tx = await c.createBountyTask(
      document.getElementById('bt-title').value,
      document.getElementById('bt-desc').value,
      document.getElementById('bt-rule').value,
      rPW, maxW, 3600n, true, // 1h deadline, agent verified
      { value: total + fee }
    );
    st.textContent = '交易提交...';
    await tx.wait();
    st.textContent = '✓ 任务发布成功！';
    st.style.color = '#34d399';
  } catch(e) { st.textContent = '失败: ' + (e.reason || e.message.slice(0,60)); st.style.color = '#f87171'; }
}

async function submitDAOProposal() {
  const st = document.getElementById('dao-status');
  if (!con) { st.textContent = '请先连接钱包'; return; }
  try {
    st.textContent = '等待确认...';
    const c = getSekiContract(sign);
    const dur = BigInt((parseInt(document.getElementById('dao-dur').value) || 60) * 60);
    const tx = await c.createProposal(
      document.getElementById('dao-desc').value,
      document.getElementById('dao-target').value,
      document.getElementById('dao-data').value,
      dur
    );
    st.textContent = '交易提交...';
    await tx.wait();
    st.textContent = '✓ 提案创建成功！';
    st.style.color = '#34d399';
  } catch(e) { st.textContent = '失败: ' + (e.reason || e.message.slice(0,60)); st.style.color = '#f87171'; }
}

// 链上决策统计
async function loadOnchainDecisions() {
  try {
    // BSC 任务数
    const bscP = new ethers.JsonRpcProvider('https://bsc-dataseed.binance.org/');
    const bscC = new ethers.Contract('0xea43a24a1baefb89494126c12fe8921b5b8e3d8d',
      ['function nextTaskId() view returns (uint256)'], bscP);
    const bscN = Number(await bscC.nextTaskId().catch(()=>0n));
    const el1 = document.getElementById('od-bsc-tasks');
    if(el1) el1.textContent = bscN;

    // X Layer 任务数
    const xlP = new ethers.JsonRpcProvider('https://rpc.xlayer.tech');
    const xlC = new ethers.Contract('0xBce8A6124255c0bB1e65DF6bb72A53833261455f',
      ['function nextTaskId() view returns (uint256)'], xlP);
    const xlN = Number(await xlC.nextTaskId().catch(()=>0n));
    const el2 = document.getElementById('od-xl-tasks');
    if(el2) el2.textContent = xlN;

    // Agent 发布数（从 /api/meta 统计 isAgent=true）
    const metaR = await fetch('/api/meta').then(r=>r.json()).catch(()=>({}));
    const agentCount = Object.values(metaR).filter(m=>m&&m.isAgent).length;
    const el3 = document.getElementById('od-agent-tasks');
    if(el3) el3.textContent = agentCount;

    // 最近 Agent 日志
    const logR = await fetch('/api/log').then(r=>r.json()).catch(()=>({logs:[]}));
    const logs = (logR.logs||[]).slice(0,5);
    const elLog = document.getElementById('od-log-list');
    if(elLog) {
      if(!logs.length) { elLog.textContent = '暂无链上决策记录'; return; }
      elLog.innerHTML = logs.map(l=>{
        const tag = l.tag||'INFO';
        const tagColor = {CREATE:'#34d399',WAIT:'#6b7280',CANCEL:'#f87171',INFO:'#60a5fa'}[tag]||'#6b7280';
        const ts = l.ts ? new Date(l.ts).toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit'}) : '';
        const txLink = l.txHash ? ` <a href="https://bscscan.com/tx/${l.txHash}" target="_blank" style="color:var(--p);font-size:10px">链上 ↗</a>` : '';
        return `<div style="display:flex;align-items:baseline;gap:8px;padding:6px 0;border-bottom:1px solid rgba(255,255,255,.04)">
          <span style="font-size:9px;font-weight:700;letter-spacing:.5px;color:${tagColor};min-width:44px">${tag}</span>
          <span style="color:var(--tx3);font-size:10px;white-space:nowrap">${ts}</span>
          <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escH(l.msg||'')}</span>
          ${txLink}
        </div>`;
      }).join('');
    }
  } catch(e) { console.warn('loadOnchainDecisions:', e.message); }
}

function docTab(tab,el){['docs-logic','docs-contract','docs-dev','docs-roadmap'].forEach(function(id){var d=document.getElementById(id);if(d)d.style.display=id==='docs-'+tab?'':'none';});document.querySelectorAll('[id^="dtag-"]').forEach(function(b){b.style.background='transparent';b.style.color='var(--tx2)';b.style.border='1px solid rgba(255,255,255,.15)';});if(el){el.style.background='rgba(124,58,237,.15)';el.style.color='var(--p)';el.style.border='1px solid var(--p)';}if(tab==='logic')loadLogicSentiment();}


async function loadAgentStatus() {
  try {
    const r = await fetch('/api/agent-status');
    const d = await r.json();
    if (!d.ok) return;
    const now = Date.now();
    function fmtAgo(ts) {
      if (!ts) return '从未';
      const s = Math.floor((now - ts) / 1000);
      if (s < 60) return s + 's 前';
      if (s < 3600) return Math.floor(s/60) + 'm 前';
      return Math.floor(s/3600) + 'h 前';
    }
    // Observer
    const obs = d.agents.observer;
    const obsDot = document.getElementById('obs-dot');
    if (obsDot) obsDot.style.background = obs.alive ? '#34d399' : '#ef4444';
    const obsLast = document.getElementById('obs-last');
    if (obsLast) obsLast.textContent = '上次运行：' + fmtAgo(obs.lastRun);
    // Decision
    const dec = d.agents.decision;
    const decDot = document.getElementById('dec-dot');
    if (decDot) decDot.style.background = dec.alive ? '#a78bfa' : '#ef4444';
    const decLast = document.getElementById('dec-last');
    if (decLast && d.lastDecision) {
      const act = d.lastDecision.action;
      const reason = d.lastDecision.reason || '';
      const src = d.lastDecision.source || '';
      decLast.textContent = act + ' — ' + reason + ' (' + src + ')';
      decLast.style.color = act === 'CREATE' ? '#34d399' : '#9ca3af';
    }
    // Executor
    const exe = d.agents.executor;
    const exeDot = document.getElementById('exe-dot');
    if (exeDot) exeDot.style.background = exe.alive ? '#34d399' : '#374151';
    const exeLast = document.getElementById('exe-last');
    if (exeLast) {
      const res = d.agents.executor.lastRun;
      exeLast.textContent = '上次执行：' + fmtAgo(res);
    }
    // X Layer data
    const xl = d.xlayer;
    // update reasoning text
    const ar = document.getElementById('agent-reasoning');
    if (ar && d.lastDecision) {
      const bnbChg = d.bsc?.bnbChg || 0;
      ar.innerHTML = '<span style="color:var(--tx3)">BNB ' + (bnbChg>=0?'+':'') + bnbChg.toFixed(2) + '%</span> &nbsp;→&nbsp; '
        + '<span style="color:var(--p);font-weight:700">' + (d.lastDecision.action||'WAIT') + '</span>'
        + ' &nbsp;via&nbsp; <span style="color:#60a5fa">' + (d.lastDecision.source||'rules') + '</span>'
        + ' &nbsp;—&nbsp; ' + escH(d.lastDecision.reason || '');
    }
  } catch(e) { console.warn('loadAgentStatus:', e.message); }
  // Personal Agent 状态（从 localStorage 读取）
  try {
    var s = JSON.parse(localStorage.getItem('seki_pa_strategy') || '{}');
    var hist = JSON.parse(localStorage.getItem('seki_pa_history') || '[]');
    var paMode = document.getElementById('pa-dash-mode');
    var paCount = document.getElementById('pa-dash-count');
    var paStrat = document.getElementById('pa-dash-strat');
    if(paMode) paMode.textContent = (typeof Worker !== 'undefined') ? 'Web Worker' : 'setInterval';
    var today = new Date().toDateString();
    var todayCount = hist.filter(function(h){ return new Date(h.time).toDateString() === today && h.ok; }).length;
    if(paCount) paCount.textContent = todayCount + ' 个';
    if(paStrat) {
      if(s.autoExecute){paStrat.textContent='运行中';paStrat.style.color='#34d399';}
      else if(s.taskTypes){paStrat.textContent='已配置';paStrat.style.color='#f59e0b';}
      else{paStrat.textContent='未配置';paStrat.style.color='#6b6488';}
    }
  } catch(e) {}
}

async function loadDash(){
 try{
 const p=new ethers.JsonRpcProvider(RPC);
 const RABI=['function taxPool() view returns (uint256)'];
 const reg=new ethers.Contract(REGISTRY,RABI,p);
 const tp=await reg.taxPool().catch(()=>0n);
 const tpEl=document.getElementById('ag-taxpool');
 if(tpEl) tpEl.textContent=parseFloat(ethers.formatEther(tp)).toFixed(4)+' BNB';
 // 累计发放（从合约任务数 * 平均奖励估算）
 const paidEl=document.getElementById('ag-paid');
 if(paidEl) paidEl.textContent='— BNB';
 }catch(e){console.warn('loadDash chain err',e)}
 // 活跃委托数：从服务器读 agent-jobs.json
 const ag2El=document.getElementById('ag2');
 if(ag2El){
 try{
 const jr=await fetch('/api/jobs');
 const jd=await jr.json();
 const activeCount=(jd||[]).filter(j=>j.active).length;
 ag2El.textContent=activeCount;
 }catch{ ag2El.textContent='—'; }
 }
 await loadLog();
 await loadAgentStatus();
}

const PERSONA_META={
 hunter: {emoji:'🔴',name:'猎手',color:'#ef4444',bg:'rgba(239,68,68,.08)'},
 strategist:{emoji:'🟡',name:'军师',color:'#d97706',bg:'rgba(217,119,6,.08)'},
 herald: {emoji:'🟢',name:'传令官',color:'#059669',bg:'rgba(5,150,105,.08)'},
};
const TAG_STYLE={
 CREATE:{bg:'#dcfce7',color:'#15803d',label:'发布'},
 CANCEL:{bg:'#fee2e2',color:'#dc2626',label:'取消'},
 WAIT: {bg:'#f3f4f6',color:'#6b7280',label:'观察'},
 ERROR: {bg:'#fee2e2',color:'#dc2626',label:'错误'},
 STORY: {bg:'#ede9fe',color:'#7c3aed',label:'故事线'},
};

async function loadLog(){
 try{
 const r=await fetch('/api/log');
 const _lb=document.getElementById('logb');if(!r.ok){if(_lb)_lb.innerHTML='<div style="text-align:center;padding:48px;color:#9ca3af">暂无日志</div>';return}
 const logs=await r.json();
 const today=new Date().toDateString();
 const todayN=logs.filter(l=>new Date(l.ts).toDateString()===today&&l.tag==='CREATE').length;
 const att=document.getElementById('ag-tasks-today');if(att)att.textContent=todayN;
 const lc=document.getElementById('logc');if(lc)lc.textContent=logs.length+' 条记录';
 const lb0=document.getElementById('logb');if(!logs.length){if(lb0)lb0.innerHTML='<div style="text-align:center;padding:48px;color:#9ca3af">等待 Agent 活动...</div>';return}
 const lb=document.getElementById('logb');if(lb)lb.innerHTML=logs.slice().reverse().slice(0,100).map(l=>{
 const pm=PERSONA_META[l.persona]||{emoji:'',name:'Agent',color:'#7c3aed',bg:'rgba(124,58,237,.08)'};
 const ts=TAG_STYLE[l.tag]||TAG_STYLE.WAIT;
 const time=new Date(l.ts).toLocaleString('zh-CN',{month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'});
 const moodTag=l.mood?'<span style="font-size:10px;color:'+pm.color+';background:'+pm.bg+';padding:1px 6px;border-radius:10px;margin-left:4px">'+escH(l.mood)+'</span>':'';
 const personaBadge='<span style="font-size:11px;font-weight:700;color:'+pm.color+'">'+pm.emoji+pm.name+'</span>'+moodTag;
 const tagBadge='<span style="font-size:10px;padding:2px 8px;border-radius:10px;background:'+ts.bg+';color:'+ts.color+';font-weight:700">'+ts.label+'</span>';
 const sym=l.symbol?'<span style="font-size:11px;font-weight:700;color:#7c3aed;background:#f5f3ff;padding:1px 6px;border-radius:6px;margin-right:6px">$'+escH(l.symbol)+'</span>':'';
 return '<div class="le" style="display:grid;grid-template-columns:auto 1fr auto;gap:10px;align-items:start;padding:14px 12px">'
 +'<div style="text-align:right">'
 +'<div style="font-size:11px;color:#9ca3af;white-space:nowrap">'+time+'</div>'
 +'<div style="margin-top:4px">'+personaBadge+'</div>'
 +'</div>'
 +'<div>'
 +sym
 +'<span style="font-size:13px;color:#1a1a2e;line-height:1.5">'+linkifyMsg(l.msg||'')+'</span>'
 +'</div>'
 +'<div>'+tagBadge+'</div>'
 +'</div>';
 }).join('');
 }catch(e){const _lb2=document.getElementById('logb');if(_lb2)_lb2.innerHTML='<div style="text-align:center;padding:48px;color:#9ca3af">暂无日志</div>'}
}
setInterval(loadLog,30000);

// 从 BSCScan 同步历史发币记录
async function syncTokensFromChain() {
 if (!addr) { toast('请先连接钱包','e'); return; }
 const btn = document.getElementById('sync-btn');
 if (btn) { btn.textContent = '同步中...'; btn.disabled = true; }
 try {
 const BSCSCAN_KEY = '7FAQMWNY16DVSQNCD7TNUD3J1Q8B77Q8IZ';
 const FOUR_MEME_CONTRACT = '0x5c952063c7fc8610ffdb798152d69f0b9550762b';
 // 查该地址调用过 fourmeme 合约的交易
 const url = `https://api.bscscan.com/api?module=account&action=txlist&address=${addr}&to=${FOUR_MEME_CONTRACT}&sort=desc&apikey=${BSCSCAN_KEY}`;
 const r = await fetch(url);
 const d = await r.json();
 if (d.status !== '1' || !d.result?.length) {
 toast('链上没有找到发币记录','i');
 return;
 }
 const existing = JSON.parse(localStorage.getItem('mb_my_tokens')||'[]');
 const existingTx = new Set(existing.map(t => t.txHash));
 let added = 0;
 for (const tx of d.result.slice(0, 20)) {
 if (existingTx.has(tx.hash)) continue;
 // 查 receipt 获取代币地址
 try {
 const rb = JSON.stringify({jsonrpc:'2.0',method:'eth_getTransactionReceipt',params:[tx.hash],id:1});
 const rr = await fetch('https://bsc-dataseed.binance.org/', {method:'POST',headers:{'Content-Type':'application/json'},body:rb});
 const rd = await rr.json();
 if (rd.result?.logs?.length > 0) {
 const tokenAddr = rd.result.logs[0].address;
 // 查代币名称
 let name = '未知', symbol = '?';
 try {
 const tb = JSON.stringify({jsonrpc:'2.0',method:'eth_call',params:[{to:tokenAddr,data:'0x06fdde03'},'latest'],id:1});
 // 简单用地址代替
 name = tokenAddr.slice(0,8)+'...';
 symbol = tokenAddr.slice(0,6);
 } catch {}
 existing.unshift({ addr: tokenAddr, name, symbol, txHash: tx.hash, ts: parseInt(tx.timeStamp)*1000, label: 'Meme', wallet: addr, synced: true });
 existingTx.add(tx.hash);
 added++;
 }
 } catch {}
 }
 if (added > 0) {
 localStorage.setItem('mb_my_tokens', JSON.stringify(existing.slice(0,50)));
 loadMy();
 toast(`同步成功，新增 ${added} 条记录 ✓`, 's');
 } else {
 toast('已是最新，无新记录', 'i');
 }
 } catch(e) {
 console.error('syncTokens error:', e);
 toast('同步失败: ' + (e.message||'').slice(0,40), 'e');
 } finally {
 if (btn) { btn.textContent = '链上同步'; btn.disabled = false; }
 }
}

// 项目方委托管理
// OKX 持仓查询（「我的」页）
async function loadOkxPortfolio() {
 if (!addr) return;
 try {
 const r = await fetch('/api/okx/portfolio?wallet='+addr);
 const d = await r.json();
 if (!d.ok) return;
 const balMap = {};
 (d.data||[]).forEach(chain=>{
 (chain.tokenAssets||[]).forEach(t=>{ balMap[t.tokenContractAddress.toLowerCase()]={bal:t.balance,usd:t.tokenValue}; });
 });
 // 更新「我的发币」记录的持仓显示
 const items = document.querySelectorAll('[data-token-addr]');
 items.forEach(el=>{
 const a = el.getAttribute('data-token-addr');
 if (a && balMap[a.toLowerCase()]) {
 const b = balMap[a.toLowerCase()];
 el.innerHTML = '<span style="color:#34d399;font-size:11px">持仓: '+parseFloat(b.bal).toFixed(0)+' ≈ $'+parseFloat(b.usd||0).toFixed(2)+'</span>';
 }
 });
 } catch(e) { console.warn('portfolio err',e); }
}
async function loadMyDelegations() {
 const el = document.getElementById('my-delegations');
 if (!el) return;
 if (!addr) { el.innerHTML = '<div class="empty">请先连接钱包</div>'; return; }
 el.innerHTML = '<div class="empty">加载中...</div>';

 // 从本地存储读委托列表
 const list = JSON.parse(localStorage.getItem('mb_delegations') || '[]');
 const myList = list.filter(d => d.owner?.toLowerCase() === addr.toLowerCase() || !d.owner);
 if (!myList.length) { el.innerHTML = '<div class="empty">暂无委托记录，去<a href="javascript:void(0)" onclick="G(\'delegate\',null)" style="color:var(--p)"><span style="letter-spacing:.5px">委托 Agent</span></a></div>'; return; }

 const rpcProv = new ethers.JsonRpcProvider('https://bsc-dataseed.binance.org/');
 const regRo = new ethers.Contract(REGISTRY, REG_ABI, rpcProv);
 const cRo = new ethers.Contract(CONTRACT, ABI, rpcProv);

 const cards = await Promise.all(myList.map(async (d) => {
 let budgetBal = '—', jobStatus = '—', taskRows = '';
 // 查链上 job 状态
 try {
 const rem = await regRo.getJobBudgetRemaining(d.jobId);
 budgetBal = parseFloat(ethers.formatEther(rem)).toFixed(4) + ' BNB';
 const st = await regRo.getJobStatus(d.jobId);
 const stMap = ['🟡 待充值', '🟢 运行中', ' 已完成', '🔴 已取消', '⏰ 已过期'];
 jobStatus = stMap[Number(st)] || '⏰ 已过期';
 } catch {}

 // 查该委托代币的任务列表
 try {
 const nid = await cRo.nextTaskId();
 const taskItems = [];
 for (let i = 0; i < Math.min(Number(nid), 20); i++) {
 const b = await cRo.taskBase(i).catch(() => null);
 if (!b) continue;
 if (b.targetToken.toLowerCase() !== d.token.toLowerCase()) continue;
 const pct = Number(b.maxWinners) > 0 ? Math.round(Number(b.claimedCount) * 100 / Number(b.maxWinners)) : 0;
 const status = !b.active ? '已结束' : pct >= 100 ? '已满' : '进行中';
 const rpw = ethers.formatEther(b.rewardPerWinner);
 taskItems.push(`<div style="display:flex;align-items:center;gap:8px;padding:8px 0;border-bottom:1px solid rgba(255,255,255,.04);font-size:12px">
 <span style="color:var(--tx3);min-width:32px">#${i}</span>
 <span style="flex:1;color:var(--tx2)">${meta[i]?.title||'任务 #'+i}</span>
 <span style="color:var(--p)">${Number(b.claimedCount)}/${Number(b.maxWinners)>1e12?'?':Number(b.maxWinners)}人</span>
 <div style="background:rgba(255,255,255,.06);border-radius:20px;overflow:hidden;width:60px;height:6px">
 <div style="background:var(--p);width:${pct}%;height:100%"></div>
 </div>
 <span style="min-width:44px;text-align:right;color:${b.active?'#34d399':'var(--tx3)'}">${status}</span>
 <button onclick="event.stopPropagation();showTaskClaimed(${i})" style="background:rgba(124,58,237,.15);border:1px solid rgba(124,58,237,.3);color:var(--p);font-size:10px;padding:2px 8px;border-radius:6px;cursor:pointer">完成名单</button>
 <a href="https://bscscan.com/address/${CONTRACT}#events" target="_blank" style="color:var(--p);font-size:10px;text-decoration:none"></a>
 </div>`);
 }
 if (taskItems.length) taskRows = `<div style="margin-top:12px">${taskItems.join('')}</div>`;
 } catch {}

 // 充值按钮
 const topupHtml = `<button class="btns" style="font-size:11px;padding:4px 12px" onclick="topupBudget(${d.jobId})">+ 充值预算</button>`;
 // 提取预算按钮（job 已取消）
 const agentName = d.agentName || d.agentType || 'Agent';
 const tokenShort = d.token ? d.token.slice(0,8)+'...'+d.token.slice(-4) : '—';

 return `<div style="background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);border-radius:16px;padding:18px 20px;margin-bottom:16px">
 <div style="display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:12px">
 <div>
 <div style="font-size:14px;font-weight:700;color:var(--tx);margin-bottom:4px"> ${agentName}</div>
 <div style="font-size:11px;font-family:monospace;color:var(--tx3)">${tokenShort}</div>
 </div>
 <div style="text-align:right">
 <div style="font-size:12px;color:var(--tx2)">Job #${d.jobId}</div>
 <div style="font-size:12px;margin-top:2px">${jobStatus}</div>
 </div>
 </div>
 <div style="display:flex;gap:16px;font-size:12px;margin-bottom:12px">
 <div><span style="color:var(--tx3)">剩余预算</span><br><span style="color:var(--p);font-weight:700">${budgetBal}</span></div>
 <div><span style="color:var(--tx3)">初始预算</span><br><span style="color:var(--tx2)">${d.budget} BNB</span></div>
 <div><span style="color:var(--tx3)">委托时长</span><br><span style="color:var(--tx2)">${d.hours} 分钟</span></div>
 </div>
 ${taskRows || '<div style="font-size:12px;color:var(--tx3);padding:8px 0">暂无任务记录</div>'}
 <div style="display:flex;gap:8px;margin-top:12px">${topupHtml}</div>
 </div>`;
 }));

 el.innerHTML = cards.join('');
}

// 查看任务完成用户列表
async function showTaskClaimed(taskId) {
 try {
 const rpcProv = new ethers.JsonRpcProvider('https://bsc-dataseed.binance.org/');
 const cRo = new ethers.Contract(CONTRACT, ABI, rpcProv);
 // 查 RewardClaimed 事件
 const filter = cRo.filters.RewardClaimed(taskId);
 const events = await cRo.queryFilter(filter, -50000).catch(async () => {
 // 如果太远，只查最近区块
 return await cRo.queryFilter(filter, -10000);
 });
 if (!events.length) { toast('该任务暂无完成记录', 'i'); return; }
 const lines = events.map(e => {
 const user = e.args[1];
 const amt = ethers.formatEther(e.args[2]);
 const tx = e.transactionHash;
 return `<div style="display:flex;align-items:center;gap:8px;padding:8px 0;border-bottom:1px solid rgba(255,255,255,.06);font-size:12px">
 <span style="font-family:monospace;color:var(--tx2);flex:1">${user.slice(0,10)}...${user.slice(-4)}</span>
 <span style="color:var(--p);font-weight:700">+${amt} BNB</span>
 <a href="https://bscscan.com/tx/${tx}" target="_blank" style="color:#60a5fa;font-size:10px;text-decoration:none"> TX</a>
 </div>`;
 }).join('');
 const panel = document.createElement('div');
 panel.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.7);z-index:9999;display:flex;align-items:center;justify-content:center';
 panel.innerHTML = `<div style="background:#12122a;border:1px solid rgba(255,255,255,.1);border-radius:20px;padding:28px;max-width:480px;width:90%;max-height:70vh;overflow-y:auto">
 <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
 <div style="font-size:16px;font-weight:800">任务 #${taskId} 完成名单</div>
 <button onclick="this.closest('[style*=fixed]').remove()" style="background:none;border:none;color:var(--tx3);font-size:20px;cursor:pointer">×</button>
 </div>
 <div style="font-size:12px;color:var(--tx3);margin-bottom:12px">共 ${events.length} 人完成，奖励均已链上发放</div>
 ${lines}
 </div>`;
 document.body.appendChild(panel);
 } catch(e) {
 toast('查询失败: ' + e.message.slice(0, 50), 'e');
 }
}

// 手动输入 jobId 退款（适用于 localStorage 里没记录的 job）
async function manualRefund() {
 if (!addr) { toast('请先连接钱包','e'); return; }
 const input = prompt('输入要退款的 Job ID（链上查询：https://bscscan.com/address/' + REGISTRY + '#readContract）:');
 if (input === null || input.trim() === '') return;
 const jobId = parseInt(input.trim());
 if (isNaN(jobId)) { toast('无效的 Job ID','e'); return; }
 // 先查 job 状态
 try {
 const rpcProv = new ethers.JsonRpcProvider('https://bsc-dataseed.binance.org/');
 const regRo = new ethers.Contract(REGISTRY, REG_ABI, rpcProv);
 const j = await regRo.getJob(jobId);
 const rem = await regRo.getJobBudgetRemaining(jobId);
 const status = ['Open','Funded','Done','Cancelled','Expired'][Number(j.status)] || Number(j.status);
 const now2 = Math.floor(Date.now()/1000);
 const expired = now2 >= Number(j.expiredAt);
 const remBnb = parseFloat(ethers.formatEther(rem)).toFixed(4);
 if(j.client.toLowerCase() !== addr.toLowerCase()) {
 toast('该 Job 不属于你的钱包','e'); return;
 }
 if(!expired) {
 const remaining = Math.ceil((Number(j.expiredAt) - now2)/60);
 toast(`Job #${jobId} 还未到期，还需等 ${remaining} 分钟`, 'e'); return;
 }
 if(Number(rem) === 0) { toast(`Job #${jobId} 余额为 0，无需退款`,'i'); return; }
 if(!confirm(`确认退款？
Job #${jobId} | 状态: ${status} | 余额: ${remBnb} BNB
点确认后将在 MetaMask 签名`)) return;
 // 执行退款
 if(!sign){if(!prov)prov=new ethers.BrowserProvider(window.ethereum);sign=await prov.getSigner();}
 const regCon = new ethers.Contract(REGISTRY, REG_ABI, sign);
 const tx = await regCon.claimRefund(jobId);
 const r = await tx.wait();
 toast(` Job #${jobId} 退款成功！+${remBnb} BNB TX: ${r.hash.slice(0,12)}...`,'s');
 await fetch('/api/jobs/cancel', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({jobId})}).catch(()=>{});
 loadMyDelegations();
 } catch(e) {
 toast('退款失败: '+(e.reason||e.message.slice(0,60)),'e');
 }
}

// 委托到期退款
async function claimJobRefund(jobId) {
 if (!con) { toast('请先连接钱包','e'); return; }
 if (!confirm('确认取回 Job #'+jobId+' 的剩余预算？\n（仅委托到期后可用，未发出的任务奖励不会退回）')) return;
 try {
 toast('发起退款交易...','i');
 if(!sign){if(!prov)prov=new ethers.BrowserProvider(window.ethereum);sign=await prov.getSigner();}
 const regCon = new ethers.Contract(REGISTRY, REG_ABI, sign);
 const tx = await regCon.claimRefund(jobId);
 const r = await tx.wait();
 toast(' 退款成功！TX: '+r.hash.slice(0,12)+'...','s');
 await fetch('/api/jobs/cancel', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({jobId})}).catch(()=>{});
 loadMyDelegations();
 } catch(e) {
 toast('退款失败: '+(e.reason||e.message.slice(0,60)),'e');
 }
}

// 充值委托预算
async function topupBudget(jobId) {
 if (!con) { toast('请先连接钱包', 'e'); return; }
 const amount = prompt('充值金额（BNB，最低 0.01）:');
 if (!amount || isNaN(parseFloat(amount))) return;
 const bnbAmt = ethers.parseEther(amount);
 try {
 toast('签名并发送充值交易...', 'i');
 const regCon = new ethers.Contract(REGISTRY, REG_ABI, con.runner || con);
 const tx = await regCon.fund(jobId, bnbAmt, '0x', { value: bnbAmt });
 await tx.wait();
 toast(' 充值成功！+' + amount + ' BNB', 's');
 loadMyDelegations();
 } catch(e) {
 toast('充值失败: ' + (e.reason || e.message.slice(0, 50)), 'e');
 }
}

// MY
async function loadMy(){
 if(!addr)return;
 const c=con||roCon;
 const ptc=[];for(const t of tasks){try{if(await c.claimed(t.id,addr))ptc.push(t)}catch{}}
 const mine=tasks.filter(t=>t.b.creator.toLowerCase()===addr.toLowerCase());
 const r0=document.getElementById('my0'),r1=document.getElementById('my1');
 if(!ptc.length)r0.innerHTML='<div class="empty">暂无参与记录</div>';
 else{const h=await Promise.all(ptc.map(mkCard));r0.innerHTML=h.join('')}
 if(!mine.length)r1.innerHTML='<div class="empty">还没有发布过任务</div>';
 else{
 const arr=await Promise.all(mine.map(async t=>{
 const c2=await mkCard(t);
 return '<div style="position:relative">'+c2+'<button class="cb" style="width:100%;padding:9px;margin-top:0;background:rgba(239,68,68,.06);color:#ef4444;border:1px solid rgba(239,68,68,.18);border-top:none;border-radius:0 0 14px 14px;font-size:12px;cursor:pointer;font-family:inherit" onclick="event.stopPropagation();doCancel('+t.id+')">✕ 取消任务并退款</button></div>';
 }));
 r1.innerHTML=arr.join('');
 }

 // 我发行的代币 - 先从服务器拉最新数据合并到本地
 if (addr) {
 try {
 const ur = await fetch('/api/user?addr='+addr);
 const ud = await ur.json();
 if (ud.tokens && ud.tokens.length > 0) {
 const local = JSON.parse(localStorage.getItem('mb_my_tokens')||'[]');
 const localTx = new Set(local.map(t=>t.txHash));
 for (const t of ud.tokens) {
 if (!localTx.has(t.txHash)) {
 local.unshift(t);
 localTx.add(t.txHash);
 } else {
 // 用服务器数据更新本地（可能有 pending->confirmed）
 const idx = local.findIndex(x=>x.txHash===t.txHash);
 if (idx>=0 && t.addr && !local[idx].addr) { local[idx].addr = t.addr; local[idx].pending = false; }
 }
 }
 localStorage.setItem('mb_my_tokens', JSON.stringify(local.slice(0,50)));
 }
 } catch(e) { console.warn('loadMy user fetch:', e.message); }
 }
 // 我发行的代币（本地存储）
 const myTokens = JSON.parse(localStorage.getItem('mb_my_tokens')||'[]');
 const el = document.getElementById('my-tokens');
 if (!el) return;
 if (!myTokens.length) { el.innerHTML='<div class="empty">暂无发币记录（发币后自动显示）</div>'; return; }
 el.innerHTML = myTokens.map(tk=>`
 <div style="display:flex;align-items:center;gap:14px;padding:14px 16px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);border-radius:12px;margin-bottom:10px">
 <div style="width:40px;height:40px;border-radius:50%;background:linear-gradient(135deg,#7c3aed,#3b82f6);display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0"></div>
 <div style="flex:1;min-width:0">
 <div style="font-weight:700;font-size:14px">${escH(tk.name)} <span style="color:var(--tx3);font-size:12px;font-weight:400">(${escH(tk.symbol)})</span></div>
 <div style="font-size:11px;color:var(--tx3);font-family:monospace;margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${tk.pending?'⏳ 上链中... '+tk.txHash.slice(0,18)+'...':tk.addr||'—'}</div>
 <div style="font-size:11px;color:var(--tx3);margin-top:2px">${new Date(tk.ts).toLocaleString('zh-CN')}</div>
 <div data-token-addr="${tk.addr||''}" style="min-height:16px"></div>
 </div>
 <div style="display:flex;flex-direction:column;gap:6px;flex-shrink:0">
 <a href="${tk.addr?'https://bscscan.com/token/'+tk.addr:'https://bscscan.com/tx/'+tk.txHash}" target="_blank" class="btns" style="font-size:11px;padding:4px 10px;text-decoration:none">◈ BSCScan ↗</a>
 ${tk.addr?`<a href="https://four.meme/token/${tk.addr}" target="_blank" class="btns" style="font-size:11px;padding:4px 10px;text-decoration:none">Four.meme ↗</a>`:''}
 ${tk.addr?`<button class="btns" style="font-size:11px;padding:4px 10px" onclick="document.getElementById('d0').value='${tk.addr}';G('delegate',null);toast('代币已填入委托表单','s')"><span style="letter-spacing:.5px">委托 Agent</span></button>`:''}
 </div>
 </div>
 `).join('');
}
async function doCancel(id){
 if(!con)return;
 if(!confirm('确认取消？未领奖励将退回钱包。'))return;
 try{const tx=await con.cancelTask(id);await tx.wait();toast('已取消，奖励已退回 ✓','s');await loadAll();await loadMy()}
 catch(e){toast('失败: '+(e.reason||e.message.slice(0,40)),'e')}
}

// EVENTS
function linkifyMsg(msg) {
 // 把 [TX](https://...) 转为可点击链接
 return escH(msg).replace(/\[TX\]\(https:\/\/bscscan\.com\/tx\/(0x[0-9a-fA-F]+)\)/g,
 (_, hash) => `<a href="https://bscscan.com/tx/${hash}" target="_blank" style="color:#60a5fa;font-size:11px;text-decoration:none;margin-left:4px"> TX ${hash.slice(0,8)}...</a>`
 );
}

function listenEv(p){
 try{
 const c=new ethers.Contract(CONTRACT,ABI,p);
 c.on('RewardClaimed',(id,user,amount)=>{
 const bnb=parseFloat(ethers.formatEther(amount)).toFixed(4);
 if(addr&&user.toLowerCase()===addr.toLowerCase())toast(' 恭喜！任务 #'+id+' 奖励 '+bnb+' BNB 已到账','s');
 else toast('任务 #'+id+' 有人领取了 '+bnb+' BNB','i');
 });
 }catch{}
 // 监听 MetaMask 切换账户
 if(window.ethereum){
 window.ethereum.on('accountsChanged', async (accounts)=>{
 if(!accounts||!accounts.length){ addr=null;con=null;sign=null;toast('钱包已断开','e');return; }
 // 重新连接新账户
 try{
 prov = new ethers.BrowserProvider(window.ethereum);
 sign = await prov.getSigner();
 addr = await sign.getAddress();
 con = new ethers.Contract(CONTRACT, ABI, sign);
 const wi=document.getElementById('wi'),wa=document.getElementById('wa'),wbtn=document.getElementById('wbtn');
 if(wi)wi.style.display='flex';
 if(wa)wa.textContent=addr.slice(0,6)+'...'+addr.slice(-4);
 if(wbtn)wbtn.style.display='none';
 // 更新发币次数
 fetch('/api/launch-count?addr='+addr).then(r=>r.json()).then(d=>{

 }).catch(()=>{});
 toast('已切换到 '+addr.slice(0,6)+'...'+addr.slice(-4),'i');
 await loadAll(); await loadMy();
 }catch(e){ console.error('accountsChanged error',e); }
 });
 window.ethereum.on('chainChanged', ()=>{ window.location.reload(); });
 }
}

// NAV

// ══════════════════════════════════════════════
// 世界观切换：BSC = Meme 生态 / X Layer = Agent 协议
// ══════════════════════════════════════════════
const WORLD = {
  bsc: {
    navBorder: 'rgba(245,158,11,.2)',
    badgeRole: 'Meme · On-Chain AI Agent',
    line1: '链上激励',
    line2: '由<em> Seki</em> 驱动',
    tagline: 'Observe · Think · Act',
    desc: '自主感知链上数据，结合市场信号，<br>智能决策并自动结算激励任务。',
    btnText: '一键发币',
    btnFn: "G('launch',document.getElementById('nav-launch'))",
    btnStyle: 'background:linear-gradient(135deg,#7c3aed,#6d28d9);color:#fff;border:none;border-radius:14px;font-size:15px;font-weight:700;cursor:pointer;padding:14px 28px;display:inline-flex;align-items:center;gap:8px;font-family:var(--font)',
    taxpoolKey: 'taxPool BNB',
    showLaunch: true, showApps: false,
    bodyBg: '',
    navBg: 'rgba(13,13,26,.9)',
  },
  xlayer: {
    navBorder: 'rgba(99,58,237,.3)',
    badgeRole: 'Universal Agent Protocol',
    line1: '自主协议',
    line2: '由<em> X Layer</em> 驱动',
    tagline: 'Subscribe · Bounty · DAO',
    desc: 'AI Agent 订阅市场 · 链上任务外包 · DAO 自动执行<br>任何场景，任何项目，接入 Seki 协议。',
    btnText: '探索应用',
    btnFn: "G('apps',document.getElementById('nav-apps'))",
    btnStyle: 'background:linear-gradient(135deg,#6332ed,#4f46e5);color:#fff;border:none;border-radius:14px;font-size:15px;font-weight:700;cursor:pointer;padding:14px 28px;display:inline-flex;align-items:center;gap:8px;font-family:var(--font)',
    taxpoolKey: 'SekiRegistry OKB',
    showLaunch: false, showApps: true,
    bodyBg: 'radial-gradient(ellipse 80% 50% at 50% -10%,rgba(99,58,237,.18) 0%,transparent 70%), #0a0818',
    navBg: 'rgba(8,6,20,.93)',
  },
};

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
      : () => G('launch', el('nav-launch'));
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
  try{if(id==='dashboard'){loadDash();loadJobMonitor();startSSE();loadMarketSentiment();}}catch(e){}
  try{if(id==='dashboard')setTimeout(loadAgentReport,500);}catch(e){}
  try{if(id==='delegate')loadDelegations();}catch(e){}
  try{if(id==='hot')loadHotPage();}catch(e){}
  try{if(id==='docs'){docTab('logic',document.getElementById('dtag-logic'));loadOnchainDecisions();}}catch(e){}
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
