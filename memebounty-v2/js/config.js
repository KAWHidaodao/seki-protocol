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
 'function createJobAndFund(address,address,uint256,string,address) payable returns (uint256)',
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

// ── Hero 市场行情 ──────────────────────────────────────────
async function loadHeroMarket() {
  // 时钟
  function tick() {
    const el = document.getElementById('hero-mkt-time');
    if (el) el.textContent = new Date().toLocaleTimeString('zh-CN', {hour12:false});
  }
  tick();
  setInterval(tick, 1000);

  // OKX 价格（走后端代理）
  async function fetchPrice(sym) {
    try {
      const r = await fetch('/api/okx/market');
      const d = await r.json();
      return d;
    } catch { return null; }
  }

  async function loadPrices() {
    try {
      const r = await fetch('/api/okx/market');
      const d = await r.json();
      if (!d.ok || !d.prices) return;
      function fmt(v) { return v ? '$' + parseFloat(v).toLocaleString('en-US', {maximumFractionDigits:2}) : '--'; }
      d.prices.forEach(info => {
        const sym = info.symbol || '';
        let k = '';
        if (sym === 'BNB-USDT') k = 'bnb';
        else if (sym === 'BTC-USDT') k = 'btc';
        else if (sym === 'ETH-USDT') k = 'eth';
        if (!k) return;
        const priceEl = document.getElementById('hero-' + k + '-price');
        const chgEl = document.getElementById('hero-' + k + '-chg');
        if (priceEl) priceEl.textContent = fmt(info.price);
        if (chgEl) {
          const n = parseFloat(info.change24h || 0);
          const s = (n >= 0 ? '+' : '') + n.toFixed(2) + '% 24h';
          chgEl.textContent = s;
          chgEl.style.color = n >= 0 ? '#34d399' : '#f87171';
        }
      });
    } catch(e) {}
  }

  // BSC 热门代币（走后端）
  async function loadHotTokens() {
    try {
      const r = await fetch('/api/bsc/hot-meme');
      const d = await r.json();
      const tokens = (d.tokens || []).slice(0, 5);
      const container = document.getElementById('hero-hot-tokens');
      if (!container || !tokens.length) return;
      function fmtPrice(v) {
        const n = parseFloat(v);
        if (!n) return '--';
        if (n >= 1) return '$' + n.toFixed(2);
        if (n >= 0.001) return '$' + n.toFixed(4);
        return '$' + n.toExponential(2);
      }
      function fmtVol(v) {
        const n = parseFloat(v);
        if (!n) return '--';
        if (n >= 1e6) return '$' + (n/1e6).toFixed(1) + 'M';
        if (n >= 1e3) return '$' + (n/1e3).toFixed(0) + 'K';
        return '$' + n.toFixed(0);
      }
      container.innerHTML =
        `<div style="display:grid;grid-template-columns:1fr auto auto auto;gap:8px;font-size:10px;color:var(--tx3);padding-bottom:6px;border-bottom:1px solid rgba(255,255,255,.05);margin-bottom:4px;letter-spacing:1px">
          <span>代币</span><span style="text-align:right">价格</span><span style="text-align:right">24h</span><span style="text-align:right">交易量</span>
        </div>` +
        tokens.map(t => {
          const chg = parseFloat(t.change24h || 0);
          const chgStr = (chg >= 0 ? '+' : '') + chg.toFixed(2) + '%';
          const chgColor = chg >= 0 ? '#34d399' : '#f87171';
          return `<div style="display:grid;grid-template-columns:1fr auto auto auto;gap:8px;font-size:12px;padding:6px 0;border-bottom:1px solid rgba(255,255,255,.04);align-items:center">
            <span style="color:var(--tx);font-weight:700">${escH((t.symbol||'--').slice(0,10))}</span>
            <span style="color:var(--tx2);text-align:right">${fmtPrice(t.price)}</span>
            <span style="color:${chgColor};text-align:right;font-weight:700">${chgStr}</span>
            <span style="color:var(--tx3);text-align:right">${fmtVol(t.volume24h)}</span>
          </div>`;
        }).join('');
    } catch(e) {}
  }

  loadPrices();
  loadHotTokens();
  setInterval(loadPrices, 30000);
  setInterval(loadHotTokens, 60000);
}

// DOMContentLoaded 时启动
document.addEventListener('DOMContentLoaded', () => {
  loadHeroMarket();
});
