# Deployment & Ops

## Stack
- **VPS**: Vultr (any Linux, Ubuntu/CentOS)
- **Domain**: Cloudflare DNS + SSL
- **Process**: systemd service
- **Node**: v18+

## systemd Service

`/etc/systemd/system/memebounty.service`:
```ini
[Unit]
Description=Seki Meme Bounty Server
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/root/memebounty-v2
ExecStart=/usr/bin/node server.js
Restart=always
RestartSec=5
Environment=NODE_ENV=production
Environment=PORT=3000

[Install]
WantedBy=multi-user.target
```

```bash
systemctl daemon-reload
systemctl enable memebounty
systemctl start memebounty
systemctl status memebounty
```

## Nginx Reverse Proxy

```nginx
server {
    listen 443 ssl;
    server_name seki-ai.com;
    
    location / {
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

## server.js Minimal Structure

```js
const express = require('express');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname)));

// API routes
app.get('/api/okx/market', ...);
app.get('/api/okx/hot-tokens', ...);
app.get('/api/market/sentiment', ...);

// SPA fallback
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
```

## Common Ops Commands

```bash
# Restart after code change
systemctl restart memebounty

# Check logs
journalctl -u memebounty -f --no-pager -n 50

# Test API
curl https://seki-ai.com/api/okx/market | python3 -m json.tool

# Validate JS syntax before restart
node --check index.html  # won't work — extract script block first
python3 -c "
h=open('index.html').read()
pos=0; scripts=[]
while True:
    s=h.find('<script',pos)
    if s<0: break
    te=h.find('>',s)
    if 'src=' in h[s:te+1]: pos=te+1; continue
    e=h.find('</script>',s)
    scripts.append(h[te+1:e]); pos=e+1
open('/tmp/check.js','w').write(max(scripts,key=len))
"
node --check /tmp/check.js

# div balance check
python3 -c "h=open('index.html').read(); print('div diff:', h.count('<div')-h.count('</div>'))"
```

## File Safety Rules
1. Always check div diff = 0 after HTML edits
2. Always `node --check` after JS edits
3. Never use `rm` — use `trash` or backup first
4. Before major edits: `cp index.html index.html.backup-$(date +%H%M)`
