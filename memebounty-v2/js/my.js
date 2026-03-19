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
