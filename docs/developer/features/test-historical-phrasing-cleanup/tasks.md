# タスク: 完了済 UI feature テストファイルから BL-XXX 履歴表現を timeless 化

## 実装

- [x] 5 ファイル (routine-card-component / project-card-component / routine-card-header-layout / routine-form-card-header-layout / routine-card-align-with-form) から `BL-0\d{3}` 言及を削除
- [x] `__tests__/structure/no-obsolete-skips.test.ts` に「5 ファイルに `BL-0\d{3}` が存在しない」 it.each を追加

## テスト

- [x] 5 ファイルそれぞれ `grep -c "BL-0[0-9]\+"` で 0 件
- [x] 既存テスト全件 green
- [x] `npm run lint` / `npm run typecheck` 退行なし
