# タスク: オンボーディングドキュメント整合性修正

> [`plan.md`](plan.md) を実行可能な単位に分解する。完了したらチェックを入れる。

## 実装

- [ ] `README.md` の「セットアップ」節の Node 要件文言を `Node.js 24.x（手元の動作確認バージョン。他バージョンは未検証）` に置き換える
- [ ] `README.md` の「サーバの起動」節を `npm run dev -w server` ベースの dev 起動手順 (起動 → `curl /healthz` まで) に書き換え、prod 起動の詳細は `docs/user/deploy-guide.md` にリンク誘導する
- [ ] `README.md` の「Web クライアントのビルド」節の周辺に「prod 起動には事前に `npm run build -w domain && npm run build -w server` が必要。詳細は deploy-guide.md 4 章を参照」の旨を追記する
- [ ] `CONTRIBUTING.md` の「Node.js 20 以上」を確定文言に置き換える
- [ ] `docs/user/quick-start.md` の Node 要件文言が確定文言と一致するよう調整する (差分があれば短縮形に揃え、箇条書きの `node -v で確認` 注記は残す)
- [ ] `docs/user/deploy-guide.md` 1-2 節の Node 要件文言を確定文言に揃える (本番運用節は無改修)

## テスト

- [ ] 手動動作確認: クリーンな作業ディレクトリで `npm install` 後、README の手順のみで `curl http://localhost:3000/healthz` が `{"status":"ok"}` を返すこと
- [ ] 文字列マッチ確認: `grep -F "Node.js 24.x（手元の動作確認バージョン。他バージョンは未検証）" README.md CONTRIBUTING.md docs/user/quick-start.md docs/user/deploy-guide.md` で 4 ファイルすべてにマッチすること
- [ ] 旧文言不在確認: `grep -E "Node\.js 20( 以上)?" README.md CONTRIBUTING.md docs/user/quick-start.md docs/user/deploy-guide.md` で 0 件であること
- [ ] `npm run typecheck` がエラー 0 で終わること
- [ ] `npm run lint` がエラー 0 で終わること

## ドキュメント

- [ ] 本 BL のスコープ外文書 (`docs/user/deploy-guide.md` の本番運用節 3-11 章 / `docs/developer/setup/server.md`) に差分が入っていないことを `git diff` で確認

## 仕上げ

- [ ] 受け入れ基準 (spec.md の 5 シナリオ) を全て満たすことを確認
- [ ] `auditor` にレビュー依頼
