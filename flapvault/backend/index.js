/**
 * backend/index.js
 * ─────────────────────────────────────────────
 * 功能：
 *  1. 监听 taxToken 的 Transfer 事件，自动调用 vault.noteHolder()
 *  2. 每 N 分钟查一次 OKX DEX API，过滤持仓 ≥30U 的地址
 *  3. 调用 vault.triggerDraw(eligible[]) 开奖
 *
 * 依赖：
 *   npm install ethers axios
 *
 * 环境变量（.env）：
 *   PRIVATE_KEY=0x...          # operator 私钥
 *   TAX_TOKEN=0x...
 *   VAULT=0x...
 *   RPC=https://bsc-dataseed.binance.org/
 *   DRAW_INTERVAL_MS=120000    # 开奖间隔（默认2分钟）
 *   MIN_USD=30                 # 持仓门槛美元
 */

require('dotenv').config();
const { ethers } = require('ethers');
const axios      = require('axios');

const RPC              = process.env.RPC || 'https://bsc-dataseed.binance.org/';
const PRIVATE_KEY      = process.env.PRIVATE_KEY;
const TAX_TOKEN        = process.env.TAX_TOKEN;
const VAULT            = process.env.VAULT;
const DRAW_INTERVAL_MS = parseInt(process.env.DRAW_INTERVAL_MS || '120000');
const MIN_USD          = parseFloat(process.env.MIN_USD || '30');

const provider = new ethers.providers.JsonRpcProvider(RPC);
const wallet   = new ethers.Wallet(PRIVATE_KEY, provider);

const TOKEN_ABI = [
  'event Transfer(address indexed from, address indexed to, uint256 value)',
  'function balanceOf(address) view returns (uint256)',
];

const VAULT_ABI = [
  'function noteHolder(address) external',
  'function removeHolder(address) external',
  'function triggerDraw(address[]) external',
  'function nextDrawTime() view returns (uint256)',
  'function holdersLength() view returns (uint256)',
  'function holders(uint256) view returns (address)',
];

const token = new ethers.Contract(TAX_TOKEN, TOKEN_ABI, wallet);
const vault = new ethers.Contract(VAULT,     VAULT_ABI, wallet);

// ── 持仓集合（本地缓存，节省 RPC） ──────────
const holderSet = new Set();

// ── 1. 监听 Transfer 事件自动注册 ────────────
token.on('Transfer', async (from, to, value) => {
  try {
    // 买入方
    if (to !== ethers.constants.AddressZero && !holderSet.has(to)) {
      await vault.noteHolder(to);
      holderSet.add(to);
      console.log('[noteHolder]', to);
    }
    // 卖出方余额为0时移除
    if (from !== ethers.constants.AddressZero) {
      const bal = await token.balanceOf(from);
      if (bal.eq(0)) {
        await vault.removeHolder(from);
        holderSet.delete(from);
        console.log('[removeHolder]', from);
      }
    }
  } catch (e) {
    console.error('[Transfer handler]', e.message);
  }
});

// ── 2. 查 OKX DEX API 获取价格 ───────────────
async function getTokenPriceUSD() {
  try {
    // OKX DEX Price API (BSC)
    const res = await axios.get(
      `https://www.okx.com/api/v5/dex/market/price`,
      { params: { chainId: '56', tokenContractAddress: TAX_TOKEN } }
    );
    const price = parseFloat(res.data?.data?.[0]?.price || '0');
    return price;
  } catch (e) {
    console.error('[OKX price]', e.message);
    return 0;
  }
}

// ── 3. 过滤 ≥30U 持仓地址 ────────────────────
async function getEligible(priceUSD) {
  if (priceUSD <= 0) return [];
  const len = (await vault.holdersLength()).toNumber();
  const eligible = [];

  // 批量查 balanceOf（每批20个）
  for (let i = 0; i < len; i += 20) {
    const batch = [];
    for (let j = i; j < Math.min(i + 20, len); j++) {
      batch.push(vault.holders(j));
    }
    const addrs = await Promise.all(batch);
    const bals  = await Promise.all(addrs.map(a => token.balanceOf(a)));

    for (let k = 0; k < addrs.length; k++) {
      const balTokens = parseFloat(ethers.utils.formatEther(bals[k]));
      const usdValue  = balTokens * priceUSD;
      if (usdValue >= MIN_USD) {
        eligible.push(addrs[k]);
      }
    }
  }
  return eligible;
}

// ── 4. 开奖主循环 ─────────────────────────────
async function tryDraw() {
  try {
    const nextDraw = (await vault.nextDrawTime()).toNumber();
    const now      = Math.floor(Date.now() / 1000);
    if (now < nextDraw) {
      console.log(`[draw] 还需等待 ${nextDraw - now}s`);
      return;
    }

    const priceUSD = await getTokenPriceUSD();
    console.log(`[draw] token价格: $${priceUSD}`);

    const eligible = await getEligible(priceUSD);
    console.log(`[draw] 符合条件地址数: ${eligible.length}`);

    if (eligible.length === 0) {
      console.log('[draw] 无符合条件地址，跳过');
      return;
    }

    const tx = await vault.triggerDraw(eligible, { gasLimit: 500000 });
    console.log('[draw] tx:', tx.hash);
    await tx.wait();
    console.log('[draw] 开奖完成 ✓');
  } catch (e) {
    console.error('[draw error]', e.message);
  }
}

// 启动
console.log('LotteryVault 后端启动');
console.log('  Token:', TAX_TOKEN);
console.log('  Vault:', VAULT);
console.log('  开奖间隔:', DRAW_INTERVAL_MS, 'ms');
console.log('  持仓门槛: $', MIN_USD);

setInterval(tryDraw, DRAW_INTERVAL_MS);
tryDraw(); // 立即执行一次
