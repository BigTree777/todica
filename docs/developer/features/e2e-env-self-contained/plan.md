# 設計・実装計画: e2e-env-self-contained

> [`spec.md`](spec.md) の要件を、どう実現するかに落とす。

## 方針概要

`playwright.config.ts` の webServer 2 エントリ（vite dev 5173 / vite build + preview 4173）に
`env: { VITE_API_BASE_URL: "http://localhost:3000" }` を追加し、e2e が起動する web を
`.env` 非依存にする。server 側 webServer（3000）が `DATABASE_PATH` / `TEST_NOW` を
明示しているのと同じパターンで、e2e に必要な環境をすべて config 内で自己完結させる。

## 影響範囲

| 領域 | 変更内容 |
| --- | --- |
| API | 変更なし |
| DB | 変更なし |
| モジュール | 変更なし（`web/src/bootstrap.ts` のフォールバック仕様は非ゴール） |
| UI | 変更なし |
| e2e 構成 | `playwright.config.ts` の webServer 2 エントリ（port 5173 / 4173）に `env` を追加 |
| CI | workflow の変更なし（既存の playwright job がそのまま green 化する想定） |

## 設計詳細

- 処理フロー:
  - Playwright は webServer の `command` を `env` で指定した環境変数付きで起動する。
  - port 5173: `vite dev` が `VITE_API_BASE_URL=http://localhost:3000` を
    `import.meta.env` としてクライアントに配信する。
  - port 4173: `vite build` が同値をバンドルに焼き込み、`vite preview` が配信する
    （prod build 経路の pwa-prod spec もこれで解消する）。
  - `web/src/bootstrap.ts` は `VITE_API_BASE_URL` が定義済みとなるため
    `""` フォールバックに落ちず、ブラウザの API 呼び出しが `http://localhost:3000` に飛ぶ。
- 例外 / エラー処理: なし（設定値の明示のみで、分岐やエラーパスを追加しない）。

## 重要な決定

- **`.env` 依存の解消先を playwright.config.ts の webServer `env` に限定する**:
  e2e が起動するプロセスの環境は e2e の config が完結して定義すべきであり、
  server 側 webServer が既に採っているパターンと同型。`.env.example` の整備や
  vite proxy の導入は問題の解決に不要なためスコープ外とする。
- **ADR は新設しない**: 既存パターン（webServer の `env` 明示）への追従であり、
  新しいアーキテクチャ判断を含まない。アプリの構成・モジュール境界・データモデルに
  影響しないため、feature 記録（本ディレクトリ）で十分と判断する。

## リスク / 代替案

- リスク: 低（e2e 構成のみの変更）。
  - ローカルの `.env` 値との衝突: webServer の `env` は明示値が優先されるだけで、
    サーバ側ポート 3000 は既に固定前提のため実質的な挙動変化はない。
- 代替案（不採用）:
  - `web/src/bootstrap.ts` のフォールバックを `http://localhost:3000` に変更する:
    Capacitor / native モード等の設計に関わるため触らない（spec の非ゴール）。
  - CI workflow で `.env` を生成する: e2e の前提が config 外に散らばり、
    ローカルのクリーン環境（`.env` 無し）では依然として失敗するため不採用。

## テスト方針

> 全体方針は [`../../quality/test-catalog.md`](../../quality/test-catalog.md)。

- 振る舞いテスト（vitest）は生まれない成果物。新規テストは追加しない。
- 検証は既存の playwright フルスイート（110 spec 規模）をそのまま使う:
  1. ローカルで `.env` を退避した状態でフルスイート実行 → 全 pass（クリーン環境相当の再現）。
  2. `.env` を戻した状態でフルスイート実行 → 全 pass（既存環境への非影響確認）。
  3. PR の実 CI run で 4 job（typecheck / lint / vitest / playwright）すべて green。
- 完了判定は「実 CI run green + auditor による変更の実在確認」で行う。
