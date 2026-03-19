/**
 * GraveKeeper Agent — 执行器
 * 买入、卖出、发 Telegram 公告
 */

require('dotenv').config();
const { execSync } = require('child_process');
const TelegramBot = require('node-telegram-bot-api');
const { ethers } = require('ethers');

const BOT = process.env.TELEGRAM_BOT_TOKEN
  ? new TelegramBot(process.env.TELEGRAM_BOT_TOKEN)
  : null;
const CHANNEL = process.env.TELEGRAM_CHANNEL_ID;
const BUY_AMOUNT = parseFloat(process.env.BUY_AMOUNT_BNB || '0.01');
const TAKE_PROFIT = parseFloat(process.env.TAKE_PROFIT_MULTIPLIER || '2');
const KEEP_RATIO = parseFloat(process.env.KEEP_RATIO || '0.5');

// 持仓记录（内存，重启后从文件恢复）
const fs = require('fs');
const POSITIONS_FILE = './positions.json';

function loadPositions() {
  try { return JSON.parse(fs.readFileSync(POSITIONS_FILE)); } catch { return {}; }
}

function savePositions(positions) {
  fs.writeFileSync(POSITIONS_FILE, JSON.stringify(positions, null, 2));
}

/**
 * 发 Telegram 公告
 */
async function announce(text) {
  console.log('[Telegram]', text);
  if (BOT && CHANNEL) {
    try {
      await BOT.sendMessage(CHANNEL, text, { parse_mode: 'Markdown' });
    } catch (e) {
      console.error('[Telegram] 发送失败:', e.message);
    }
  }
}

/**
 * 执行买入
 */
async function buy(token, score) {
  const positions = loadPositions();

  // 已经持有就跳过
  if (positions[token.address]) {
    console.log(`[Executor] 已持有 ${token.symbol}，跳过`);
    return;
  }

  const amountWei = ethers.parseEther(BUY_AMOUNT.toString()).toString();
  // 允许 2% 滑点
  const minReceive = '0';

  console.log(`[Executor] 买入 ${token.symbol}，花费 ${BUY_AMOUNT} BNB...`);

  try {
    // 先报价
    const quoteRaw = execSync(
      `fourmeme quote-buy ${token.address} 0 ${amountWei}`,
      { timeout: 15000, env: { ...process.env } }
    ).toString();
    const quote = JSON.parse(quoteRaw);
    const receiveAmount = quote.tokenAmount || quote.amount || '0';

    // 执行买入
    const buyRaw = execSync(
      `fourmeme buy ${token.address} funds ${amountWei} ${minReceive}`,
      { timeout: 30000, env: { ...process.env } }
    ).toString();
    const result = JSON.parse(buyRaw);

    // 记录持仓
    positions[token.address] = {
      token,
      score,
      buyAmountBNB: BUY_AMOUNT,
      buyTokenAmount: receiveAmount,
      buyTime: new Date().toISOString(),
      txHash: result.txHash || result.hash,
      targetMultiplier: TAKE_PROFIT,
    };
    savePositions(positions);

    // 发公告
    await announce(
      `🪦 *守墓人出手了*\n\n` +
      `代币：*${token.name}* ($${token.symbol})\n` +
      `合约：\`${token.address}\`\n` +
      `买入：${BUY_AMOUNT} BNB\n` +
      `得分：${score}/100\n` +
      `持仓人：${token.holders} | 存活：${token.ageDays}天\n\n` +
      `📌 这枚代币曾被遗忘，守墓人选择让它重生。\n` +
      `目标：翻倍卖出50%，剩余永久持仓。`
    );

    console.log(`[Executor] 买入成功: ${result.txHash}`);
    return result;

  } catch (err) {
    console.error(`[Executor] 买入失败:`, err.message);
    throw err;
  }
}

/**
 * 检查持仓，决定是否止盈
 */
async function checkAndSell() {
  const positions = loadPositions();
  const tokenAddresses = Object.keys(positions);

  if (tokenAddresses.length === 0) return;

  console.log(`[Executor] 检查 ${tokenAddresses.length} 个持仓...`);

  for (const address of tokenAddresses) {
    const pos = positions[address];

    try {
      // 查当前可卖价格
      const quoteRaw = execSync(
        `fourmeme quote-sell ${address} ${pos.buyTokenAmount}`,
        { timeout: 10000, env: { ...process.env } }
      ).toString();
      const quote = JSON.parse(quoteRaw);
      const currentBNB = parseFloat(ethers.formatEther(quote.bnbAmount || quote.amount || '0'));
      const multiplier = currentBNB / pos.buyAmountBNB;

      console.log(`  ${pos.token.symbol}: 买入${pos.buyAmountBNB}BNB → 当前${currentBNB.toFixed(4)}BNB (${multiplier.toFixed(2)}x)`);

      // 翻倍了就卖出 50%
      if (multiplier >= TAKE_PROFIT) {
        await sellHalf(address, pos, currentBNB, multiplier);
      }

    } catch (err) {
      console.error(`  ${pos.token.symbol} 查价失败:`, err.message);
    }
  }
}

/**
 * 卖出一半，留一半
 */
async function sellHalf(address, pos, currentBNB, multiplier) {
  const sellAmount = BigInt(pos.buyTokenAmount) / 2n;
  const minBNB = '0';

  console.log(`[Executor] 止盈 ${pos.token.symbol}，卖出50%...`);

  try {
    const sellRaw = execSync(
      `fourmeme sell ${address} ${sellAmount.toString()} ${minBNB}`,
      { timeout: 30000, env: { ...process.env } }
    ).toString();
    const result = JSON.parse(sellRaw);

    // 更新持仓（标记已止盈，留仓永不卖）
    const positions = loadPositions();
    positions[address] = {
      ...pos,
      halfSold: true,
      sellTime: new Date().toISOString(),
      sellTxHash: result.txHash || result.hash,
      remainingAmount: sellAmount.toString(),
      profitBNB: (currentBNB / 2).toFixed(4),
    };
    savePositions(positions);

    await announce(
      `💰 *守墓人止盈*\n\n` +
      `代币：*${pos.token.name}* ($${pos.token.symbol})\n` +
      `买入：${pos.buyAmountBNB} BNB\n` +
      `卖出50%获得：${(currentBNB / 2).toFixed(4)} BNB\n` +
      `涨幅：${multiplier.toFixed(2)}x 🎉\n\n` +
      `📌 剩余50%永久持仓，守墓人陪你到底。`
    );

  } catch (err) {
    console.error(`[Executor] 卖出失败:`, err.message);
  }
}

module.exports = { buy, checkAndSell, announce };
