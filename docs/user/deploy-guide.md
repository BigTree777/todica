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
- インターネット越し公開では、デプロイ直後に運用者本人が初期パスワードを設定する

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
| `DATABASE_PATH` | いいえ | `./todica.db` | SQLite ファイルのパス。本番では `/var/lib/todica/todica.db` 等の永続領域へ |
| `PORT` | いいえ | `3000` | リッスンポート |
| `VITE_API_BASE_URL` | Web ビルド時 | - | Web クライアントから叩く API のオリジン。同一ドメイン配信なら空文字でよい（相対パスで叩く） |

パスワードは `.env` に置かない。サーバ起動後、DB が空ならブラウザに初期パスワード設定画面が表示され、登録したパスワードの bcrypt ハッシュが DB に保存される。

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

> **重要**: `VITE_API_BASE_URL` は **ビルド時に埋め込まれる**ため、値を変えたら必ず `npm run build -w web` を再実行する。
> 認証トークンはビルド時に埋め込まれない。ユーザがアプリ起動時に LoginView でパスワードを入力し、`POST /api/v1/login` で取得した opaque token を `localStorage` (Web) / `@capacitor/preferences` (Android) に保存する形になっている。

同一ドメイン配信（後述の reverse proxy 構成）なら `VITE_API_BASE_URL=""` でよい。Web の JS は相対パスで `/api/v1/*` を叩く。

## 6. HTTPS / nginx で配信する

サーバ自体は HTTP で動作する。HTTPS は nginx で終端し、同一ドメインで Web 静的ファイルと API を配信する。

`/etc/nginx/sites-available/todica`：

```nginx
# ===== HTTP → HTTPS リダイレクト =====
server {
    listen 80;
    listen [::]:80;
    server_name todica.example.com;

    # Let's Encrypt の HTTP-01 チャレンジ用 (certbot --webroot を使う場合のみ必要)
    # certbot --nginx で運用しているなら不要だが入れておくと事故りにくい
    location /.well-known/acme-challenge/ {
        root /var/www/certbot;
    }

    # それ以外はすべて HTTPS へ恒久リダイレクト
    location / {
        return 301 https://$host$request_uri;
    }
}

# ===== HTTPS 本体 =====
server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name todica.example.com;

    ssl_certificate     /etc/letsencrypt/live/todica.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/todica.example.com/privkey.pem;

    # Web 静的ファイル
    root /opt/todica/web/dist;
    index index.html;

    # ----- セキュリティヘッダ -----
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header X-Content-Type-Options    "nosniff"                              always;
    add_header X-Frame-Options           "SAMEORIGIN"                           always;
    add_header Referrer-Policy           "strict-origin-when-cross-origin"      always;

    # ----- location 群 (具体 → 抽象の順) -----

    # 1) 隠しファイル (.env / .git/ 等) を一括拒否
    location ~ /\.(env|git|svn|ht) {
        deny all;
        return 404;
    }

    # 2) ヘルスチェック (完全一致 + ログ抑制)
    location = /healthz {
        access_log off;
        proxy_pass http://127.0.0.1:3000;
    }

    # 3) API は Node プロセスへプロキシ
    location /api/ {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # 4) 静的アセット: 長期キャッシュ + 無ければ即 404 (index.html に化けるのを防ぐ)
    location ~* \.(css|js|jpg|jpeg|png|gif|svg|ico|woff2?|map)$ {
        try_files $uri =404;
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    # 5) SPA フォールバック: それ以外は index.html を返してクライアント側ルータに委ねる
    location / {
        try_files $uri $uri/ /index.html;
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

> **重要:** サーバ起動後、最初に公開URLへ到達した人が初期パスワードを設定できます。デプロイ完了直後に運用者本人がただちにブラウザで開き、初期設定を完了してください。

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
| `/api/v1/login` が `412 INITIAL_SETUP_REQUIRED` | DB にパスワードが未登録 | ブラウザで公開URLを開き、初期パスワードを設定 |
| ブラウザで開いて画面は出るが API が `401 Unauthorized` | LoginView でのパスワード入力が未完了 / token 期限切れ | LoginView でパスワードを入力。期限切れ token は自動破棄され LoginView に戻る |
| ブラウザでドメインを開くと API の JSON が出る | nginx の `root` / `location` 設定漏れ、静的ファイル配信が未設定 | nginx の Web 配信側 `location /` 設定を確認 |
| ブラウザで SPA の内部リンクを直接開くと 404 | `try_files ... /index.html` 不在 | 6 章の `location /` の `try_files` を追加 |
| マイグレーションエラーで起動失敗 | `server/drizzle/*.sql` の問題、または DB ファイル破損 | DB ファイルをバックアップし、`drizzle/` の SQL を確認 |
| サーバは LAN 経由で繋がるが Web は繋がらない | Vite dev server を `--host` 無しで起動 | `npm run dev -w web -- --host` で起動 |
