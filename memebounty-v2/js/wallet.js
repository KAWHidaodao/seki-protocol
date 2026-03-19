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
 <button class="hero-btn-primary" style="font-size:13px;padding:10px 22px" onclick="G('faoxing',document.querySelectorAll('.nl')[1])">立即发币 →</button>
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
 // 显示配置表单
 const form = document.getElementById('delegate-form');
 if(form) { form.style.display='block'; setTimeout(()=>form.scrollIntoView({behavior:'smooth',block:'start'}),100); }
 // 更新 Agent 信息头
 const avatarBgs = {hunter:'rgba(239,68,68,.2)',strategist:'rgba(245,158,11,.2)',herald:'rgba(52,211,153,.2)',custom:'rgba(124,58,237,.2)'};
 const avatarIcons = {hunter:'🔴',strategist:'🟡',herald:'🟢',custom:'🟣'};
 const taglines = {hunter:'AGGRESSIVE · 拉新优先',strategist:'ADAPTIVE · 数据驱动',herald:'NARRATIVE · 故事叙事',custom:'CUSTOM · 完全掌控'};
 const av = document.getElementById('df-avatar');
 const nm = document.getElementById('df-name');
 const tl = document.getElementById('df-tagline');
 if(av){ av.style.background=avatarBgs[type]||'rgba(124,58,237,.2)'; av.textContent=avatarIcons[type]||'🤖'; }
 if(nm) nm.textContent = names[type]||type;
 if(tl) tl.textContent = taglines[type]||'';
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

