# Vector — production setup guide

This guide is for the engineer who puts Vector live on **annaaccounting.com**. It covers one Ubuntu server that runs everything:

| Part | What it is | Runs as |
|---|---|---|
| Frontend | Vue app, built to static files (`frontend/dist`) | Served by Nginx |
| Backend | Node.js API + Socket.IO (chat, notifications, meeting signalling) + background jobs | One systemd service on port 4000 |
| Database | PostgreSQL | Local service, not exposed |
| TURN relay | coturn, carries meeting video for people behind strict firewalls | systemd service |
| HTTPS | Let's Encrypt certificates | Certbot |

```text
                       https://vector.annaaccounting.com
Browser ──► Nginx :443 ──┬── /            → frontend/dist (static files)
                         ├── /api         → Node backend 127.0.0.1:4000
                         └── /socket.io   → Node backend 127.0.0.1:4000 (WebSocket)

Browser ◄──── meeting video, direct between browsers (WebRTC) ────► Browser
Browser ──► turn.annaaccounting.com :3478 / :5349 (coturn) ──► Browser   (only when the direct path is blocked)
```

> **Run exactly one backend instance.** Call rooms, online presence and the job scheduler live in the backend's memory. Do not use PM2 cluster mode, several containers or a load balancer across instances.

---

## 1. Server requirements

- Ubuntu 22.04 or 24.04 LTS, with root (sudo) access and a **public IPv4 address**.
- Minimum 2 vCPU, 4 GB RAM, 40 GB disk. Bandwidth: plan about 1.5 Mbps per person in a relayed call (most calls connect directly and use no server bandwidth).
- Node.js **20 or newer**, PostgreSQL 14 or newer, Nginx, coturn, Certbot.

## 2. DNS

Create two **A records** pointing to the server's public IP:

| Name | Type | Value |
|---|---|---|
| `vector.annaaccounting.com` | A | `<SERVER_PUBLIC_IP>` |
| `turn.annaaccounting.com` | A | `<SERVER_PUBLIC_IP>` |

If the domain is on Cloudflare, set **both records to "DNS only" (grey cloud)**. TURN traffic cannot pass through Cloudflare's proxy.

## 3. Firewall

Open these ports in `ufw` **and** in the cloud provider's firewall or security group:

| Port | Protocol | Purpose |
|---|---|---|
| 22 | TCP | SSH (restrict to your IPs if possible) |
| 80, 443 | TCP | Web app, HTTPS, certificate renewal |
| 3478 | TCP + UDP | TURN |
| 5349 | TCP | TURN over TLS (works through most corporate firewalls) |
| 49152–65535 | UDP | TURN relay media |

Do **not** open 4000 (backend) or 5432 (PostgreSQL).

```bash
sudo ufw allow OpenSSH
sudo ufw allow 80,443/tcp
sudo ufw allow 3478
sudo ufw allow 5349/tcp
sudo ufw allow 49152:65535/udp
sudo ufw enable
```

## 4. Install packages

```bash
sudo apt update && sudo apt upgrade -y
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs nginx postgresql coturn certbot python3-certbot-nginx git
node --version   # must be v20 or newer
```

## 5. Database

```bash
sudo -u postgres psql
```

```sql
CREATE USER vector WITH PASSWORD '<STRONG_DB_PASSWORD>';
CREATE DATABASE vector OWNER vector;
\q
```

Tables are created automatically when the backend starts (`DB_AUTO_SYNC=true`).

## 6. Get the code and configure it

```bash
sudo useradd --system --create-home --home-dir /opt/vector --shell /usr/sbin/nologin vector
sudo -u vector git clone <REPOSITORY_URL> /opt/vector/app
cd /opt/vector/app
```

### 6.1 Generate secrets

Run these once and keep the output in the company password manager:

```bash
openssl rand -hex 48   # JWT_SECRET
openssl rand -hex 32   # TURN_SECRET (the same value goes into coturn, step 9)
```

### 6.2 Backend environment — `/opt/vector/app/backend/.env`

```dotenv
# --- Server
NODE_ENV=production
PORT=4000
CLIENT_URL=https://vector.annaaccounting.com

# --- Auth
JWT_SECRET=<OUTPUT_OF_openssl_rand_-hex_48>
JWT_EXPIRES_IN=7d

# --- Super admin (portal owner; the account is created/updated on startup)
SUPER_ADMIN_EMAIL=<SUPER_ADMIN_EMAIL>
SUPER_ADMIN_PASSWORD=<STRONG_PASSWORD>
SUPER_ADMIN_NAME=<NAME>

# --- Database
DB_NAME=vector
DB_USER=vector
DB_PASSWORD=<STRONG_DB_PASSWORD>
DB_HOST=127.0.0.1
DB_PORT=5432
DB_LOGGING=false
DB_AUTO_SYNC=true

# --- Email (SendGrid; without a key, emails are only logged)
SENDGRID_API_KEY=<SENDGRID_API_KEY>
SENDGRID_FROM_EMAIL=no-reply@annaaccounting.com
SENDGRID_FROM_NAME=Vector

# --- AI assistant (optional)
OPENAI_API_KEY=
OPENAI_MODEL=gpt-4o-mini
OPENAI_BASE_URL=https://api.openai.com/v1

# --- Files and jobs
UPLOAD_DIR=/opt/vector/uploads
UPLOAD_MAX_MB=20
JOBS_ENABLED=true

# --- Meetings (video calls)
STUN_URLS=stun:stun.l.google.com:19302,stun:stun1.l.google.com:19302
TURN_URLS=turn:turn.annaaccounting.com:3478?transport=udp,turn:turn.annaaccounting.com:3478?transport=tcp,turns:turn.annaaccounting.com:5349?transport=tcp
TURN_SECRET=<OUTPUT_OF_openssl_rand_-hex_32>
TURN_TTL_SECONDS=21600
```

```bash
sudo mkdir -p /opt/vector/uploads
sudo chown -R vector:vector /opt/vector
sudo chmod 600 /opt/vector/app/backend/.env
```

### 6.3 Frontend environment — `/opt/vector/app/frontend/.env.production`

The app, API and sockets share one origin, so the API settings stay relative. Values are baked in at build time.

```dotenv
VITE_API_URL=/api
VITE_SOCKET_URL=

VITE_LEGAL_COMPANY_NAME=<COMPANY_LEGAL_NAME>
VITE_LEGAL_CONTACT_EMAIL=<PRIVACY_CONTACT_EMAIL>
VITE_LEGAL_POSTAL_ADDRESS=<COMPANY_ADDRESS>
VITE_LEGAL_JURISDICTION=<JURISDICTION>
VITE_LEGAL_EFFECTIVE_DATE=<DATE>
```

No meeting or TURN keys go in the frontend. The backend hands each person short-lived TURN passwords.

### 6.4 Install and build

```bash
cd /opt/vector/app
sudo -u vector npm ci --prefix backend --omit=dev
sudo -u vector npm ci --prefix frontend
sudo -u vector npm run build --prefix frontend
sudo mkdir -p /var/www/vector
sudo rsync -a --delete frontend/dist/ /var/www/vector/
```

## 7. Backend service — `/etc/systemd/system/vector.service`

```ini
[Unit]
Description=Vector API
After=network.target postgresql.service

[Service]
User=vector
WorkingDirectory=/opt/vector/app/backend
Environment=NODE_ENV=production
ExecStart=/usr/bin/node src/server.js
Restart=always
RestartSec=5
LimitNOFILE=65535

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now vector
sudo journalctl -u vector -f     # expect: "[server] Vector API listening on ..."
```

The log must **not** show `[meetings] no TURN relay configured`. If it does, `TURN_URLS` / `TURN_SECRET` are missing from `.env`.

## 8. Nginx and HTTPS

### 8.1 `/etc/nginx/sites-available/vector`

```nginx
map $http_upgrade $connection_upgrade {
    default upgrade;
    ''      close;
}

server {
    listen 80;
    server_name vector.annaaccounting.com;
    root /var/www/vector;

    client_max_body_size 25m;   # a little above UPLOAD_MAX_MB

    # Camera, microphone and screen sharing are needed by meetings; never send a header that blocks them.
    add_header Permissions-Policy "camera=(self), microphone=(self), display-capture=(self)" always;

    location /api/ {
        proxy_pass http://127.0.0.1:4000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 120s;
    }

    location /socket.io/ {
        proxy_pass http://127.0.0.1:4000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection $connection_upgrade;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 3600s;   # chat and meeting sockets stay open
        proxy_send_timeout 3600s;
    }

    # The service worker and app shell must never be cached, or users keep an old version.
    location = /sw.js       { add_header Cache-Control "no-cache"; try_files $uri =404; }
    location = /index.html  { add_header Cache-Control "no-cache"; }

    location /assets/ {
        add_header Cache-Control "public, max-age=31536000, immutable";
        try_files $uri =404;
    }

    location / {
        try_files $uri $uri/ /index.html;   # single-page app routes
    }
}

# Only used to obtain the TURN certificate (coturn serves the actual traffic).
server {
    listen 80;
    server_name turn.annaaccounting.com;
    root /var/www/html;
}
```

```bash
sudo ln -s /etc/nginx/sites-available/vector /etc/nginx/sites-enabled/vector
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx
```

### 8.2 Certificates

```bash
sudo certbot --nginx -d vector.annaaccounting.com --redirect
sudo certbot certonly --nginx -d turn.annaaccounting.com
```

Certbot renews both automatically (`systemctl list-timers | grep certbot`).

## 9. TURN relay (coturn)

### 9.1 Let coturn read the certificate

coturn runs as the `turnserver` user and cannot read Let's Encrypt's private keys directly. This hook copies them on every renewal.

`/etc/letsencrypt/renewal-hooks/deploy/coturn.sh`:

```bash
#!/bin/sh
set -e
DOMAIN=turn.annaaccounting.com
install -d -o turnserver -g turnserver -m 750 /etc/coturn/certs
install -o turnserver -g turnserver -m 640 /etc/letsencrypt/live/$DOMAIN/fullchain.pem /etc/coturn/certs/fullchain.pem
install -o turnserver -g turnserver -m 600 /etc/letsencrypt/live/$DOMAIN/privkey.pem  /etc/coturn/certs/privkey.pem
systemctl restart coturn || true
```

```bash
sudo chmod +x /etc/letsencrypt/renewal-hooks/deploy/coturn.sh
sudo /etc/letsencrypt/renewal-hooks/deploy/coturn.sh
```

### 9.2 `/etc/turnserver.conf`

Replace the whole file:

```ini
# Ports
listening-port=3478
tls-listening-port=5349
min-port=49152
max-port=65535

# Public address. On AWS, GCP, Azure or any server behind NAT use: external-ip=<PUBLIC_IP>/<PRIVATE_IP>
external-ip=<SERVER_PUBLIC_IP>

realm=turn.annaaccounting.com
server-name=turn.annaaccounting.com

# Vector creates expiring passwords with this secret. It must equal TURN_SECRET in backend/.env.
use-auth-secret
static-auth-secret=<SAME_VALUE_AS_TURN_SECRET>

# TLS
cert=/etc/coturn/certs/fullchain.pem
pkey=/etc/coturn/certs/privkey.pem
no-tlsv1
no-tlsv1_1

# Security: no open relay into private networks or back to this server
fingerprint
no-multicast-peers
no-cli
denied-peer-ip=0.0.0.0-0.255.255.255
denied-peer-ip=10.0.0.0-10.255.255.255
denied-peer-ip=100.64.0.0-100.127.255.255
denied-peer-ip=127.0.0.0-127.255.255.255
denied-peer-ip=169.254.0.0-169.254.255.255
denied-peer-ip=172.16.0.0-172.31.255.255
denied-peer-ip=192.168.0.0-192.168.255.255
denied-peer-ip=::1

# Limits
user-quota=12
total-quota=1200
stale-nonce=600

# Logs
log-file=/var/log/turnserver/turnserver.log
simple-log
```

```bash
sudo mkdir -p /var/log/turnserver && sudo chown turnserver:turnserver /var/log/turnserver
# Ubuntu 22.04 only: enable the service
sudo sed -i 's/^#\?TURNSERVER_ENABLED=.*/TURNSERVER_ENABLED=1/' /etc/default/coturn 2>/dev/null || true
sudo systemctl enable --now coturn
sudo systemctl restart coturn
sudo systemctl status coturn
sudo ss -lntup | grep -E '3478|5349'   # coturn must be listening
```

## 10. Verify

### 10.1 App and API

```bash
curl -s https://vector.annaaccounting.com/api/health
# {"status":"ok", ...}
```

Open `https://vector.annaaccounting.com`, sign in, and check the browser console has no WebSocket errors.

### 10.2 TURN

Generate a test login on the server (uses the same scheme as Vector):

```bash
SECRET='<TURN_SECRET>'
USERNAME="$(( $(date +%s) + 3600 )):devops-test"
PASSWORD=$(printf '%s' "$USERNAME" | openssl dgst -sha1 -hmac "$SECRET" -binary | base64)
echo "username: $USERNAME"; echo "password: $PASSWORD"
```

Then open <https://webrtc.github.io/samples/src/content/peerconnection/trickle-ice/>:

1. Remove the default server and add `turn:turn.annaaccounting.com:3478` (then also `turns:turn.annaaccounting.com:5349?transport=tcp`) with the username and password above.
2. Click **Gather candidates**.
3. Pass: at least one row with type **relay**. No relay row means a closed port, a wrong `external-ip`, or a secret mismatch.

### 10.3 Real call test (must pass before go-live)

| # | Test | Expected |
|---|---|---|
| 1 | Two users, two browsers on the same network, join one meeting | Both see and hear each other |
| 2 | One user on office Wi-Fi, one on mobile data | Both see and hear each other (often through the relay) |
| 3 | Block the camera at the browser prompt, then click the camera button in the call | The browser asks again, or a clear message explains how to allow it |
| 4 | Share screen from a laptop | The other person sees the screen in the large tile |
| 5 | Turn Wi-Fi off for about 10 seconds during a call | "Reconnecting…" banner, then the call resumes |
| 6 | Host clicks "End for everyone" | Everyone leaves; the meeting shows as Ended |
| 7 | Everyone leaves before the planned end | The meeting no longer shows "Live now" |

## 11. Updating to a new version

```bash
cd /opt/vector/app
sudo -u vector git pull
sudo -u vector npm ci --prefix backend --omit=dev
sudo -u vector npm ci --prefix frontend
sudo -u vector npm run build --prefix frontend
sudo rsync -a --delete frontend/dist/ /var/www/vector/
sudo systemctl restart vector
```

Database columns added by new versions are applied automatically on startup. **Never run `npm run db:reset` or `npm run db:seed` on production**: `db:reset` deletes all data.

## 12. Backups

```bash
# /etc/cron.d/vector-backup — nightly database dump and uploads, kept 14 days
0 2 * * * postgres pg_dump -Fc vector > /var/backups/vector-$(date +\%F).dump && find /var/backups -name 'vector-*.dump' -mtime +14 -delete
30 2 * * * root tar -czf /var/backups/vector-uploads-$(date +\%F).tgz -C /opt/vector uploads && find /var/backups -name 'vector-uploads-*.tgz' -mtime +14 -delete
```

Copy `/var/backups` off the server (object storage or another machine). Restore test: `pg_restore -d vector_restore /var/backups/vector-<date>.dump`.

## 13. Operations

| What | Where |
|---|---|
| Backend logs | `journalctl -u vector -f` |
| TURN logs | `/var/log/turnserver/turnserver.log` |
| Nginx logs | `/var/log/nginx/access.log`, `error.log` |
| Restart backend | `sudo systemctl restart vector` |
| Restart TURN | `sudo systemctl restart coturn` |

- **Changing `.env`** requires `sudo systemctl restart vector`.
- **Rotating the TURN secret:** set the new value in both `backend/.env` (`TURN_SECRET`) and `/etc/turnserver.conf` (`static-auth-secret`), then restart both services. People in a call reconnect automatically.
- **Call size:** up to 8 people per call (browser-to-browser). Larger meetings need a media server (e.g. LiveKit); talk to the development team first.

## 14. Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| Camera prompt never appears | Site opened over `http://` | Use `https://`; check the certbot redirect |
| "Not connected to Vector" when joining | `/socket.io` not proxied with WebSocket upgrade | Check the `/socket.io/` block and `Upgrade` headers in Nginx |
| Chat and calls drop every 60 s | Nginx default socket timeout | `proxy_read_timeout 3600s` on `/socket.io/` |
| Calls work at home, black tiles in offices | No working TURN | Section 10.2; check ports 3478, 5349 and 49152–65535/udp |
| Trickle ICE shows no relay candidate | Secret mismatch, wrong `external-ip`, or closed UDP range | Compare `TURN_SECRET` with `static-auth-secret`; set `external-ip=PUBLIC/PRIVATE` on cloud VMs |
| Backend log: `no TURN relay configured` | TURN keys missing from `.env` | Add `TURN_URLS` and `TURN_SECRET`, then restart |
| Users see an old version after an update | Service worker or `index.html` cached | Check the `no-cache` rules for `/sw.js` and `/index.html` |
| Upload fails with 413 | Nginx body limit | Raise `client_max_body_size` |
| Online status or calls behave oddly | More than one backend instance running | Run exactly one `vector` service |
