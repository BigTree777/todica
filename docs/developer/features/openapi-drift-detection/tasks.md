# タスク: OpenAPI ドリフト検出機構

> [`plan.md`](plan.md) を実行可能な単位に分解する。完了したらチェックを入れる。

## 依存追加

- [ ] ルート `package.json` の devDependencies に `js-yaml` と `@types/js-yaml` を追加する（D-6）。

## 既存ドリフトの解消（openapi を実装に整合 / D-4）

- [ ] `architecture/api/openapi.yaml` に `GET /healthz` を `x-internal: true` 付きで追加する。
- [ ] `architecture/api/openapi.yaml` に `POST /trash/{id}/restore` を追加する。
- [ ] `architecture/api/openapi.yaml` から `/tasks/{id}/restore`・`/projects/{id}/restore`・
      `/routines/{id}/restore` を削除する。
- [ ] `architecture/api/openapi.yaml` 冒頭（または `architecture/api/overview.md`）に
      `x-internal: true` 規約を明文化する（FR-6）。

## 検出ロジック実装（テスト内ヘルパ）

- [ ] openapi.yaml をパースして (path, method) 集合を抽出するヘルパを実装する（FR-1）。
- [ ] マウント prefix の明示的対応表を定義し, `app.ts` のマウントと相互検証するヘルパを実装する（D-2）。
- [ ] ルータ / app.ts から `router.<method>` / `app.<method>` の path を正規表現抽出するヘルパを実装する（D-1）。
- [ ] 正規化関数（`:p`→`{p}` / `/api/v1` 除去 / method 小文字 / 末尾スラッシュ除去）を実装する（FR-3）。
- [ ] リテラル以外の path 引数を検出する sentinel を実装する（D-3）。
- [ ] 双方向差集合を算出する純粋関数を切り出す（FR-4 / テスト方針）。

## テスト

- [ ] `__tests__/structure/openapi-drift.test.ts` を作成する（D-5）。
- [ ] AC-1: 整合状態で双方向差分が空（green）。
- [ ] AC-2: 実装にハンドラ追加・openapi 未更新で「実装だけにある」に出て red。
- [ ] AC-3: openapi に endpoint 追加・実装未追加で「openapi だけにある」に出て red。
- [ ] AC-4: `:id` ↔ `{id}` の正規化で偽陽性が出ない。
- [ ] AC-5: `/api/v1` の有無で偽陽性が出ない。
- [ ] AC-6: `x-internal` でも実装存在が要求される。
- [ ] AC-7: 条件付きマウント（routines / test/clock）も検証対象。
- [ ] AC-8: 既存ドリフト 5 件解消後に全体が green。

## ドキュメント

- [x] 復元 endpoint の `/trash` 一本化は **ドリフト解消であり ADR を新設しない**ことを確定済み（D-4）。
      判断根拠は spec.md「ドリフト解消の方向と扱い」に記述済み。`docs/developer/adr/` への追加は行わない。
- [ ] `architecture/api/overview.md` §8 に検出機構への参照を追記する（必要時）。

## 仕上げ

- [ ] 受け入れ基準（spec.md AC-1〜AC-8）を全て満たすことを確認する。
- [ ] ルートから `npx vitest run` で既存テスト全件 green / typecheck / lint 0 を確認する。
- [ ] レビュー依頼（auditor）。
