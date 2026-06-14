# タスク: SettingsView 旧 authToken 入力 UI の削除 (BL-074 dead path 整理)

> [`plan.md`](plan.md) を実行可能な単位に分解する。完了したらチェックを入れる。

## AC ↔ Step 対応マップ

| AC (spec.md) | 内容 | 対応する Step |
| --- | --- | --- |
| AC-1 | `serverUrl` / `authToken` / `onSaveServer` の identifier が `web/src/ui/settings-view/` 配下に存在しない | Step 2, Step 7 |
| AC-2 | 「サーバ URL 入力欄」「認証トークン入力欄」「保存」ボタンの DOM 要素が消えている | Step 3, Step 8 |
| AC-3 | `grep -rn "settings-auth-token\|settings-server-url" web/` で 0 hit | Step 3, Step 7 |
| AC-4 | 既存テスト (境界時刻 / ログアウト / モード切替) は全件 green を維持 | Step 6, Step 8 |
| AC-5 | 旧 test 2 件 (実体は 3 件: dead path 検証 2 + 省略時影響なし 1) は削除済み | Step 5, Step 7 |
| AC-6 | typecheck / lint 0 エラー | Step 9 |

## 実装 (TDD は「削除」フェーズに読み替える)

> 本 BL は dead path 削除であり、新規追加コードはない。TDD サイクルの解釈は次のとおり:
> - 「失敗するテスト」= 「dead path 検証テストを削除して、Props を持たない型と整合する状態を作る」
> - 「通す」= 「実装側 (`settings-view.tsx`) から dead path を取り除き typecheck を通す」
> - 「リファクタ」= 「未使用 import / コメントの軽微な整理」

### Step 1: 事前調査 (5 分)

- [x] `web/src/ui/settings-view/settings-view.tsx` 現行内容の最終確認 (削除対象の行が plan.md §設計詳細と一致しているか)
- [x] `web/__tests__/settings-view.test.tsx` の `describe("SettingsView サーバ接続設定セクション (BL-019 AC-AND-005)")` ブロックの開始行・終了行を再確認 (リポジトリの差分で前後している可能性)
- [x] `grep -rn "SettingsView" web/src/` で `<SettingsView>` の全呼び出し箇所を列挙
- [x] `web/src/main.tsx` の `<SettingsView ... />` 呼び出しで `serverUrl` / `authToken` / `onSaveServer` を渡している箇所が無いことを目視確認

### Step 2: Props 型から dead フィールドを削除

- [x] `web/src/ui/settings-view/settings-view.tsx` の `SettingsViewProps` 型から以下を削除
  - [x] `serverUrl?: string;`
  - [x] `authToken?: string;`
  - [x] `onSaveServer?: (serverUrl: string, authToken: string) => void;`

### Step 3: 関数本体から dead state / dead JSX を削除

- [x] props 分割代入から `serverUrl: initialServerUrl,` / `authToken: initialAuthToken,` / `onSaveServer,` を削除
- [x] useState 2 行 (`serverUrlValue` / `authTokenValue`) と直上コメント `// サーバ接続設定 (BL-019)` を削除
- [x] JSX の `{onSaveServer !== undefined && (...)}` セクション全体を削除 (内部の `<section aria-label="サーバ接続設定">` / 「サーバ URL」label + input / 「認証トークン」label + input / 「変更を保存」ボタン / `aria-label="サーバ接続設定フォーム"` form を含む)

### Step 4: 残す責務を明示するためのコメント整理 (D-3)

- [x] `settings-view.tsx` ファイル冒頭の docblock コメントから「サーバ接続設定 (BL-019)」言及があれば抜き、責務を「境界時刻 (BL-009) / モード切替 (BL-019 / BL-020) / ログアウト (BL-074)」に絞った記述に整える (機能挙動に影響しない範囲の微修正)
- [x] Props 型直前にコメントがあれば、上記責務 3 つを並列に書く

### Step 5: テストファイルから dead path 検証 describe を削除

- [x] `web/__tests__/settings-view.test.tsx` のファイル冒頭コメントから「BL-019 で拡張される SettingsView の Props」段落を削除
- [x] `describe("SettingsView サーバ接続設定セクション (BL-019 AC-AND-005)")` ブロック全体を削除
  - [x] `it("AC-AND-005: serverUrl と authToken の Props が渡された場合...")` (dead path 検証 1 件目)
  - [x] `it("AC-AND-005: サーバ URL と認証トークンを編集して...")` (dead path 検証 2 件目)
  - [x] `it("AC-AND-005: serverUrl/authToken/onSaveServer Props が省略された場合でも...")` (省略時影響なし 1 件)
- [x] 削除によって不要になる import (`userEvent` がこの describe でしか使われていない場合など) を確認 — 他の describe で使われていれば残す

## テスト

### Step 6: 残存テストの green 確認

- [x] `npx vitest run web/__tests__/settings-view.test.tsx` をリポジトリルートから実行し全件 green を確認 (AC-4)
- [x] `npx vitest run` (web 配下全体) を実行し全件 green を確認 (AC-4 補強)
- [x] e2e の `e2e/settings.spec.ts` を可能なら実行し dayBoundaryTime 更新が green であることを確認 (BL-026 由来。任意)

### Step 7: 削除完了の grep 検証

- [x] `grep -rn "serverUrl\|authToken\|onSaveServer" web/src/ui/settings-view/` が 0 hit (AC-1)
- [x] `grep -rn "settings-auth-token\|settings-server-url" web/` が 0 hit (AC-3)
- [x] `grep -n "AC-AND-005\|サーバ接続設定セクション" web/__tests__/settings-view.test.tsx` が 0 hit (AC-5)
- [x] `grep -rn "サーバ接続設定" web/src/ui/settings-view/` が 0 hit (AC-1 補助)

### Step 8: DOM 観察による消滅確認

- [x] (手動 smoke 任意) `npm run dev -w web` で起動し `/settings` を開き、サーバ URL / 認証トークン入力欄 / 「変更を保存」ボタン / `aria-label="サーバ接続設定"` セクションが DOM に存在しないことをブラウザの DevTools で確認 (AC-2)

### Step 9: 型・lint クリーン確認

- [x] web ワークスペースで TypeScript 型検査 (`tsc --noEmit` 相当) を実行し 0 エラー (AC-6)
- [x] web ワークスペースで lint を実行し 0 エラー (AC-6)
- [x] 特に「未使用変数」「未使用 import」警告が出ていないことを確認

## ドキュメント

- [x] `docs/developer/planning/backlog.md` の BL-075 行の状態を Todo → Doing → Done に更新 (PR マージ時)
- [x] `docs/developer/features/settings-view-dead-path-cleanup/spec.md` の状態をドラフト → 確定に更新 (auditor 承認後)
- [x] 既存の `features/settings-day-boundary/` には触らない (BL-009 自体の仕様を否定するものではないため)
- [x] 既存の `features/android-server-mode/` には触らない (BL-019 の歴史的経緯として残す)

## 仕上げ

- [x] 受け入れ基準 AC-1〜AC-6 (spec.md) を全て満たすことを再確認
- [x] commit message は Conventional Commits の `refactor(settings-view): ...` で日本語 description
   - 例: `refactor(settings-view): BL-075 旧 authToken 入力 UI の dead path を削除`
- [x] 専用ブランチ (例: `feature/settings-view-dead-path-cleanup`) で作業し、Pull Request 経由で main にマージ
- [x] auditor サブエージェントに監査依頼 (仕様適合 / テスト green / typecheck / lint / DOM 消滅の各観点)
- [x] マージ後、ローカル feature ブランチを `git branch -d` で削除
