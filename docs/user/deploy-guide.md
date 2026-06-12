# デプロイガイド

> Todica サーバを VPS や自宅サーバにデプロイし、Web ブラウザ・Android アプリから接続できる状態にする手順。

## 構成図

```
              ┌─────────────────────────────────────────┐
              │  VPS / 自宅サーバ                       │
              │                                         │
 PC/スマホ ── HTTPS ── nginx ──────────┬── 静的ファイル (web/dist)
 のブラウザ                            │
                                       └── reverse proxy ─→ Node プロセス (Hono)
                                                              │
                                                              ↓
                                                          SQLite (better-sqlite3)
```

- サーバ自体は HTTP のみで動作する（TLS 終端は reverse proxy）
- Web クライアントは静的 SPA としてビルドされ、同じ reverse proxy が配信する（同一オリジン構成）
- データは SQLite 単一ファイル

## 前提

- VPS / 自宅サーバ（Ubuntu 22.04 LTS 以降を想定。Debian 系なら同じ手順）
- 独自ドメイン + TLS 証明書（Let's Encrypt で取得）。本番では HTTPS 必須
- ポート 80 / 443 の受信を許可するファイアウォール設定
- インターネット越し公開を行う場合、認証なしモードは禁止（`AUTH_TOKEN` を必ず設定する）

以下、サーバに SSH 接続した状態で作業する。

## 1. 必要なライブラリのインストール

### 1-1. システム更新

```bash
sudo apt update && sudo apt upgrade -y
```

### 1-2. Node.js 24.x（NodeSource 経由）

開発側の動作確認バージョンに合わせて 24.x を入れる（他バージョンは未検証）。

```bash
curl -fsSL https://deb.nodesource.com/setup_24.x | sudo -E bash -
sudo apt install -y nodejs
node -v   # v24.x.x
npm -v
```

### 1-3. ビルドツール（`better-sqlite3` のネイティブビルドに必要）

```bash
sudo apt install -y build-essential python3 git
```

### 1-4. SQLite CLI（バックアップ・確認用）

```bash
sudo apt install -y sqlite3
```

### 1-5. reverse proxy（nginx）

```bash
sudo apt install -y nginx certbot python3-certbot-nginx
```

### 1-6. ファイアウォール（ufw）

```bash
sudo ufw allow OpenSSH
sudo ufw allow 'Nginx Full'
sudo ufw enable
sudo ufw status
```

## 2. アプリの取得

```bash
sudo mkdir -p /opt/todica
sudo chown $USER /opt/todica
git clone https://github.com/BigTree777/todica.git /opt/todica
cd /opt/todica
npm install
```

## 3. 環境変数を設定する

リポジトリルートに `.env` を作成する。`.env.example` がテンプレート。

| 変数名 | 必須 | デフォルト | 説明 |
|---|---|---|---|
| `AUTH_TOKEN` | はい | - | Bearer 認証トークン。未設定だと起動失敗（`process.exit(1)`） |
| `DATABASE_PATH` | いいえ | `./todica.db` | SQLite ファイルのパス。本番では `/var/lib/todica/todica.db` 等の永続領域へ |
| `PORT` | いいえ | `3000` | リッスンポート |
| `VITE_API_BASE_URL` | Web ビルド時 | - | Web クライアントから叩く API のオリジン。同一ドメイン配信なら空文字でよい（相対パスで叩く） |
| `VITE_AUTH_TOKEN` | Web ビルド時 | - | Web クライアントが Bearer に乗せるトークン。`AUTH_TOKEN` と同じ値 |

`AUTH_TOKEN` は十分長いランダム文字列を生成する：

```bash
openssl rand -base64 32
```

`.env` の権限は所有者のみ読めるように：

```bash
chmod 600 .env
```

## 4. サーバをビルド・起動する

### ビルド

`server` は `domain` パッケージの型定義に依存するため、**先に `domain` をビルドする**必要がある。

```bash
npm run build -w domain
npm run build -w server
```

### 動作確認（フォアグラウンド）

```bash
npm start -w server
# 別ターミナルで
curl http://localhost:3000/healthz
# → {"status":"ok"}
```

起動時に `server/drizzle/*.sql` のマイグレーションが自動適用される（冪等）。

### systemd で常駐させる

`/etc/systemd/system/todica.service`：

```ini
[Unit]
Description=Todica API server
After=network.target

[Service]
Type=simple
User=todica
WorkingDirectory=/opt/todica
EnvironmentFile=/opt/todica/.env
ExecStart=/usr/bin/node server/dist/src/main.js
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
```

有効化：

```bash
sudo useradd -r -d /opt/todica -s /usr/sbin/nologin todica
sudo mkdir -p /var/lib/todica
sudo chown -R todica:todica /opt/todica /var/lib/todica
sudo systemctl daemon-reload
sudo systemctl enable --now todica
sudo systemctl status todica
journalctl -u todica -f  # ログ追跡
```

## 5. Web クライアントをビルドする

Web クライアントは静的 SPA としてビルドし、reverse proxy で配信する。

```bash
npm run build -w web
```

成果物は `web/dist/`。

> **重要**: `VITE_API_BASE_URL` / `VITE_AUTH_TOKEN` は **ビルド時に埋め込まれる**ため、これらの値を変えたら必ず `npm run build -w web` を再実行する。

同一ドメイン配信（後述の reverse proxy 構成）なら `VITE_API_BASE_URL=""` でよい。Web の JS は相対パスで `/api/v1/*` を叩く。

## 6. HTTPS / nginx で配信する

サーバ自体は HTTP で動作する。HTTPS は nginx で終端し、同一ドメインで Web 静的ファイルと API を配信する。

`/etc/nginx/sites-available/todica`：

```nginx
server {
  listen 80;
  server_name todica.example.com;
  return 301 https://$host$request_uri;
}

server {
  listen 443 ssl http2;
  server_name todica.example.com;
  ssl_certificate     /etc/letsencrypt/live/todica.example.com/fullchain.pem;
  ssl_certificate_key /etc/letsencrypt/live/todica.example.com/privkey.pem;

  # Web 静的ファイル
  root /opt/todica/web/dist;
  index index.html;

  # SPA: 存在しないパスは index.html に流す
  location / {
    try_files $uri $uri/ /index.html;
  }

  # API は Node プロセスへプロキシ
  location /api/ {
    proxy_pass http://127.0.0.1:3000;
    proxy_set_header Host              $host;
    proxy_set_header X-Real-IP         $remote_addr;
    proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }

  # ヘルスチェック
  location = /healthz {
    proxy_pass http://127.0.0.1:3000;
  }
}
```

有効化：

```bash
sudo ln -s /etc/nginx/sites-available/todica /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

## 7. データのバックアップ

SQLite ファイルを定期的にバックアップする。WAL モードで動作しているため、ホットコピーは `sqlite3 .backup` を使う：

```bash
sqlite3 /var/lib/todica/todica.db ".backup '/var/backups/todica/todica-$(date +%F).db'"
```

`/etc/cron.daily/todica-backup` で日次実行する例：

```bash
#!/bin/sh
mkdir -p /var/backups/todica
sqlite3 /var/lib/todica/todica.db ".backup '/var/backups/todica/todica-$(date +%F).db'"
find /var/backups/todica -name 'todica-*.db' -mtime +30 -delete
```

## 8. アップデート手順

```bash
cd /opt/todica
git pull
npm install
npm run build -w domain
npm run build -w server
npm run build -w web
sudo systemctl restart todica
```

サーバ起動時に未適用のマイグレーションは自動適用される。Web の静的ファイルは reverse proxy が即時新版を配信する。

## 9. 別デバイス（LAN）から動作確認する場合

VPS デプロイ前に、同一 LAN 上の別デバイスから本番相当の構成を試したい場合：

- サーバ (`@hono/node-server`) は既定で全インターフェースにバインドするため、ファイアウォールが 3000 を許可していれば LAN 内の他デバイスから繋がる
- Vite dev server は既定で localhost のみバインドする。`npm run dev -w web -- --host` で LAN に公開できる
- `.env` の `VITE_API_BASE_URL` は **別デバイスから見たホストの IP**（`http://192.168.x.x:3000` 等）にする。`localhost` は別デバイスでは自分自身を指してしまう
- WSL2 で開発している場合、Windows ホスト経由で LAN から WSL2 のポートに届けるには PowerShell（管理者）で portproxy を設定する：

  ```powershell
  $wslIp = (wsl hostname -I).Trim().Split()[0]
  netsh interface portproxy add v4tov4 listenport=3000 listenaddress=0.0.0.0 connectport=3000 connectaddress=$wslIp
  netsh interface portproxy add v4tov4 listenport=5173 listenaddress=0.0.0.0 connectport=5173 connectaddress=$wslIp
  ```

## 10. トラブルシューティング

| 症状 | 原因 | 対処 |
|---|---|---|
| `AUTH_TOKEN environment variable is required` で exit | `.env` を読めていない / `AUTH_TOKEN` が空 | `journalctl -u todica` でログ確認、`EnvironmentFile=` のパスと `.env` の権限を確認 |
| ブラウザで開いて画面は出るが API が `401 Unauthorized` | Web 側 `VITE_AUTH_TOKEN` と server 側 `AUTH_TOKEN` の不一致 | 両者を同一値に揃え、`npm run build -w web` を再実行 |
| ブラウザでドメインを開くと API の JSON が出る | nginx の `root` / `location` 設定漏れ、静的ファイル配信が未設定 | nginx の Web 配信側 `location /` 設定を確認 |
| ブラウザで SPA の内部リンクを直接開くと 404 | `try_files ... /index.html` 不在 | 6 章の `location /` の `try_files` を追加 |
| マイグレーションエラーで起動失敗 | `server/drizzle/*.sql` の問題、または DB ファイル破損 | DB ファイルをバックアップし、`drizzle/` の SQL を確認 |
| サーバは LAN 経由で繋がるが Web は繋がらない | Vite dev server を `--host` 無しで起動 | `npm run dev -w web -- --host` で起動 |
