---
name: seki-jobs
version: 1.0.0
description: Seki AI 任务管理 — 发任务、查任务、结算、排行榜、热门 meme 代币查询、聪明钱信号。通过 seki-ai.com 后端 API 操作 BSC 链上 Agent 委托任务，并聚合 DexScreener/GeckoTerminal 热门 meme 数据。
license: MIT
author: KAWHidaodao
base_url: https://seki-ai.com
---

# Seki Jobs Skill

管理 Seki AI 平台上的 Agent 委托任务。

## 基础 URL

```
https://seki-ai.com
```

## 接口列表

### 1. 查询所有任务

```
GET /api/jobs
```

返回所有任务列表（含 active/cancelled/done 状态）。

**响应示例：**
```json
[
  {
    "jobId": 1,
    "token": "0xabc...",
    "agentType": "meme-sniper",
    "budget": "0.1",
    "hours": 24,
    "tg": "@user",
    "active": true,
    "createdAt": 1710000000000
  }
]
```

---

### 2. 发布任务

```
POST /api/jobs
Content-Type: application/json
```

**请求体：**
```json
{
  "jobId": 1,
  "token": "0x代币合约地址",
  "agentType": "meme-sniper",
  "budget": "0.1",
  "hours": 24,
  "tg": "@telegram用户名"
}
```

- `jobId`：链上 JobCreated 事件返回的 ID
- `token`：目标代币合约地址（BSC）
- `agentType`：agent 类型，如 `meme-sniper`、`trend-follower`、`arb-bot`
- `budget`：预算（BNB 单位）
- `hours`：任务时长（小时）
- `tg`：联系方式（Telegram 用户名）

**响应：**
```json
{ "ok": true }
```

---

### 3. 取消任务

```
POST /api/jobs/cancel
Content-Type: application/json
```

**请求体：**
```json
{ "jobId": 1 }
```

**响应：**
```json
{ "ok": true }
```

---

### 4. 结算任务

```
POST /api/jobs/settle
Content-Type: application/json
```

**请求体：**
```json
{
  "jobId": 1,
  "result": "任务完成描述，如：买入 3 次，盈利 12%",
  "txHash": "0x链上结算交易哈希（可选）"
}
```

**响应：**
```json
{ "ok": true }
```

---

### 5. 排行榜

```
GET /api/jobs/rank?limit=20
```

按 agentType 统计完成任务数排行。

**参数：**
- `limit`：返回条数，默认 20，最大 100

**响应示例：**
```json
{
  "ok": true,
  "rank": [
    { "agentType": "meme-sniper", "total": 10, "completed": 8, "totalBudget": 2.5 },
    { "agentType": "trend-follower", "total": 5, "completed": 3, "totalBudget": 1.2 }
  ]
}
```

---

## 使用指南

### 发任务流程

1. 用户在前端完成钱包签名，调用链上 `createJobAndFund`
2. 链上成功后，前端拿到 `jobId`，调用 `POST /api/jobs` 通知后端
3. Agent 开始执行任务

### 结算流程

1. Agent 完成任务后，调用链上结算合约
2. 拿到 `txHash` 后，调用 `POST /api/jobs/settle` 更新状态

### 查询示例（curl）

```bash
# 查所有任务
curl https://seki-ai.com/api/jobs

# 排行榜 Top 10
curl "https://seki-ai.com/api/jobs/rank?limit=10"

# 发任务
curl -X POST https://seki-ai.com/api/jobs \
  -H "Content-Type: application/json" \
  -d '{"jobId":1,"token":"0xabc","agentType":"meme-sniper","budget":"0.1","hours":24,"tg":"@user"}'

# 结算
curl -X POST https://seki-ai.com/api/jobs/settle \
  -H "Content-Type: application/json" \
  -d '{"jobId":1,"result":"完成，盈利8%","txHash":"0x..."}'
```

---

### 6. 热门 Meme 代币

```
GET /api/bsc/hot-meme
```

从 DexScreener 聚合 BSC 链上热门 meme 代币（pepe/doge/shib/floki/meme/baby 等关键词），按 24h 交易量排序，过滤流动性 >$5000、交易量 >$3000。

**响应示例：**
```json
{
  "ok": true,
  "tokens": [
    {
      "symbol": "PEPE",
      "name": "Pepe Token",
      "price": 0.0000012,
      "change24h": 15.3,
      "volume24h": 1250000,
      "marketCap": 8500000,
      "url": "https://dexscreener.com/bsc/0x..."
    }
  ]
}
```

---

### 7. 聪明钱 / 趋势池子信号

```
GET /api/bsc/smart-money
```

从 GeckoTerminal 获取 BSC 链上趋势池子和新池子，聚合聪明钱信号。

**响应示例：**
```json
{
  "ok": true,
  "smartMoney": [...],
  "newPools": [...],
  "trendingPools": [...]
}
```

---

## 合约地址（BSC）

| 合约 | 地址 |
|------|------|
| MemeBountyV5 | `0xe2D7f97A6C63ADcAf14Fe70B8bdAD022349A9655` |
| AgentRegistry | `0x8c98f9821299e531353dd004b722851cf1b4c8a2` |
| SekiRegistry | `0x318E5740175EF550b00facA1B04C5C63EE6dB7a9` |

## 注意事项

- 所有接口均支持 CORS，无需额外认证
- `jobId` 必须与链上 `JobCreated` 事件一致
- 结算需要链上交易先完成，再调用 `/api/jobs/settle` 同步状态
