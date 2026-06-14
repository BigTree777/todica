# 仕様: オンボーディングドキュメント整合性修正

- 状態: 確定
- 関連: [`../../planning/backlog.md`](../../planning/backlog.md) の BL-081

## 背景 / 課題

新規 clone から手元動作確認に到達するまでのオンボーディング文書 (`README.md` / `CONTRIBUTING.md` / `docs/user/quick-start.md` / `docs/user/deploy-guide.md`) のあいだに次の不整合がある。

1. **README の「サーバの起動」が事前ビルド前提のコマンドを案内している**。`README.md` は `npm start -w server` を提示するが、`server/package.json` の `start` script は `node --env-file-if-exists=.env server/dist/src/main.js` を実行するため、先に `npm run build -w domain && npm run build -w server` が完了している必要がある。README にはこのビルド手順がないので、README のみに従う読者は初回 clone 直後に `Cannot find module ... server/dist/src/main.js` で失敗する。
2. **Node.js 要件の文言が文書間で食い違っている**。`CONTRIBUTING.md` は「Node.js 20 以上」、`README.md` / `docs/user/quick-start.md` / `docs/user/deploy-guide.md` は「Node.js 24.x（手元の動作確認バージョン）」と書かれている。読者はどちらに従えばよいか判断できない。
3. **README に「Web ビルド」節はあるが、prod 起動時に必要な domain → server ビルドの依存順序が明示されていない**。デプロイガイドには記述があるが、README 単体では把握できない。

この状態を解消し、README の手順だけで `/healthz` 200 OK に到達できるようにする。

## ゴール / 非ゴール

- ゴール:
  - 新規 clone から README の手順のみで手元のサーバを起動し `/healthz` 200 OK を得られる。
  - Node.js 要件の文言が `README.md` / `CONTRIBUTING.md` / `docs/user/quick-start.md` / `docs/user/deploy-guide.md` の 4 文書で完全一致する。
  - README に「prod 起動には domain → server のビルドが必要」という依存順序が明示され、本番運用の詳細は `docs/user/deploy-guide.md` へリンクで誘導される。
- 非ゴール:
  - `docs/user/deploy-guide.md` の本番運用節の改修 (既に正しい記述あり)。
  - `docs/developer/setup/server.md` の本番運用記述の改修 (既に正しい記述あり)。
  - `server/package.json` の `start` script の改名・改修。
  - quick-start.md / deploy-guide.md の章構成変更 (Node 要件の文言を揃える以外は触らない)。
  - Node サポートポリシーそのものの再検討 (24.x という値の妥当性は本 BL のスコープ外)。

## 要件

- 機能要件:
  - README.md の「サーバの起動」節は、手元動作確認用に **dev 起動 (`npm run dev -w server`)** を案内する。
  - README.md は本番運用 (build → `npm start -w server` → systemd 等) の詳細を持たず、`docs/user/deploy-guide.md` へリンクで誘導する。
  - README.md に、prod 起動時には `npm run build -w domain` → `npm run build -w server` の順でビルドが必要である旨を、Web ビルド節の周辺に追記する (リンク先 deploy-guide の章とずれない位置)。
  - `CONTRIBUTING.md` の Node 要件の文言を、他 3 文書と揃った表現に書き換える。
  - `README.md` / `CONTRIBUTING.md` / `docs/user/quick-start.md` / `docs/user/deploy-guide.md` の Node 要件文言は、語順・補足表現も含めて 4 文書で完全一致させる (採用文言は plan.md で確定する)。
- 非機能要件:
  - 文書のみの変更で、`server/package.json` の `start` script や TypeScript / Vite 設定は触らない。
  - `npm run typecheck` / `npm run lint` がエラー 0 のままであること (Markdown 変更のみのため自然に満たされるはずだが、CI で確認する)。

## 受け入れ基準

> 書き方は [`../../quality/acceptance-criteria.md`](../../quality/acceptance-criteria.md) に従う。

```
シナリオ: 新規 clone から README のみで /healthz に到達できる
  Given クリーンな作業ディレクトリと Node.js 24.x がインストールされている
  When  README.md の「セットアップ」「サーバの起動」節の手順を上から順に実行する
  Then  サーバが起動し、別ターミナルで `curl http://localhost:3000/healthz` が `{"status":"ok"}` を返す
  And   `Cannot find module ... server/dist/src/main.js` などのエラーが発生しない
```

```
シナリオ: Node 要件文言が 4 文書で完全一致する
  Given README.md / CONTRIBUTING.md / docs/user/quick-start.md / docs/user/deploy-guide.md
  When  各文書の Node 要件記述を抽出する
  Then  4 文書とも plan.md で確定した同一の文言を含む
  And   「Node.js 20 以上」「Node 20」など他のバージョン表記が残っていない
```

```
シナリオ: README に prod ビルド依存順序が明示されている
  Given README.md
  When  Web ビルド節およびその前後を読む
  Then  「prod (npm start -w server) は事前に `npm run build -w domain` → `npm run build -w server` が必要」という旨が明示されている
  And   本番運用の詳細手順は `docs/user/deploy-guide.md` への相対リンクで誘導されている
```

```
シナリオ: 本 BL のスコープ外文書は無改修である
  Given 変更前の docs/user/deploy-guide.md および docs/developer/setup/server.md (Node 要件文言を除く)
  When  本 BL の変更をマージした後の同ファイルと比較する
  Then  Node 要件の 1 行のみ (deploy-guide.md 側で揃える必要が出た場合) の差分にとどまり、本番運用節 / 章構成は無改修
```

```
シナリオ: typecheck / lint が green を維持する
  Given 本 BL の変更を適用した作業ツリー
  When  `npm run typecheck` および `npm run lint` を実行する
  Then  いずれもエラー 0 で終了する
```

## 未決事項 / 確認待ち

- Node 要件の確定文言: 第一候補は **`Node.js 24.x（手元の動作確認バージョン。他バージョンは未検証。`node -v` で確認）`** (quick-start.md の現行表現に揃える)。README / CONTRIBUTING / deploy-guide は短縮形を使っているが、4 文書を同一文言にする方針なのでこの長い形に統一する。短縮形 (`Node.js 24.x（手元の動作確認バージョン）`) で揃える案は plan.md で検討する。
