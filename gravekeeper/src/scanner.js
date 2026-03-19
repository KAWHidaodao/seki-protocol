/**
 * GraveKeeper Agent — 扫描器
 * 每小时扫描 four.meme，找到"快死但值得救"的代币
 */

const axios = require('axios');

// 筛选标准
const CRITERIA = {
  minHolders: 20,          // 至少20个持仓人（还有真实社区）
  minAgeDays: 3,            // 存活超过3天（不是当天发的）
  maxProgressPct: 30,       // 募资进度低于30%（内盘还没满）
  minPriceDrop: 50,         // 从高点跌超50%（足够便宜）
};

/**
 * 扫描候选代币
 */
async function scanCandidates() {
  console.log('[Scanner] 开始扫描...');
  const candidates = [];

  try {
    // 拉取最近按时间排序的代币（新发的死币多在这里）
    const res = await axios.get('https://four.meme/api/v1/token/list', {
      params: {
        orderBy: 'Time',
        pageIndex: 1,
        pageSize: 50,
        listedPancake: false,  // 只看还在内盘的
      },
      headers: { 'User-Agent': 'GraveKeeper/1.0' },
      timeout: 10000,
    });

    const tokens = res.data?.data?.list || res.data?.list || [];
    console.log(`[Scanner] 获取到 ${tokens.length} 个代币`);

    const now = Date.now();

    for (const token of tokens) {
      const ageDays = (now - new Date(token.createTime || token.createdAt).getTime()) / 86400000;
      const progress = parseFloat(token.progress || token.raisedProgress || 0);
      const holders = parseInt(token.holderCount || token.holders || 0);

      // 基础筛选
      if (ageDays < CRITERIA.minAgeDays) continue;
      if (progress > CRITERIA.maxProgressPct) continue;
      if (holders < CRITERIA.minHolders) continue;

      candidates.push({
        address: token.tokenAddress || token.address,
        name: token.name,
        symbol: token.symbol,
        holders,
        progress,
        ageDays: ageDays.toFixed(1),
        createTime: token.createTime || token.createdAt,
      });
    }

    console.log(`[Scanner] 找到 ${candidates.length} 个候选`);
    return candidates;

  } catch (err) {
    console.error('[Scanner] 扫描失败:', err.message);
    // 降级：用 fourmeme CLI
    return scanViaCLI();
  }
}

/**
 * 降级方案：用 fourmeme CLI 扫描
 */
async function scanViaCLI() {
  const { execSync } = require('child_process');
  try {
    const raw = execSync('fourmeme token-rankings Time --pageSize=50', { timeout: 15000 }).toString();
    const data = JSON.parse(raw);
    const tokens = data.list || data.data || [];
    const now = Date.now();

    return tokens
      .filter(t => {
        const age = (now - new Date(t.createTime).getTime()) / 86400000;
        return age >= CRITERIA.minAgeDays
          && (t.progress || 0) <= CRITERIA.maxProgressPct
          && (t.holderCount || 0) >= CRITERIA.minHolders;
      })
      .map(t => ({
        address: t.tokenAddress,
        name: t.name,
        symbol: t.symbol,
        holders: t.holderCount,
        progress: t.progress,
        ageDays: ((now - new Date(t.createTime).getTime()) / 86400000).toFixed(1),
      }));
  } catch (e) {
    console.error('[Scanner] CLI 也失败了:', e.message);
    return [];
  }
}

module.exports = { scanCandidates };
