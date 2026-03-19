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
    btnFn: "G('faoxing',document.getElementById('nav-launch'))",
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

