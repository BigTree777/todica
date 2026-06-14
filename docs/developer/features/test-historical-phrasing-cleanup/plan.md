# 計画: 完了済 UI feature テストファイルから BL-XXX 履歴表現を timeless 化

## 方針概要

5 ファイルから `BL-0\d{3}` を機械的に削除 / 中立表現置換. 各 test の assertion ロジックは無改修.

## 影響範囲

| ファイル | 変更内容 |
|---|---|
| `web/__tests__/routine-card-component.test.tsx` | BL-XXX 言及を timeless 化 |
| `web/__tests__/project-card-component.test.tsx` | 同上 |
| `web/__tests__/routine-card-header-layout.test.tsx` | 同上 |
| `web/__tests__/routine-form-card-header-layout.test.tsx` | 同上 |
| `web/__tests__/routine-card-align-with-form.test.tsx` | 同上 |
| `__tests__/structure/no-obsolete-skips.test.ts` | BL-XXX 不在 assertion 追加 |

## 設計詳細

### 置換パターン

- `(BL-XXX で…)` / `[BL-XXX で…]` の括弧塊 → 削除
- `BL-XXX で / の / を / に / 追従 / 維持` 等 → `現状` に置換
- `, BL-XXX` / `、 BL-XXX` 等の列挙 → 削除
- 単独の `BL-XXX` → 削除
- `// BL-XXX …` (コメント行頭) → `// …`

`/` を含むパターン (`// コメント`) を破壊しないよう, `/` を区切り文字に含めない安全な regex に統一.

## テスト方針

- 既存 251 件 (5 ファイルの test 件数) の passed 数が維持されることをもって意図保持を確認.
- `no-obsolete-skips.test.ts` の新 assertion で BL-XXX 残存 0 件を機械的に保証.
