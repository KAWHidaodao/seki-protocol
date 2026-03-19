/**
 * GraveKeeper Agent — 评估器
 * AI 打分决定哪个币值得救
 */

const { execSync } = require('child_process');

/**
 * 评估候选代币，返回得分 0-100
 * 分数越高越值得救
 */
async function evaluate(token) {
  const score = { total: 0, reasons: [] };

  // 1. 持仓人数（越多越好，上限50分）
  const holderScore = Math.min(token.holders / 2, 50);
  score.total += holderScore;
  score.reasons.push(`持仓人 ${token.holders} → +${holderScore.toFixed(0)}分`);

  // 2. 存活时间（存活越久说明有真实支撑，上限20分）
  const ageScore = Math.min(parseFloat(token.ageDays) * 2, 20);
  score.total += ageScore;
  score.reasons.push(`存活 ${token.ageDays}天 → +${ageScore.toFixed(0)}分`);

  // 3. 募资进度（进度越低，买入成本越低，上限20分）
  const progressScore = Math.max(20 - token.progress * 0.5, 0);
  score.total += progressScore;
  score.reasons.push(`进度 ${token.progress}% → +${progressScore.toFixed(0)}分`);

  // 4. 链上活跃度（查最近有没有交易，上限10分）
  const activeScore = await checkRecentActivity(token.address);
  score.total += activeScore;
  score.reasons.push(`近期活跃度 → +${activeScore}分`);

  score.total = Math.round(score.total);
  return score;
}

/**
 * 检查代币最近是否有真实交易（防止完全死透的币）
 */
async function checkRecentActivity(tokenAddress) {
  try {
    const raw = execSync(`fourmeme token-get ${tokenAddress}`, { timeout: 10000 }).toString();
    const data = JSON.parse(raw);

    const vol24h = parseFloat(data.volume24h || data.tradingVolume24h || 0);
    const txCount = parseInt(data.txCount || data.tradeCount || 0);

    if (vol24h > 0.1) return 10;   // 24h 有交易量
    if (txCount > 0) return 5;      // 有过交易
    return 0;
  } catch {
    return 0;
  }
}

/**
 * 批量评估，返回排序后的候选列表
 */
async function evaluateAll(candidates) {
  console.log(`[Evaluator] 评估 ${candidates.length} 个候选...`);
  const results = [];

  for (const token of candidates) {
    const score = await evaluate(token);
    results.push({ ...token, score: score.total, reasons: score.reasons });
    console.log(`  ${token.symbol} (${token.name}): ${score.total}分`);
  }

  // 按分数排序，取前5
  return results
    .filter(t => t.score >= 40)   // 至少40分才值得救
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);
}

module.exports = { evaluate, evaluateAll };
