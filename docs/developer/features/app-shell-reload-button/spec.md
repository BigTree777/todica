# 仕様: 画面右上にアイコンのみの更新ボタンを配置

- 状態: ドラフト
- 関連: [`../../planning/backlog.md`](../../planning/backlog.md) BL-093

## 背景 / 課題

SW のアップデート確認 UI (`SwUpdateDialog`) は新しい precache が検知されたときにのみ表示される. ユーザが「明示的にいつでも押せる更新ボタンを画面右上に置きたい」と要望.

## ゴール

- AppShell 右上にアイコンのみ (日本語ラベルなし) の更新ボタンを配置する.
- aria-label で a11y 名は提供する (例: `アップデートを確認して再読み込み`).
- 押下で SW update 確認を行い, `window.location.reload()` を実行する. 既存の `SwUpdateDialog` の表示経路と衝突しない (= waiting SW があれば `SKIP_WAITING` を送ってから reload).

## 非ゴール

- SW 本体 / `SwUpdateDialog` 本体の改修.
- 通知センター等の他の AppShell 内ボタン.

## 要件

- **FR-1**: `web/src/ui/app-shell/app-shell.tsx` に reload button を追加.
- **FR-2**: `position: fixed; top + right` で画面右上に常時表示. ハンバーガー (左上) と視覚的に競合しない.
- **FR-3**: 日本語ラベルを持たず Unicode アイコン (`↻` 等) のみ. `aria-label="アップデートを確認して再読み込み"`.
- **FR-4**: クリック時:
  - SW registration があり waiting がいれば `waiting.postMessage({ type: "SKIP_WAITING" })`.
  - waiting がいなければ `registration.update()` を呼ぶ.
  - いずれの場合も `window.location.reload()` を実行.
- **FR-5**: SW が無い環境 (テスト・dev) でもエラーにならず `window.location.reload()` のみ実行.

## 受け入れ基準

```
シナリオ: 右上に更新ボタンが常時表示される
  Given AppShell が描画される
  When  画面右上を見る
  Then  aria-label="アップデートを確認して再読み込み" の button が存在する
```

```
シナリオ: 日本語ラベルは持たない
  Given 更新ボタン
  When  textContent を確認する
  Then  日本語文字を含まない (Unicode 記号のみ)
```

```
シナリオ: クリックで reload が実行される
  Given 更新ボタン
  When  クリックする
  Then  window.location.reload() が呼ばれる
```

```
シナリオ: waiting SW があれば SKIP_WAITING + reload
  Given waiting 中の SW が存在する
  When  更新ボタンをクリックする
  Then  waiting.postMessage({ type: "SKIP_WAITING" }) と window.location.reload() が呼ばれる
```
