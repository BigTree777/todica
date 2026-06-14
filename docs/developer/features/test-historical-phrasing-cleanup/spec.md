# 仕様: 完了済 UI feature テストファイルから BL-XXX 履歴表現を timeless 化

- 状態: ドラフト
- 関連: [`../../planning/backlog.md`](../../planning/backlog.md) BL-095

## 背景 / 課題

routine-card / project-card 系の単体テスト 5 ファイル (`routine-card-component.test.tsx` / `project-card-component.test.tsx` / `routine-card-header-layout.test.tsx` / `routine-form-card-header-layout.test.tsx` / `routine-card-align-with-form.test.tsx`) の describe / it タイトルおよびコメントに 178 件以上の `BL-0[0-9]+` 履歴表現が残る. `feedback_no_historical_phrasing` (リリース前 timeless 方針) に反する.

## ゴール

- 上記 5 ファイルから `BL-0[0-9]+` 言及を 0 件にする.

## 非ゴール

- production code の改修.
- 他の docs / tests の履歴表現整理 (別 BL).

## 要件

- **FR-1**: 5 ファイルの `BL-0\d{3}` パターン出現数を 0 にする.
- **FR-2**: 各 test の assertion 意図は無改修. ロジックは触らない.
- **FR-3**: 既存テスト全件 green を維持.
- **FR-4**: `__tests__/structure/no-obsolete-skips.test.ts` に「5 ファイルに `BL-0\d{3}` が存在しない」assertion を追加.

## 受け入れ基準

```
シナリオ: 5 ファイルから BL-XXX が消えている
  Given 5 ファイル
  When  grep -c "BL-0[0-9]\+" を各ファイルで実行する
  Then  すべて 0
```

```
シナリオ: テストの意図が保たれる
  Given 5 ファイルのテストロジック
  When  vitest run を実行する
  Then  退行なし (passed 件数が減らない)
```
