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
 document.getElementById('delegate-form').style.display='none';
 document.getElementById('dg-progress').style.display='';
 document.getElementById('dg-submit-btn').disabled=true;
 dgStep(1,'active'); dgStep(2,'pending'); dgStep(3,'pending');

 try {
 if(!sign){if(!prov)prov=new ethers.BrowserProvider(window.ethereum);sign=await prov.getSigner();addr=await sign.getAddress();}
 const regCon = new ethers.Contract(REGISTRY, REG_ABI, sign);
 const budget = ethers.parseEther(bnb);
 const expiredAt = Math.floor(Date.now()/1000) + Number(mins)*60;
 const agentName = {hunter:'猎手',strategist:'军师',herald:'传令官',custom:'自定义'}[_dgSelectedAgent]||_dgSelectedAgent;
 const desc = `Seki Agent:${agentName} | Token:${tok} | ${bnb}BNB | ${mins}min`;

 // 一步：createJobAndFund（创建+锁资金，只需一次签名）
 document.getElementById('dg-prog-title').textContent = '创建并锁定资金';
 document.getElementById('dg-prog-desc').textContent = `请在 MetaMask 中确认（扣款 ${bnb} BNB）`;
 let jobId;
 try {
   const tx = await regCon.createJobAndFund(
     '0x0000000000000000000000000000000000000000', // provider = agentWallet（合约自动填）
     addr,          // evaluator = 委托人自己
     expiredAt,
     desc,
     HOOK_ADDR,
     { value: budget }
   );
   const r = await tx.wait();
   const ev = r.logs.map(l=>{try{return regCon.interface.parseLog(l)}catch{}}).find(e=>e&&e.name==='JobCreated');
   jobId = ev ? Number(ev.args[0]) : null;
   if(jobId===null) throw new Error('未获取到 JobId');
   dgStep(1,'done');
   dgStep(2,'done');
 } catch(e1) {
   dgStep(1,'error');
   throw new Error('创建委托失败: '+(e1.reason||e1.shortMessage||e1.message));
 }

 // 第3步：通知后端激活 Agent
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
   toast('❌ '+e.message.slice(0,80), 'e');
   document.getElementById('delegate-form').style.display='';
   document.getElementById('dg-progress').style.display='none';
   document.getElementById('dg-submit-btn').disabled=false;
 }
}
