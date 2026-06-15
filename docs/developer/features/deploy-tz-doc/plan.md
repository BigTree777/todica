# 設計・実装計画: デプロイ時の TZ 明示をドキュメント化

> [`spec.md`](spec.md) の要件を, どう実現するかに落とす.

## 方針概要

サーバコード (`server/src/use-cases/daily-reset.ts` の `getServerTimeZone()`) は無改修. ドキュメント 3 ファイル (`.env.example` / `docs/user/deploy-guide.md` / `docs/developer/setup/server.md`) に `TZ` を明示する追記のみで FR-1〜FR-5 を満たす. 検証は grep ベースの doc test 1 ファイル.

## 影響範囲

| 領域 | 変更内容 |
| --- | --- |
| API | 変更なし |
| DB | 変更なし |
| モジュール | 変更なし (`getServerTimeZone()` の挙動は維持) |
| ドキュメント | `.env.example` / `docs/user/deploy-guide.md` / `docs/developer/setup/server.md` に追記 |
| テスト | `__tests__/docs/deploy-tz-doc.test.ts` 新設 |

## 設計詳細

### `.env.example`

末尾に以下を追記:

```env
# サーバプロセスのタイムゾーン (IANA TZ name).
# 日次リセットは Node が解決した TZ で dayBoundaryTime (HH:MM) を解釈する.
# /etc/localtime がシンボリックリンクでない環境では Node が UTC にフォールバック
# することがあるため, 本番では明示推奨.
TZ=Asia/Tokyo
```

### `docs/user/deploy-guide.md`

- 第 3 章の環境変数表に行を追加:
  | `TZ` | 推奨 | (OS から推定) | サーバプロセスの IANA タイムゾーン. 日次リセットの時刻解釈に使う. 既定で OS の `/etc/localtime` から推定するが, シンボリックリンクでない環境では `UTC` にフォールバックするため明示推奨. JST 運用なら `Asia/Tokyo` |
- 第 4 章 systemd unit の `[Service]` セクションに `Environment=TZ=Asia/Tokyo` を 1 行追加.
- 第 11 章トラブルシューティング表に行を追加:
  - 症状: `dayBoundaryTime` を過ぎてもリセットが走らない (`/today` を開いても前日の未完了が今日に繰越されない / 完了数が 0 に戻らない)
  - 原因: Node プロセスの TZ が UTC のまま (`/etc/localtime` がシンボリックリンクでない等)
  - 対処: `journalctl -u todica | grep "resolved timezone"` で Node が解決した TZ を確認. UTC 等になっていれば `.env` または systemd unit に `TZ=Asia/Tokyo` を追加して `sudo systemctl restart todica`

### `docs/developer/setup/server.md`

第 2 章の環境変数表に行を追加:
- `TZ` | (OS から推定) | サーバプロセスの IANA タイムゾーン. 日次リセットの時刻解釈に使う. dev は手元 OS 設定で十分だが, `/etc/localtime` がシンボリックリンクでない環境では `UTC` にフォールバックするため明示推奨 (例: `Asia/Tokyo`)

### `__tests__/docs/deploy-tz-doc.test.ts`

`faq-reset-time.test.ts` と同じ素朴な grep スタイル:

- `.env.example`: `^TZ=Asia/Tokyo$` を含む.
- `docs/user/deploy-guide.md`:
  - env 表に `| \`TZ\` |` で始まる行がある.
  - systemd 例に `Environment=TZ=Asia/Tokyo` がある.
  - トラブルシュート表に `resolved timezone` への参照がある.
- `docs/developer/setup/server.md`: env 表に `| \`TZ\` |` で始まる行がある.

## 重要な決定

- **既定 TZ は `Asia/Tokyo`**: 個人運用 + 開発者 / 既存 docs の前提が JST のため. 海外運用者は `.env` で上書きする想定.
- **コード改修はしない**: `getServerTimeZone()` のフォールバックロジックは現状で十分機能する (TZ env を明示すれば OS 状態に依存しない). 強制 throw 等の挙動変更は別 BL.
- **dev 用 setup/server.md にも TZ を載せる**: dev 環境でも /etc/localtime が UTC リンクの WSL2 / Docker などで同じ症状が出るため.

## リスク / 代替案

- リスク: TZ を明示しない既存サーバは挙動変わらず (= 既に踏んでいる場合は手動修正が必要). ドキュメントだけでは自動修復できない.
- 代替案 1: `main.ts` で `process.env.TZ` が未設定なら `Asia/Tokyo` を既定にセット. 採用しない (海外運用者の挙動を勝手に変える / 既定値を選ぶ責任を docs に閉じる方が薄い).
- 代替案 2: `getServerTimeZone()` が `UTC` を返したときに警告ログを出す. 採用しない (本 BL のスコープから外す. 別 BL で扱うなら検討).

## テスト方針

- doc test 1 ファイルで FR-1〜FR-5 を grep ベース検証.
- 既存テスト全件 green を維持 (改修しないため退行リスクは低い).
- 手動確認 (本番サーバ): `.env` に `TZ=Asia/Tokyo` を追記し `sudo systemctl restart todica` → `journalctl -u todica | grep "resolved timezone"` で `Asia/Tokyo` を確認 → JST 04:00 をまたぐタイミングで `/today` を開いて未完了が翌日に繰越されることを確認.
