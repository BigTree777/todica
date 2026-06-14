# 設計・実装計画: オンボーディングドキュメント整合性修正

> [`spec.md`](spec.md) の要件を、どう実現するかに落とす。

## 方針概要

文書のみの変更で 3 つの不整合を解消する。

1. README の「サーバの起動」を dev 起動 (`npm run dev -w server`) に切り替える。`npm start -w server` (= prod 起動) は事前ビルドが必要なため、README からは削除し、deploy-guide.md へリンクで誘導する。
2. Node 要件の文言を 4 文書で 1 つに統一する。採用文言は **`Node.js 24.x（手元の動作確認バージョン。他バージョンは未検証）`** (quick-start.md ベース、`node -v` 注記は文脈上必要なところのみ残す)。
3. README の Web ビルド節の直前に「prod 起動には domain → server のビルドが必要」という旨を 2〜3 行で追記し、詳細は deploy-guide.md 4 章へリンク誘導する。

実装は不要で、Markdown 編集と CI による typecheck / lint 確認のみ。

## 影響範囲

| 領域 | 変更内容 |
| --- | --- |
| API | なし |
| DB | なし |
| モジュール | なし (コード変更なし) |
| UI | なし |
| ドキュメント | `README.md` / `CONTRIBUTING.md` / `docs/user/quick-start.md` / `docs/user/deploy-guide.md` |

### ファイル単位の変更内容

| ファイル | 変更内容 |
| --- | --- |
| `README.md` | 「セットアップ」の Node 要件文言を確定文言に置換。「サーバの起動」節を `npm start -w server` から `npm run dev -w server` ベースの dev 起動手順に書き換え (`/healthz` 確認まで含める)。「Web クライアントのビルド」節の直前または直後に「prod 起動には domain → server のビルドが必要。本番運用の詳細は [`docs/user/deploy-guide.md`](docs/user/deploy-guide.md) を参照」の追記を入れる。 |
| `CONTRIBUTING.md` | 「Node.js 20 以上をインストールしてから」を確定文言に置換。 |
| `docs/user/quick-start.md` | 既存の Node 要件文言を確定文言に揃える (差分があれば調整、すでに一致していれば無編集)。 |
| `docs/user/deploy-guide.md` | 1-2 節の Node 要件文言を確定文言に揃える (本番運用節は無改修)。 |

## 設計詳細

- データモデル: なし
- 処理フロー: なし
- 例外 / エラー処理: なし

### 確定する Node 要件文言

```
Node.js 24.x（手元の動作確認バージョン。他バージョンは未検証）
```

- 短縮形を採用し、`node -v で確認` の補足は quick-start.md の「前提」リストでのみ残す。README / CONTRIBUTING / deploy-guide では本文の流れを崩さないようにこの短縮形に揃える。
- quick-start.md の現行表現は `Node.js 24.x（手元の動作確認バージョン。他バージョンは未検証。`node -v` で確認）` だが、リスト項目固有の `node -v` 注記は箇条書きの中だけに留め、4 文書共通のコア文言は上記短縮形にする。
- マッチ判定は spec.md の受け入れ基準シナリオ「Node 要件文言が 4 文書で完全一致する」で `Node.js 24.x（手元の動作確認バージョン。他バージョンは未検証）` の文字列を 4 文書すべてが含むことで行う。

### README の dev 起動節 (案)

```markdown
## サーバの起動

手元動作確認用に dev 起動する。

\`\`\`bash
npm run dev -w server
\`\`\`

`Todica server listening on http://localhost:3000` と表示されたら、別ターミナルで動作確認:

\`\`\`bash
curl http://localhost:3000/healthz
# → {"status":"ok"}
\`\`\`

認証はアプリ内ログイン (`POST /api/v1/login`) で行う。Web UI を開くと初期パスワード設定画面が表示され、設定成功時にセッショントークンが発行される。

本番運用 (`npm start -w server` での prod 起動、systemd 常駐、HTTPS 終端) は [`docs/user/deploy-guide.md`](docs/user/deploy-guide.md) を参照。
```

### README の Web ビルド節周辺の追記 (案)

```markdown
## Web クライアントのビルド

\`\`\`bash
npm run build -w web
\`\`\`

> prod 起動 (`npm start -w server`) する場合は、事前に `npm run build -w domain && npm run build -w server` でサーバ側のビルドが必要。詳細は [`docs/user/deploy-guide.md`](docs/user/deploy-guide.md) の「4. サーバをビルド・起動する」を参照。
```

## 重要な決定

- README は手元動作確認向けに dev 起動 (`npm run dev -w server`) を案内し、prod 起動 (`npm start -w server`) は deploy-guide.md にリンクで誘導する。README に prod 起動の完全な手順を書き直す案は採らない (deploy-guide.md と重複しメンテナンス負荷が上がるため)。
- Node 要件文言は短縮形 `Node.js 24.x（手元の動作確認バージョン。他バージョンは未検証）` に統一する。`node -v で確認` の補足は quick-start.md の「前提」箇条書きでのみ残す (README / CONTRIBUTING の本文に入れると流れが切れるため)。
- ADR は起こさない (文書整合性の修正であり、アーキテクチャ判断ではない)。

## リスク / 代替案

- リスク: quick-start.md / deploy-guide.md の Node 要件文言を 1 ヶ所だけ書き換えると、周辺の語尾 (「インストール」「動作確認」など) と接続が悪くなる可能性がある。実装フェーズで前後 1 文の調整が必要になる場合、修正は最小限に留める。
- 代替案 A: README に dev / prod の両方の手順を併記する → 却下。情報過多で「README だけ読めば動く」状態を壊す。
- 代替案 B: `server/package.json` の `start` を `dev` 相当に変える → 却下。本番運用が壊れる。BL のスコープ外。
- 代替案 C: Node 要件を短縮せず `node -v で確認` を含む長い形に揃える → 採用しない。README / CONTRIBUTING の本文に箇条書き的な注記が混ざるため。

## テスト方針

> 全体方針は [`../../quality/test-catalog.md`](../../quality/test-catalog.md)。

文書のみの変更のため、自動テストではなく以下の確認で受け入れ基準を満たすかを判定する。

- **手動動作確認**: クリーンな作業ディレクトリ (もしくは `git stash` でビルド成果物を退避した状態) で `npm install` 後、README の「セットアップ」「サーバの起動」節のコマンドのみを実行し、`curl http://localhost:3000/healthz` が `{"status":"ok"}` を返すこと。
- **文字列マッチ確認**: `grep -F "Node.js 24.x（手元の動作確認バージョン。他バージョンは未検証）" README.md CONTRIBUTING.md docs/user/quick-start.md docs/user/deploy-guide.md` で 4 ファイルすべてにマッチすること。あわせて `grep -E "Node\.js 20( 以上)?" README.md CONTRIBUTING.md docs/user/quick-start.md docs/user/deploy-guide.md` で 0 件であること。
- **CI 確認**: `npm run typecheck` / `npm run lint` がエラー 0 で終わること (文書のみの変更だが念のため)。
- **目視レビュー**: README に「prod 起動には domain → server のビルドが必要」「本番運用は deploy-guide.md 参照」が明示されていること。deploy-guide.md / setup/server.md の本番運用節に差分が入っていないこと。
