# 設計・実装計画: SettingsView 旧 authToken 入力 UI の削除 (BL-074 dead path 整理)

> [`spec.md`](spec.md) の要件を、どう実現するかに落とす。

## 方針概要

機械的な「削除のみ」で完結する作業。Props 型 / useState / JSX セクション / 関連テストブロックを 1 commit で抜き、残存テストが green であること・typecheck と lint が clean であることを最終確認する。

設計上の判断点は「削除した dead path をどこに残すか (deprecated 経由保持か完全削除か)」の 1 点のみで、これは D-1 で「完全削除」を採用する。type alias による段階的削除や `@deprecated` JSDoc コメントは採用しない。

## 影響範囲

| 領域 | 変更内容 |
| --- | --- |
| API | 変更なし (server / OpenAPI には touch しない) |
| DB | 変更なし |
| モジュール (TypeScript 型) | `SettingsViewProps` から `serverUrl?` / `authToken?` / `onSaveServer?` を削除 |
| UI | `SettingsView` から「サーバ接続設定」セクション (input 2 個 + 「変更を保存」ボタン + section 全体) を削除 |
| テスト | `web/__tests__/settings-view.test.tsx` の `SettingsView サーバ接続設定セクション (BL-019 AC-AND-005)` describe ブロック (内テスト 3 件) を削除 |
| 呼び出し側 | `web/src/main.tsx` の `<SettingsView>` 呼び出しを目視確認 (旧 props を渡していないことを確認するだけ。実装上の変更は想定なし) |
| CSS | 触らない (`settings-view.css` の `__section` などのクラスは他セクションでも共用されているため温存) |
| ドキュメント | `features/settings-day-boundary/` は触らない (本 BL は責務絞り込みであり旧 BL の仕様自体を否定するものではない) |

## 設計詳細

### 削除対象の正確な特定

#### `web/src/ui/settings-view/settings-view.tsx` (1 ファイル)

削除対象は以下の 4 ブロック (調査時点の行番号は spec.md §補足参照)。

1. **Props 型のフィールド 3 個**
   - `serverUrl?: string;`
   - `authToken?: string;`
   - `onSaveServer?: (serverUrl: string, authToken: string) => void;`
2. **関数本体冒頭の props 分割代入 3 個**
   - `serverUrl: initialServerUrl,`
   - `authToken: initialAuthToken,`
   - `onSaveServer,`
3. **useState 宣言 2 行 + 直上コメント 1 行**
   - `// サーバ接続設定 (BL-019)`
   - `const [serverUrlValue, setServerUrlValue] = useState(initialServerUrl ?? "");`
   - `const [authTokenValue, setAuthTokenValue] = useState(initialAuthToken ?? "");`
4. **JSX の「サーバ接続設定」section 全体**
   - 開始: `{onSaveServer !== undefined && (`
   - 終了: 対応する `)}`
   - 中身に `<section aria-label="サーバ接続設定">` / 「サーバ URL」「認証トークン」label と input / 「変更を保存」ボタンを含む。

ファイル冒頭の docblock コメントに BL-019 由来の文言が残っていた場合は、機能挙動には影響しない範囲で BL-019 「サーバ接続設定」言及を整理する (`SettingsView` の責務記述から「サーバ接続設定」を抜く程度)。コメントの過剰書き換えは避ける。

#### `web/__tests__/settings-view.test.tsx` (1 ファイル)

削除対象は以下の 2 ブロック。

1. **ファイル冒頭コメント (現行 lines 34-40 付近) の「BL-019 で拡張される SettingsView の Props」段落**
   - 段落単位で削除する。`Vitest`/`SettingsRepository` 等の他の解説は残す。
2. **`describe("SettingsView サーバ接続設定セクション (BL-019 AC-AND-005)")` ブロック (現行 lines 256-349 付近)**
   - ブロック内のテスト 3 件を含めて丸ごと削除する。
     - (a) `it("AC-AND-005: serverUrl と authToken の Props が渡された場合、対応するフィールドに値が表示される", ...)` ← dead path 検証 1 件目
     - (b) `it("AC-AND-005: サーバ URL と認証トークンを編集して「変更を保存」をクリックすると onSaveServer(serverUrl, authToken) が呼ばれる", ...)` ← dead path 検証 2 件目
     - (c) `it("AC-AND-005: serverUrl/authToken/onSaveServer Props が省略された場合でも dayBoundaryTime の表示は正常に動作する", ...)` ← 省略時影響なし確認 1 件 (dead path 削除後は意味を失うので同時に削除)
   - 直前/直後のセクション区切りコメント (`// =====` の罫線) は残してよい。

#### `web/src/main.tsx` (確認のみ)

調査時点で `<SettingsView ... />` 呼び出しは `repository` / `currentMode` / `onSwitchMode` / `onLogout` のみを渡しており、`serverUrl` / `authToken` / `onSaveServer` は渡していない (BL-074 マージ時点で整理済み)。本 BL では「再確認のみ」で変更を加えない。万が一渡している箇所が発見された場合のみ、該当 props を削除する。

### 残す責務 (削らない箇所)

- 境界時刻設定 (BL-009):
  - `repository: SettingsRepository`
  - useQuery / useMutation / `handleSave` / `<form aria-label="設定フォーム">` / `dayBoundaryTime` input / 「保存」ボタン / `<div className="settings-view__current">` / `<div role="alert">`
- モード切替 (BL-019 / BL-020):
  - `currentMode?: "local" | "server"` / `onSwitchMode?: () => void | Promise<void>`
  - `<section aria-label="モード切替">` 一式
- ログアウト (BL-074):
  - `onLogout?: () => void | Promise<void>`
  - `<section aria-label="ログアウト">` 一式

### 処理フロー

実装は単純削除のため、新規の処理フローはない。

### 例外 / エラー処理

新規・変更なし。既存の `PatchConflictError` 系処理は触らない。

## 重要な決定

- **D-1: dead path は完全削除する (deprecated 保持しない)。**
  代替案として「Props を `@deprecated` JSDoc 付きで一時保持し型レベルで残す」「`SettingsViewProps` を Union 型で「server 接続あり版」「なし版」に分ける」などが考えられるが、(a) production の呼び出し側は既に渡していない、(b) 後方互換を保証すべき外部 consumer がいない (内部単一アプリ)、(c) BL-074 で auth 経路が完全に置き換わったため旧 path の再活性化リスクは取りたくない、の 3 点から完全削除を選ぶ。ADR 化するほどの広がりは無いため本 plan 内の決定として記録する。

- **D-2: テストも同じ commit で削除する。**
  Props 型を削った時点で旧 props を渡しているテストは TypeScript エラーになるため、「型修正だけ先行コミット → テスト後追い」は分割しない。1 commit 内で「実装の Props 削除」と「テストの該当 describe 削除」を同時に行う。これは「failing test を残さない」「main を常時 green に保つ」GitHub Flow の前提と整合する。

- **D-3: `SettingsViewProps` の責務記述を「境界時刻 / モード切替 / ログアウト」に絞る方向で型定義 / 関連コメントを更新する。**
  これは BL-074 後の `SettingsView` の責務を将来の読み手 (auditor / 次の実装者) に明示するためのもので、型定義そのものは「フィールドを削るだけ」だが、上部のファイル docblock や Props 型直前のコメントから「サーバ接続設定」言及を抜き、残す責務 3 つを並列に書く。

## 段階分割

1 commit / 1 PR で完結させる。理由:

- 削除のみで他箇所への波及がない。
- Props 型変更とテスト変更を分割すると中間状態で typecheck が red になり、main の green を破るため不可。
- 機能境界 (境界時刻 / モード切替 / ログアウト) は手をつけないため、レビュー時の認知負荷も低い。

## 変更ファイル表

| ファイル | 種別 | 変更内容 |
| --- | --- | --- |
| `web/src/ui/settings-view/settings-view.tsx` | 修正 | Props 型から 3 フィールド削除 + 分割代入から 3 個削除 + useState 2 個削除 + JSX section 1 個削除 + 関連コメント整理 |
| `web/__tests__/settings-view.test.tsx` | 修正 | ファイル冒頭の BL-019 Props 解説段落削除 + `describe("SettingsView サーバ接続設定セクション (BL-019 AC-AND-005)")` ブロック (it × 3) 削除 |
| `web/src/main.tsx` | 確認のみ | `<SettingsView>` 呼び出しが dead props を渡していないことの目視確認 (差分なし想定) |
| `docs/developer/features/settings-view-dead-path-cleanup/spec.md` | 新規 | 本 BL の仕様 |
| `docs/developer/features/settings-view-dead-path-cleanup/plan.md` | 新規 | 本ファイル |
| `docs/developer/features/settings-view-dead-path-cleanup/tasks.md` | 新規 | 本 BL のタスク分解 |
| `docs/developer/planning/backlog.md` の BL-075 行 | 状態更新 | Todo → Doing → Done (完了時) |

## スコープ境界

- **触らないファイル**:
  - `web/src/repositories/settings-repository.ts` (BL-009 の Repository 層)
  - `web/src/ui/setup-view/setup-view.tsx` (BL-074 で URL のみに簡素化済)
  - `web/src/ui/login-view/` (BL-074)
  - `web/src/auth/*` (BL-074 の auth-storage / authed-fetch)
  - `web/src/ui/settings-view/settings-view.css` (CSS は据え置き)
  - server / android / e2e
- **触らない概念**:
  - 境界時刻設定の挙動 (BL-009)
  - モード切替の挙動 (BL-019 / BL-020)
  - ログアウトの挙動 (BL-074)
  - `AUTH_TOKEN` / `VITE_AUTH_TOKEN` 環境変数まわり (BL-074 / BL-076 のスコープ)

## 非機能 / a11y

- a11y は既存の `aria-label="設定値"` / `aria-label="設定フォーム"` / `aria-label="モード切替"` / `aria-label="ログアウト"` を保持。削除されるのは `aria-label="サーバ接続設定"` / `aria-label="サーバ接続設定フォーム"` のみで、これは対応する DOM 要素自体が消えるため後退ではない。
- `NFR-NO-SHADOW` (影禁止) / `NFR-NO-HOVER-TRANSITION` (hover transition 禁止) は CSS に触らないため自動で維持。
- バンドルサイズは微減を期待 (input × 2 / button × 1 / useState × 2 が消える)。明示計測は不要。

## リスク / 代替案

### リスク

1. **テスト削除の取りこぼし**: AC-AND-005 describe ブロックの内部に新規テストが追加されていた場合、それらも巻き込み削除になる。AC-AND-005 という識別子で grep して残骸がないことを最終確認する (AC-5)。
2. **main.tsx で隠れた呼び出し**: 調査時点では渡していないが、`SettingsView` を別ファイルでラップしている箇所があれば見落とす可能性がある。`grep -rn "SettingsView" web/src/` で全呼び出し箇所を洗い出して確認する。
3. **未使用 import / 変数の残骸**: useState / 分割代入を消し切れず未使用警告が出る可能性。typecheck / lint で検出する (AC-6)。

### 代替案 (採用せず)

- **Props を `@deprecated` 付きで一時保持**: D-1 で却下。完全削除を選択。
- **`SettingsViewProps` を「サーバ接続あり」「なし」の Union に分ける**: 過剰設計。production で「あり」側を使う呼び出しが既に無いため Union 化の意義がない。
- **JSX セクションだけ残して props を消す**: 中途半端で再活性化リスクが残り、却下。

## テスト方針

> 全体方針は [`../../quality/test-catalog.md`](../../quality/test-catalog.md)。

- **新規テストは追加しない**。本 BL は「dead path の削除」であり、追加すべき新規挙動が無いため。
- **削除対象テスト** (red 経路: 削除した結果 typecheck が通り、残テストが green になることで完了確認):
  - `web/__tests__/settings-view.test.tsx` の `describe("SettingsView サーバ接続設定セクション (BL-019 AC-AND-005)")` 配下の it × 3。
- **残すテスト** (green を維持):
  - `web/__tests__/settings-view.test.tsx` の境界時刻系 (BL-009 / FR-041 / FR-042) シナリオ。
  - 同ファイル内のモード切替系 (BL-020 AC-LOC-005) シナリオ。
  - 同ファイル内のログアウト系 (BL-074) シナリオがあれば。
- **検証コマンド**:
  - `npx vitest run web/__tests__/settings-view.test.tsx` (リポジトリルートから実行。`web/` から起動すると jsdom が解決されない既知問題があるためルート起動必須。)
  - `npx vitest run` (web 配下全体)
  - typecheck: 該当ワークスペースの `tsc --noEmit` 相当
  - lint: 該当ワークスペースの lint コマンド
- **e2e**: `e2e/settings.spec.ts` (BL-026 由来) は dayBoundaryTime 更新のみを検証しており、本 BL で削除した dead path には touch していないため、green 維持で十分。新規追加は不要。
- **手動 smoke**: 本番ビルドして `/settings` 画面を開き、`<section aria-label="サーバ接続設定">` が DOM に出現しないことを目視確認する (任意)。

## 未決事項

- なし。
