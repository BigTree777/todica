# 計画: vitest skipped 198 件の棚卸し

- 状態: ドラフト
- 関連: [`spec.md`](spec.md)

## 方針概要

棚卸しの結果, 198 件すべてが UI 再設計の retired tests と判明. 全件削除する.

## 影響範囲

| ファイル | 削除内容 |
|---|---|
| `web/__tests__/routine-card-component.test.tsx` | 6 つの skip ブロック |
| `web/__tests__/routine-card-edit-fields.test.tsx` | 1 つの describe.skip |
| `web/__tests__/routine-card-edit-priority.test.tsx` | 1 つの describe.skip |
| `web/__tests__/routine-card-header-layout.test.tsx` | 4 つの skip ブロック |
| `web/__tests__/routine-form-card-header-layout.test.tsx` | 4 つの skip ブロック |
| `web/__tests__/routine-card-align-with-form.test.tsx` | 1 つの it.skip |
| `web/__tests__/project-card-component.test.tsx` | 1 つの describe.skip |
| `docs/developer/quality/test-catalog.md` | skip 件数サマリの追記 |

## 設計詳細

### 削除手順

各 skip ブロックは `it.skip(...) => { ... });` または `describe.skip(...) => { ... });` の構造を持つ. ブロック全体 (中括弧含む) を AST レベルで削除する. 周囲のコメント (「BL-XXX で…」等) も同時に削除.

### test-catalog.md の更新

末尾に次の節を追加:

```markdown
## skip 状況

`npx vitest run` の skipped 件数は意図的に 0 件を目指す. 過去 UI 仕様を保持する skip は obsolete として削除済み. 今後 skip を入れる際は直上 comment で skip 理由 (= なぜ unskip しないか) を timeless に明記する.
```

## 重要な決定

- **D-1**: 全件削除. アーカイブ用に skip を残さない (git history に残るので復元可能).
- **D-2**: skip ブロック直上の履歴表現コメント (「BL-XXX で…」) も同時に削除. passed テスト側に残る BL-XXX 言及の整理は別 BL に切り出す.
- **D-3**: ADR は作らない.

## テスト方針

- `__tests__/structure/no-obsolete-skips.test.ts` を新設し, 上記 7 ファイルの `describe.skip` / `it.skip` 行が 0 件であることを grep ベースで assert.
- 既存 passed 件数の退行なしを確認.
