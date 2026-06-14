# 仕様: SettingsView 旧 authToken 入力 UI の削除 (BL-074 dead path 整理)

- 状態: ドラフト
- 関連: [`../../planning/backlog.md`](../../planning/backlog.md) の BL-075
- 前提依存: BL-074 (アプリ内パスワードログイン導入) / BL-019 (Android サーバモード) / BL-009 (境界時刻設定)

## 背景 / 課題

BL-019 (Android サーバモード) で `SettingsView` に「サーバ接続設定」セクションを追加し、`serverUrl?` / `authToken?` props と `onSaveServer?` コールバックで「サーバ URL」「認証トークン」の編集・保存 UI を提供していた。

その後 BL-074 (アプリ内パスワードログイン導入) で auth フロー全体を再編し、

- 認証トークンの取り扱いは `LoginView` + opaque session token (server 側 sessions テーブル) に一本化
- 起動時のサーバ接続情報入力は `SetupView` の「URL のみ」フォームに簡素化
- `SettingsView` の責務は「境界時刻 / ローカル・サーバ切替 / ログアウト」に再定義

された。結果として `SettingsView` の `serverUrl?` / `authToken?` / `onSaveServer?` props と関連 useState / 入力欄 / 「変更を保存」ボタン、および JSX セクション `<section aria-label="サーバ接続設定">` 一式が dead path として残存している。

`web/src/main.tsx` の `<SettingsView>` 呼び出し箇所では既にこれら 3 つの props は渡されていない (production では `onSaveServer === undefined` で非表示) ため実害は無いが、`web/__tests__/settings-view.test.tsx` の dead path 検証テスト 2 件 (現行行範囲: lines 256-349 付近、`describe("SettingsView サーバ接続設定セクション (BL-019 AC-AND-005)")` ブロック) が dead path の存在を保持してしまっており、

- 削除すべき UI の維持コストを発生させ続けている
- BL-074 で確定した「`SettingsView` は境界時刻 / モード切替 / ログアウトのみ」という責務を曖昧にする
- 認証トークンを password 入力欄として平文編集できる UI 経路が型上残り続け、誤ってどこかから `onSaveServer` を渡すと再活性化する

という問題がある。本機能では dead path 一式を機械的に削除し、`SettingsView` の API surface を BL-074 後の責務に揃える。

## ゴール / 非ゴール

- ゴール:
  - `SettingsView` から旧 `serverUrl?` / `authToken?` / `onSaveServer?` props と、それに紐づく `useState` / 入力欄 / 「変更を保存」ボタン / `<section aria-label="サーバ接続設定">` セクションを完全削除する。
  - `web/__tests__/settings-view.test.tsx` の dead path 検証テスト 2 件 (AC-AND-005 関連の 2 件) を削除する。AC-AND-005 後段の「省略時の影響なし」確認テストも併せて整理する。
  - `SettingsView` の責務を「境界時刻 (BL-009) / ローカル・サーバ切替 (BL-019・BL-020) / ログアウト (BL-074)」の 3 点に明示的に絞り込む。
- 非ゴール:
  - 境界時刻設定 (BL-009) の挙動・型・テストには触れない。
  - ローカル/サーバ切替 (BL-019 / BL-020) の `currentMode` / `onSwitchMode` props および関連 JSX には触れない。
  - ログアウト (BL-074) の `onLogout` prop および関連 JSX には触れない。
  - `LoginView` / `SetupView` / `auth-storage` / repository 層には触れない。
  - `web/src/main.tsx` の SettingsView 以外の箇所 (Capacitor Preferences の `authToken` キー操作など) には触れない。
  - CSS (`settings-view.css`) のクラス整理は本 BL のスコープ外 (見た目の崩れを生まないなら据え置きでよい)。
  - サーバ / Web 双方の認証経路は BL-074 / BL-076 の責務であり、本 BL の対象外。

## 要件

### 機能要件

- FR-1: `SettingsViewProps` 型から次の 3 プロパティを削除する。
  - `serverUrl?: string`
  - `authToken?: string`
  - `onSaveServer?: (serverUrl: string, authToken: string) => void`
- FR-2: `SettingsView` 実装本体から、上記 props に対応する `useState` (`serverUrlValue` / `authTokenValue` および各 setter) を削除する。
- FR-3: `SettingsView` の JSX から「サーバ接続設定」セクション (`<section aria-label="サーバ接続設定">` 以下、`id="settings-server-url"` の input / `id="settings-auth-token"` の input / 「変更を保存」ボタンを含む全体) を削除する。
- FR-4: `web/__tests__/settings-view.test.tsx` の `describe("SettingsView サーバ接続設定セクション (BL-019 AC-AND-005)")` ブロック (現行 lines 256-349 付近) を丸ごと削除する。これにより dead path を保持する 2 件のシナリオテスト (AC-AND-005 の 2 件) と、後続の「省略時影響なし」確認テスト 1 件 (合計 3 件) が削除される。
  - **AC-1〜AC-6 で「dead path 検証 test 2 件の削除」と呼んでいるのはこの 3 件全体のことを指す**: spec / backlog の文面上「2 件」と表現してきたが、内訳は「dead path の存在を直接検証する 2 件」+「省略時の互換動作を検証する 1 件」であり、後者も dead path 削除後は意味を失うため同時に削除する。
- FR-5: `SettingsView` 内部に残る import / 変数 / コメント中の `BL-019` 由来の「サーバ接続設定」言及で、削除によって参照先を失うものを整理する (機能挙動に影響しないコメントの軽微な掃除に留め、`BL-009` / `BL-018` / `BL-020` / `BL-074` 由来のコメントには触れない)。
- FR-6: `web/src/main.tsx` の `<SettingsView ... />` 呼び出し箇所が `serverUrl` / `authToken` / `onSaveServer` のいずれも渡していないことを目視確認する (既に渡していない想定。万一渡している箇所が見つかった場合のみ削除する)。

### 非機能要件

- NFR-1: 境界時刻設定 (BL-009) / ログアウト (BL-074) / モード切替 (BL-019 / BL-020) の既存テストは全件 green を維持する。
- NFR-2: typecheck / lint が 0 エラーで通る。
- NFR-3: 既存の a11y 設計 (`aria-label` / role) は触らない。今回削除する `aria-label="サーバ接続設定"` および同フォームの `aria-label="サーバ接続設定フォーム"` は削除対象なので消えるが、これは UI 自体の削除に伴うものでアクセシビリティ後退ではない。
- NFR-4: `NFR-NO-SHADOW` (影禁止) / `NFR-NO-HOVER-TRANSITION` (hover transition 禁止) を維持する。本 BL は DOM 要素の削除のみで CSS には触れないため自動で満たされる。
- NFR-5: ビルド成果物のサイズが本 BL によって増加しないこと (削除のみのため減少が期待される)。明示的な計測は不要。

## 受け入れ基準

> 書き方は [`../../quality/acceptance-criteria.md`](../../quality/acceptance-criteria.md) に従う。

```
シナリオ: AC-1 dead path identifier の消滅
  Given BL-075 の修正が main にマージされた状態
  When  `grep -rn "serverUrl\|authToken\|onSaveServer" web/src/ui/settings-view/` を実行する
  Then  該当する識別子は 1 件も hit しない
   And  (補助確認) `grep -rn "サーバ接続設定" web/src/ui/settings-view/` も 0 hit である
```

```
シナリオ: AC-2 サーバ接続設定 DOM の消滅
  Given `<SettingsView repository={...} onSaveServer={fn} serverUrl="x" authToken="y" />` のように
        旧 props を仮に渡しても (= 型エラーは発生する想定)、それを無視してレンダリングした場合
  When  レンダリング結果の DOM を観察する
  Then  「サーバ URL」「認証トークン」のラベルを持つ input 要素は存在しない
   And  「変更を保存」というアクセシブル名のボタンは存在しない
   And  `<section aria-label="サーバ接続設定">` も存在しない
```

```
シナリオ: AC-3 識別子 ID の消滅
  Given BL-075 の修正が main にマージされた状態
  When  `grep -rn "settings-auth-token\|settings-server-url" web/` を実行する
  Then  hit 件数は 0 である
```

```
シナリオ: AC-4 残存テストの green 維持
  Given BL-075 の修正が main にマージされた状態
  When  `npx vitest run web/__tests__/settings-view.test.tsx` を実行する
  Then  全てのテストが green で終了する
   And  境界時刻設定 (BL-009) / ログアウト (BL-074) / モード切替 (BL-019・BL-020) のシナリオは残っている
```

```
シナリオ: AC-5 dead path 検証テストの削除
  Given BL-075 の修正が main にマージされた状態
  When  `grep -n "AC-AND-005" web/__tests__/settings-view.test.tsx` を実行する
  Then  AC-AND-005 を扱う describe ブロックは存在しない
   And  `describe("SettingsView サーバ接続設定セクション` で始まる describe ブロックも存在しない
```

```
シナリオ: AC-6 typecheck / lint の clean
  Given BL-075 の修正が main にマージされた状態
  When  リポジトリルートで TypeScript の型検査と lint を実行する
  Then  どちらも 0 エラーで終了する
   And  特に `SettingsViewProps` が `serverUrl` / `authToken` / `onSaveServer` を持たないことに起因する未使用変数・未使用 import 警告は出ていない
```

## 未決事項 / 確認待ち

- なし。

## 補足: 削除対象の具体的所在

参考情報として、調査時点 (BL-075 着手時) の所在を以下に記す。実装時はファイル上の場所が動いている可能性があるためあくまで初期指針として扱う。

| ファイル | 削除対象 | 概略位置 |
| --- | --- | --- |
| `web/src/ui/settings-view/settings-view.tsx` | `SettingsViewProps` の `serverUrl?` / `authToken?` / `onSaveServer?` | Props 型定義 (現行 lines 31-33) |
| `web/src/ui/settings-view/settings-view.tsx` | props 分割代入の `serverUrl: initialServerUrl` / `authToken: initialAuthToken` / `onSaveServer` | 関数本体冒頭 (現行 lines 45-47) |
| `web/src/ui/settings-view/settings-view.tsx` | useState `serverUrlValue` / `authTokenValue` 2 行 | 現行 lines 67-69 (コメント `// サーバ接続設定 (BL-019)` 含む) |
| `web/src/ui/settings-view/settings-view.tsx` | `{onSaveServer !== undefined && (...)}` の section 全体 | 現行 lines 161-194 |
| `web/__tests__/settings-view.test.tsx` | `describe("SettingsView サーバ接続設定セクション (BL-019 AC-AND-005)")` ブロック | 現行 lines 256-349 |
| `web/__tests__/settings-view.test.tsx` | 冒頭ファイルコメントの「BL-019 で拡張される SettingsView の Props」段落 | 現行 lines 34-40 (説明的な dead 記述) |
| `web/src/main.tsx` | `<SettingsView>` 呼び出しで `serverUrl` / `authToken` / `onSaveServer` を渡している箇所 | 現行調査では「該当なし」(既に渡していない)。実装時に再確認のみ。 |
