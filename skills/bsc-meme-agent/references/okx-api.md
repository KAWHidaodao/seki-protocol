# OKX V5 Market Data API

## Backend Routes (Node.js / Express)

### GET /api/okx/market
Returns BNB/BTC/ETH prices + hot tokens.

```js
app.get('/api/okx/market', async (req, res) => {
  try {
    const syms = ['BNB-USDT','BTC-USDT','ETH-USDT'];
    const tickers = await Promise.all(syms.map(s =>
      fetch(`https://www.okx.com/api/v5/market/ticker?instId=${s}`).then(r=>r.json())
    ));
    const prices = tickers.map((t,i) => ({
      symbol: syms[i],
      price: t.data[0].last,
      change24h: ((parseFloat(t.data[0].last)-parseFloat(t.data[0].open24h))/parseFloat(t.data[0].open24h)*100).toFixed(2)
    }));
    res.json({ ok: true, prices });
  } catch(e) { res.json({ ok: false, prices: [] }); }
});
```

### GET /api/okx/hot-tokens
Top BSC tokens by volume from DexScreener.

```js
app.get('/api/okx/hot-tokens', async (req, res) => {
  try {
    const r = await fetch('https://api.dexscreener.com/latest/dex/tokens/BSC?limit=20').then(r=>r.json());
    const tokens = (r.pairs || [])
      .sort((a,b) => (b.volume?.h24||0) - (a.volume?.h24||0))
      .slice(0, 10)
      .map(p => ({
        symbol: p.baseToken.symbol,
        name: p.baseToken.name,
        price: p.priceUsd,
        change24h: p.priceChange?.h24 || 0,
        volume: p.volume?.h24 || 0,
        address: p.baseToken.address
      }));
    res.json({ ok: true, tokens });
  } catch(e) { res.json({ ok: false, tokens: [] }); }
});
```

### GET /api/market/sentiment
FGI score from OKX funding rate.

```js
app.get('/api/market/sentiment', async (req, res) => {
  try {
    const [fundR, ticker, depth] = await Promise.all([
      fetch('https://www.okx.com/api/v5/public/funding-rate?instId=BNB-USDT-SWAP').then(r=>r.json()),
      fetch('https://www.okx.com/api/v5/market/ticker?instId=BNB-USDT').then(r=>r.json()),
      fetch('https://www.okx.com/api/v5/market/books?instId=BNB-USDT&sz=20').then(r=>r.json())
    ]);
    const fundRate = parseFloat(fundR.data?.[0]?.fundingRate || 0);
    const change = parseFloat(ticker.data?.[0]?.sodUtc8 || 0);
    // Simple FGI: 50 base + funding rate signal + price change signal
    const score = Math.min(100, Math.max(0,
      50 + fundRate * 1000 + change * 2
    ));
    const label = score >= 75 ? '极度贪婪' : score >= 55 ? '贪婪' : score >= 45 ? '中性' : score >= 25 ? '恐惧' : '极度恐惧';
    res.json({ ok: true, score: Math.round(score), label, fundRate, source: 'okx-v5' });
  } catch(e) { res.json({ ok: false, score: 50, label: '中性' }); }
});
```

## Frontend Update Pattern

```js
// 30s interval, 1s LIVE timestamp
async function loadMarketData() {
  const d = await fetch('/api/okx/market').then(r=>r.json());
  if (d.prices) {
    const bnb = d.prices.find(x=>x.symbol==='BNB-USDT');
    document.getElementById('bnb-price').textContent = '$' + parseFloat(bnb.price).toFixed(2);
    const chgEl = document.getElementById('bnb-chg');
    chgEl.textContent = (bnb.change24h>=0?'+':'') + bnb.change24h + '% 24h';
    chgEl.style.color = bnb.change24h >= 0 ? '#4ade80' : '#f87171';
  }
}
setInterval(loadMarketData, 30000);
loadMarketData();

// LIVE time ticker (1s)
setInterval(() => {
  const n = new Date();
  const t = `${String(n.getUTCHours()).padStart(2,'0')}:${String(n.getUTCMinutes()).padStart(2,'0')}:${String(n.getUTCSeconds()).padStart(2,'0')}`;
  const el = document.getElementById('live-time');
  if (el) el.textContent = t;
}, 1000);
```

## Rate Limits
- OKX public API: 20 req/2s per IP — 30s polling is safe
- DexScreener: 300 req/min — safe for periodic calls
