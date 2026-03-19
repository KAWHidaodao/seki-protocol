---
name: bsc-meme-agent
description: Build and deploy BSC on-chain Meme AI Agent projects. Use when: creating or modifying a BSC Meme token incentive platform, building Web3 single-page apps with wallet connect + contract interaction, deploying Solidity contracts to BSC mainnet, integrating OKX V5 market data API (price/funding rate/sentiment), setting up Meme task bounty systems (hold/buy/referral/tournament), or building AI Agent delegation UIs. Covers full stack: Solidity contracts, Node.js backend, vanilla JS frontend, OKX API, BSCScan verification.
---

# BSC Meme AI Agent Skill

Full-stack reference for building BSC on-chain Meme incentive + AI Agent platforms, based on the Seki Protocol.

## Architecture

```
Frontend (index.html, single file)
  └── ethers.js  →  BSC Contracts (MemeBountyV5, AgentRegistry, SekiRegistry)
  └── fetch()    →  Node.js Backend (server.js)
                       └── OKX V5 API (price, sentiment, hot tokens)
```

## Contracts

See `references/contracts.md` for full ABI and deployment details.

| Contract | Address (BSC) | Role |
|----------|--------------|------|
| MemeBountyV5 | `0xe2D7f97A6C63ADcAf14Fe70B8bdAD022349A9655` | Task bounty core |
| AgentRegistry | `0x4BCdAA599136Bee256f5Ce84bBc08D175E17E06b` | ERC-8183 Agent registry |
| SekiRegistry | `0x318E5740175EF550b00facA1B04C5C63EE6dB7a9` | Universal Agent protocol |

## Key Patterns

### Wallet Connect + Contract Call
```js
async function connectWallet() {
  if (!window.ethereum) return toast('请安装 MetaMask', 'e');
  const provider = new ethers.BrowserProvider(window.ethereum);
  await provider.send('eth_requestAccounts', []);
  const signer = await provider.getSigner();
  addr = await signer.getAddress();
  // Switch to BSC
  await window.ethereum.request({
    method: 'wallet_switchEthereumChain',
    params: [{ chainId: '0x38' }]
  });
}
```

### OKX V5 Market Data
Backend routes: `/api/okx/market`, `/api/okx/hot-tokens`, `/api/market/sentiment`

See `references/okx-api.md` for full implementation.

### Task Bounty Flow
1. User calls `createTask(token, taskType, reward, params)` with BNB
2. Participants call `claim(taskId)` — contract verifies on-chain (balance/buy/referral)
3. Agent calls `claimFor(taskId, user)` for batch settlement

### Common Bugs to Avoid
- `let`/`const` at module scope → TDZ errors across script blocks → use `var`
- `div` open/close count mismatch → always verify `diff = count('<div') - count('</div>') == 0`
- Nav `onclick` pointing to non-existent function → keep `connectWallet()` consistent
- Variable declared after IIFE that uses it → move declaration above IIFE

## Frontend Structure

Single HTML file with sections as `<div id="page-X" class="pw">`, shown/hidden via `G(page, navEl)`.

Pages: `home` / `how` / `dashboard` / `delegate` / `launch` / `docs` / `my`

## Deployment

```bash
# Server
node server.js  # or: systemctl restart memebounty

# Health check
curl https://seki-ai.com/api/okx/market
```

See `references/deployment.md` for Vultr VPS setup and systemd config.

## Resources

- **Contract ABIs + deployment**: `references/contracts.md`
- **OKX API integration**: `references/okx-api.md`
- **Deployment & ops**: `references/deployment.md`
- **Frontend boilerplate**: `assets/boilerplate/`
