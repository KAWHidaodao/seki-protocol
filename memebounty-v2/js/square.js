function loadTasks() {
  var el = document.getElementById('task-list');
  if (!el) return;
  el.innerHTML = '<div style="text-align:center;padding:40px;color:var(--tx2)">加载中...</div>';

  var MOCK_TASKS = [
    {id:1,symbol:'PEPE',name:'Pepe',type:0,reward:'0.15',token:'0x25d887Ce7a35172C62FeBFD67a1856F20FaEbB00',creator:'0xabc1234567890abcdef1234567890abcdef123456',deadline:Math.floor(Date.now()/1000)+86400*7,claimedCount:23,maxClaims:100,active:true,desc:'持有 ≥1M PEPE 代币，快照验证'},
    {id:2,symbol:'DOGE',name:'Dogecoin',type:1,reward:'0.25',token:'0xbA2aE424d960c26247Dd6c32edC70B295c744C43',creator:'0xabc2345678901bcdef2345678901bcdef2345678',deadline:Math.floor(Date.now()/1000)+86400*5,claimedCount:45,maxClaims:200,active:true,desc:'与 DOGE/BNB LP 合约交互一次'},
    {id:3,symbol:'SHIB',name:'Shiba Inu',type:2,reward:'0.30',token:'0x2859e4544C4bB03966803b044A93563Bd2D0DD4D',creator:'0xabc3456789012cdef3456789012cdef34567890',deadline:Math.floor(Date.now()/1000)+86400*3,claimedCount:12,maxClaims:50,active:true,desc:'为 SHIB/USDT 提供流动性 ≥$50'},
    {id:4,symbol:'FLOKI',name:'Floki Inu',type:0,reward:'0.10',token:'0xfb5B838b6cfEEdC2873aB27866079AC55363D37E',creator:'0xabc4567890123def4567890123def456789012',deadline:Math.floor(Date.now()/1000)+86400*10,claimedCount:67,maxClaims:500,active:true,desc:'持有 ≥500K FLOKI，链上验证'},
    {id:5,symbol:'BONK',name:'Bonk',type:1,reward:'0.20',token:'0xA697e272a73744b343528C3Bc4702F2565b2F422',creator:'0xabc5678901234ef5678901234ef56789012345',deadline:Math.floor(Date.now()/1000)+86400*4,claimedCount:8,maxClaims:80,active:true,desc:'Bonk Swap 完成一笔交易'},
    {id:6,symbol:'WIF',name:'dogwifhat',type:0,reward:'0.35',token:'0xB0228Eb6c0b49f18e04f5aea2486E048caB05E6F',creator:'0xabc6789012345f6789012345f6789012345678',deadline:Math.floor(Date.now()/1000)+86400*6,claimedCount:31,maxClaims:150,active:true,desc:'持有 ≥100 WIF 并保持 72h'},
    {id:7,symbol:'MEME',name:'Memecoin',type:2,reward:'0.18',token:'0x3F5400A35DA9202D0B1CDE16FDd3ee0528c9d080',creator:'0xabc7890123456789012345678901234567890123',deadline:Math.floor(Date.now()/1000)+86400*8,claimedCount:5,maxClaims:30,active:true,desc:'MEME/BNB LP 添加流动性 ≥$30'},
    {id:8,symbol:'TURBO',name:'Turbo',type:1,reward:'0.12',token:'0x89E3aEb1f07cD9E7Cc434cDe44E42779B25dd990',creator:'0xabc8901234567890123456789012345678901234',deadline:Math.floor(Date.now()/1000)+86400*2,claimedCount:92,maxClaims:300,active:true,desc:'在 PancakeSwap 兑换 ≥0.01BNB 的 TURBO'}
  ];

  var ONCHAIN_TASKS = [
    {id:101,symbol:'CAKE',name:'PancakeSwap',type:1,reward:'0.50',token:'0x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82',creator:'0xSekiAgent001',deadline:Math.floor(Date.now()/1000)+86400*14,claimedCount:156,maxClaims:1000,active:true,desc:'🔗 链上任务 · PancakeSwap V3 交互一次，Gas 补贴',onchain:true},
    {id:102,symbol:'BSC',name:'BNB Chain',type:0,reward:'0.80',token:'0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c',creator:'0xSekiAgent002',deadline:Math.floor(Date.now()/1000)+86400*30,claimedCount:2341,maxClaims:10000,active:true,desc:'🔗 链上任务 · 持有 ≥0.1 BNB 并完成3笔链上交易',onchain:true},
    {id:103,symbol:'BUSD',name:'Binance USD',type:2,reward:'1.20',token:'0xe9e7CEA3DedcA5984780Bafc599bD69ADd087D56',creator:'0xSekiAgent003',deadline:Math.floor(Date.now()/1000)+86400*21,claimedCount:89,maxClaims:500,active:true,desc:'🔗 链上任务 · 为 BUSD/USDT 稳定币池提供 ≥$100 流动性',onchain:true}
  ];

  function render(tasks) {
    var types = ['持仓','交互','流动性'];
    var colors = ['#34d399','#60a5fa','#f472b6'];
    var html = '';
    tasks.forEach(function(t) {
      var pct = Math.round(t.claimedCount / t.maxClaims * 100);
      var dl = new Date(t.deadline * 1000);
      var remain = Math.max(0, Math.ceil((t.deadline - Date.now()/1000) / 86400));
      var badge = t.onchain ? '<span style="background:#f59e0b;color:#000;font-size:9px;padding:2px 6px;border-radius:4px;font-weight:700;margin-left:6px">ON-CHAIN</span>' : '';
      html += '<div style="background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.06);border-radius:14px;padding:20px;margin-bottom:12px;transition:border-color .2s" onmouseenter="this.style.borderColor=\'rgba(196,181,253,.3)\'" onmouseleave="this.style.borderColor=\'rgba(255,255,255,.06)\'">';
      html += '<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:14px">';
      html += '<div style="display:flex;align-items:center;gap:10px">';
      html += '<div style="width:38px;height:38px;border-radius:50%;background:linear-gradient(135deg,' + colors[t.type] + '33,' + colors[t.type] + '11);display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:800;color:' + colors[t.type] + '">' + t.symbol.charAt(0) + '</div>';
      html += '<div><div style="font-size:15px;font-weight:700;color:var(--tx)">' + t.symbol + badge + '</div>';
      html += '<div style="font-size:11px;color:var(--tx3)">' + t.name + '</div></div></div>';
      html += '<span style="font-size:10px;padding:3px 10px;border-radius:20px;background:' + colors[t.type] + '22;color:' + colors[t.type] + ';font-weight:600">' + types[t.type] + '</span>';
      html += '</div>';
      html += '<p style="font-size:13px;color:var(--tx2);line-height:1.7;margin-bottom:14px">' + t.desc + '</p>';
      html += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">';
      html += '<span style="font-size:13px;font-weight:700;color:#c4b5fd">' + t.reward + ' BNB</span>';
      html += '<span style="font-size:11px;color:var(--tx3)">' + remain + ' 天剩余</span></div>';
      html += '<div style="background:rgba(255,255,255,.06);border-radius:6px;height:6px;overflow:hidden;margin-bottom:8px">';
      html += '<div style="height:100%;width:' + pct + '%;background:linear-gradient(90deg,#c4b5fd,#a78bfa);border-radius:6px;transition:width .5s"></div></div>';
      html += '<div style="display:flex;justify-content:space-between;font-size:10px;color:var(--tx3)">';
      html += '<span>' + t.claimedCount + ' / ' + t.maxClaims + ' 已完成</span>';
      html += '<span>' + pct + '%</span></div></div>';
    });
    return html;
  }

  el.innerHTML = render(ONCHAIN_TASKS.concat(MOCK_TASKS));
  var cnt = document.getElementById('hall-count');
  if (cnt) cnt.textContent = (ONCHAIN_TASKS.length + MOCK_TASKS.length) + ' 个任务';
}function loadDelegations(){
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
        return ``;
      }).join('');
    }
  } catch(e) { console.warn('loadOnchainDecisions:', e.message); }
}

function docTab(tab, el) {
 ['docs-logic','docs-contract','docs-dev','docs-roadmap'].forEach(function(id){
   var d = document.getElementById(id);
   if(d) d.style.display = id === 'docs-'+tab ? '' : 'none';
 });
 document.querySelectorAll('[id^="dtag-"]').forEach(function(b){
   b.style.background = 'transparent';
   b.style.color = 'var(--tx2)';
   b.style.border = '1px solid rgba(255,255,255,.15)';
 });
 if(el){ el.style.background='rgba(124,58,237,.15)'; el.style.color='var(--p)'; el.style.border='1px solid var(--p)'; }
 if(tab==='logic') loadLogicSentiment();
}


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

document.addEventListener('DOMContentLoaded',function(){try{loadTasks();}catch(e){}});
