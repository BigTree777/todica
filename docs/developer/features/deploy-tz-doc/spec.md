# 仕様: デプロイ時の TZ 明示をドキュメント化

- 状態: ドラフト
- 関連: [`../../planning/backlog.md`](../../planning/backlog.md) BL-103

## 背景 / 課題

サーバの日次リセット (`maybeRunDailyReset`) はリセット時刻 (`dayBoundaryTime`, 既定 `04:00`) をサーバプロセスのローカル TZ で解釈する (`features/reset-time-rework/spec.md`). TZ 解決は `process.env.TZ ?? Intl.DateTimeFormat().resolvedOptions().timeZone` で, 環境変数が無いときは OS の `/etc/localtime` から推定する.

しかし `Intl.DateTimeFormat().resolvedOptions().timeZone` は `/etc/localtime` がシンボリックリンクでない (= 実ファイル) ケースや tzdata 不在のコンテナで `UTC` にフォールバックする. 結果として `date` コマンドが JST を返すサーバでも Node プロセスが TZ を `UTC` と解釈し, `dayBoundaryTime = "04:00"` が UTC 04:00 (= JST 13:00) として扱われてリセットが JST 04:00 で発火しない.

実害: `04:00` 設定で運用しているサーバで「JST 04:00 を過ぎてもタスク繰越とカウンタリセットが走らない」 (= 起動から JST 13:00 まで前日の状態のまま) という挙動が出ている.

現在の `docs/user/deploy-guide.md` / `docs/developer/setup/server.md` / `.env.example` のいずれにも `TZ` の指示は無く, ユーザは自動取得されるものと誤認する.

## ゴール / 非ゴール

### ゴール

- `.env.example` に `TZ` を明示し, 既定値 `Asia/Tokyo` を載せる (個人運用前提).
- `docs/user/deploy-guide.md` の環境変数表と systemd unit の例に `TZ` を加える.
- `docs/developer/setup/server.md` の dev 用環境変数表にも `TZ` を加える.
- 起動時の `[server] resolved timezone: ...` ログの位置と確認方法 (`journalctl -u todica | grep ...`) を deploy-guide.md のトラブルシュートに載せる.

### 非ゴール

- サーバコード本体の改修 (現行の `getServerTimeZone()` 実装は維持).
- 既定 TZ を変える (JST 以外の運用者は `.env` で上書きする).
- DST 対応や multi-TZ UI の追加 (`reset-time-rework/spec.md` の非ゴールを継承).

## 要件

### 機能要件

- **FR-1**: `.env.example` に `TZ=Asia/Tokyo` の 1 行と用途のコメントが存在する.
- **FR-2**: `docs/user/deploy-guide.md` 第 3 章の環境変数表に `TZ` 行が含まれる.
- **FR-3**: `docs/user/deploy-guide.md` の systemd unit 例 (`[Service]` セクション) に `Environment=TZ=Asia/Tokyo` の行が含まれる.
- **FR-4**: `docs/user/deploy-guide.md` のトラブルシューティング表に「リセットが想定時刻に走らない」原因として TZ 未設定が挙がっており, `journalctl -u todica | grep "resolved timezone"` で確認する手順が書かれている.
- **FR-5**: `docs/developer/setup/server.md` の環境変数表に `TZ` 行が含まれる.

### 非機能要件

- 既存 doc test (faq-reset-time / api-base-url-doc-align / no-legacy-auth-refs / onboarding-doc-repair) の green を維持する.
- 新規 doc test を `__tests__/docs/deploy-tz-doc.test.ts` として追加し, FR-1〜FR-5 を grep ベースで検証する.

## 受け入れ基準

```
シナリオ: .env.example に TZ が載っている
  Given .env.example
  When  grep "^TZ=" を実行する
  Then  Asia/Tokyo を値とする 1 行が見つかる
```

```
シナリオ: deploy-guide.md の systemd 例に Environment=TZ がある
  Given docs/user/deploy-guide.md
  When  systemd unit のコードブロックを読む
  Then  [Service] セクションに Environment=TZ=Asia/Tokyo が含まれる
```

```
シナリオ: deploy-guide.md のトラブルシュート表に TZ 未設定が載っている
  Given docs/user/deploy-guide.md のトラブルシューティング表
  When  「リセット」を含む行を探す
  Then  TZ 未設定が原因として挙がり, journalctl での確認手順がある
```

```
シナリオ: setup/server.md の env 表に TZ がある
  Given docs/developer/setup/server.md の環境変数表
  When  TZ 行を探す
  Then  既定値 (system TZ / OS から推定) と用途の説明が書かれている
```

## 未決事項 / 確認待ち

- なし.
