# GPN 部署指南（單一 VPS · 全包 · 小規模）

一台有公開 IP 的 VPS 上同時跑：mediasoup 訊令 server、Next.js web、Caddy 反向代理（自動 TLS）。
WebRTC 媒體（RTP）直接走 UDP/TCP 到公開 IP，不經過 Caddy。

```
                    Internet
                       │
        ┌──────────────┼───────────────────────────┐
        │ 443 (HTTPS/WSS)   40000-49999 UDP/TCP     │
        ▼                   ▼ (WebRTC 媒體，直連)     │
   ┌─────────┐         ┌────────────────┐            │
   │  Caddy  │         │ mediasoup 媒體  │ ← DTLS-SRTP，mediasoup 自己加密
   └────┬────┘         └────────────────┘            │
   /ws* │ /                    ▲                      │
   :3001  :3000 ───────────── 同一台 VM ──────────────┘
  server  web
```

## 前置條件

1. **VPS**：Ubuntu 22.04/24.04，2 vCPU / 2–4 GB，**公開 IPv4**。
   （Hetzner / DigitalOcean / Vultr / Linode / EC2 皆可。）
2. **網域**：A record 指向 VPS 公開 IP，本專案為 `gpn.senadn.com → 167.179.113.227`（Cloudflare 設為 DNS only / 灰色雲朵，**不要開橘色 proxy**，否則 WebRTC 媒體連不上、Caddy 也簽不出憑證）。
3. **雲商安全群組/防火牆**要放行：`22, 80, 443/tcp` 以及 `40000-49999` 的 **udp 與 tcp**。
   （AWS/GCP 預設會擋媒體 port，務必手動加規則。）

## 一鍵部署

在 VPS 上以 root 執行：

```bash
git clone https://github.com/seanyu77/GPN.git /opt/gpn-src
cd /opt/gpn-src
sudo bash deploy/deploy.sh
```

> 預設值已寫死為 `gpn.senadn.com` / `167.179.113.227`。要換成別的網域/IP 才需要帶環境變數：
> `sudo PUBLIC_IP=203.0.113.10 DOMAIN=app.mydomain.com bash deploy/deploy.sh`

腳本會：安裝 Node 20 + Caddy（若缺）→ 建立 `gpn` 使用者 → 同步原始碼到 `/opt/gpn`
→ build server 與 web（把 `wss://<DOMAIN>/ws` 編進前端）→ 安裝 systemd 服務與 Caddyfile
→ 設定 UFW → 啟動所有服務。可重複執行（會重新 build 並重啟）。

## 驗收

```bash
systemctl status gpn-server gpn-web caddy
journalctl -u gpn-server -f          # 看 mediasoup / 訊令 log
```

1. 瀏覽 `https://gpn.senadn.com`，憑證為綠鎖。
2. 開**兩個分頁**進同一房間 `https://gpn.senadn.com/rooms/test` → 兩邊互看得到影像。
3. `chrome://webrtc-internals` 確認 ICE candidate 的 IP 是**公開 IP**（不是 127.0.0.1）。

## 疑難排解

| 症狀 | 原因 / 處理 |
|---|---|
| 進得了房間、連得到訊令，但**沒有任何畫面** | `MEDIASOUP_ANNOUNCED_IP` 沒設或設錯；或媒體 port 沒開。檢查 systemd 環境變數與安全群組。 |
| 憑證簽不出來 | DNS A record 還沒指對，或 80/443 沒開。`journalctl -u caddy`。 |
| WebSocket 連不上 | 前端的 `NEXT_PUBLIC_SIGNALING_URL` 是 build 期注入；改網域後要**重新 build**（重跑 deploy.sh）。 |
| 只在某些網路連得上 | 對方在 UDP 被擋的網路。`enableTcp` 已開，會自動走 TCP fallback；確認 40000-49999 的 **tcp** 也有開。 |

## 手動部署（不想用腳本時）

1. 安裝 Node 20、Caddy。
2. `cd server && npm ci && npm run build`
3. `cd web && npm ci && NEXT_PUBLIC_SIGNALING_URL=wss://gpn.senadn.com/ws npm run build`
4. 把 `deploy/gpn-*.service` 複製到 `/etc/systemd/system/`（`MEDIASOUP_ANNOUNCED_IP` 已是 `167.179.113.227`）。
5. 把 `deploy/Caddyfile` 複製到 `/etc/caddy/Caddyfile`（網域已是 `gpn.senadn.com`）。
6. 開防火牆（見前置條件），`systemctl enable --now gpn-server gpn-web`、`systemctl reload caddy`。

## 已知限制（小規模可接受）

- Rooms 全在記憶體、單一 mediasoup worker（一核）→ server 重啟＝通話全斷；單機＝單點故障。
- 無 TURN：SFU 有公開 IP，client 直連，通常不需要。要長大時再加 worker pool / 多機 / TURN。
