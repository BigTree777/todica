# 仕様: vitest skipped 198 件の棚卸し

- 状態: ドラフト
- 関連: [`../../planning/backlog.md`](../../planning/backlog.md) BL-090

## 背景 / 課題

`npx vitest run` は 1863 passed / 198 skipped を返す. skipped 198 件の内訳を grep ベースで確認した結果, ほぼすべてが UI 再設計の途中状態を保持する `describe.skip` / `it.skip` であり, 現在の UI コードでは存在しない構造をテストしている. 例:

- `routine-card-component.test.tsx` の `flex-direction: row` を assert する skip → 現在は `column`
- `routine-card-edit-priority.test.tsx` / `routine-card-edit-fields.test.tsx` の「編集モード」を assert する skip → 編集モードは撤去済 (常時 inline 編集)
- `routine-card-header-layout.test.tsx` / `routine-form-card-header-layout.test.tsx` の 3 段構造を assert する skip → 現在は 4 段
- `project-card-component.test.tsx` の `.project-card__name` を assert する skip → 撤去済

これらは「過去の仕様を保持する skip」で, 現在の UI 仕様を担保しない. 加えて skip 直上のコメントが「BL-070 で撤去」「BL-073 で 4 段化」のような履歴表現を含み, リリース前の timeless 方針に反する.

## ゴール / 非ゴール

### ゴール

- 現在の UI 仕様を担保しない obsolete な `describe.skip` / `it.skip` を **削除** する.
- `vitest run` の skipped 件数を意図的なもの (UI 再設計の retired tests 以外) だけにする.
- `docs/developer/quality/test-catalog.md` に skip 件数の現状を追記.

### 非ゴール

- production code の修正.
- 新規テストの追加 (= 既に passed 1863 件が現状仕様を担保).
- e2e (Playwright) skip の棚卸し (本 BL は vitest のみ).

## 要件

- **FR-1**: 以下 7 ファイルの obsolete `describe.skip` / `it.skip` をブロックごと削除する. 削除対象は skip ブロック自体と「その直上のコメント (履歴表現を含む)」に限定する. passed テスト側に残る履歴表現の整理は別 BL のスコープ:
  - `web/__tests__/routine-card-component.test.tsx`
  - `web/__tests__/routine-card-edit-fields.test.tsx`
  - `web/__tests__/routine-card-edit-priority.test.tsx`
  - `web/__tests__/routine-card-header-layout.test.tsx`
  - `web/__tests__/routine-form-card-header-layout.test.tsx`
  - `web/__tests__/routine-card-align-with-form.test.tsx`
  - `web/__tests__/project-card-component.test.tsx`
- **FR-2**: 削除後の `vitest run` で skipped 件数が大幅に減少する (目標: 100 件以下).
- **FR-3**: passed 件数は退行しない.
- **FR-4**: `test-catalog.md` に skip 件数の現状サマリを追記.

## 受け入れ基準

```
シナリオ: obsolete な skip が削除されている
  Given 7 ファイルに describe.skip / it.skip があった状態
  When  本 feature 適用後
  Then  7 ファイル合計の describe.skip / it.skip が 0 件
```

```
シナリオ: passed 件数の維持
  Given 本 feature 適用前 passed = 1863
  When  npx vitest run を実行する
  Then  passed = 1863 以上 (退行なし)
```

```
シナリオ: skipped 件数の削減
  Given 本 feature 適用前 skipped = 198
  When  npx vitest run を実行する
  Then  skipped < 100
```
