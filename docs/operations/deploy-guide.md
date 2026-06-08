# デプロイガイド

## 環境変数

| 変数名 | 必須 | デフォルト | 説明 |
|--------|------|-----------|------|
| AUTH_TOKEN | はい | - | Bearer 認証トークン。未設定だとサーバ起動失敗 |
| DATABASE_PATH | いいえ | ./todica.db | SQLite ファイルのパス |
| PORT | いいえ | 3000 | リッスンポート番号 |

## 起動手順

```bash
cd server
AUTH_TOKEN=your-secret-token DATABASE_PATH=/data/todica.db npm start
```

## HTTPS 設定（reverse proxy 前提）

サーバ自体は HTTP で動作します。HTTPS は nginx / caddy などの reverse proxy で終端してください。

### nginx 設定例

```nginx
server {
  listen 443 ssl;
  server_name todica.example.com;
  ssl_certificate /path/to/cert.pem;
  ssl_certificate_key /path/to/key.pem;

  location / {
    proxy_pass http://localhost:3000;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
  }
}
```

### Caddy 設定例（自動 HTTPS）

```caddyfile
todica.example.com {
  reverse_proxy localhost:3000
}
```
