# タスク: 起票カードのプロジェクト選択を `<select>` に戻し ProjectToggle を撤去 (project-toggle-removal)

> [`plan.md`](plan.md) を実行可能な単位に分解する. 完了したらチェックを入れる.

## 事前確認

- [ ] `grep -rn "ProjectToggle\|project-toggle" web/ e2e/` を実行し, spec D-007 で挙げた 10 ファイル以外に参照が無いことを確認する (あれば plan.md を更新).
- [ ] `grep -rn "未分類" web/ e2e/` で「（未分類）」リテラル assert が残っていないか確認する (D-001 確定の前提).
- [ ] U-1 (option ラベル「プロジェクトなし」) / U-3 (label「プロジェクト」) を user に最終確認する.

## 実装

### TaskFormCard 改修

- [ ] `web/src/ui/task-card/task-form-card.tsx` の `<ProjectToggle ... />` を visually-hidden `<label>` + `<select>` + `<option>` 群に置換する (plan §「TaskFormCard の DOM 置換」).
- [ ] 同ファイル冒頭の JSDoc から ProjectToggle 言及を削除し, `<select>` 配置に書き直す.
- [ ] `import { ProjectToggle } from "../project-toggle/project-toggle.js";` 行を削除する.

### ProjectToggle 撤去

- [ ] `web/src/ui/project-toggle/project-toggle.tsx` を削除する.
- [ ] `web/src/ui/project-toggle/project-toggle.css` を削除する.
- [ ] `web/src/ui/project-toggle/project-toggle.test.tsx` を削除する.
- [ ] `web/src/ui/project-toggle/` ディレクトリが空になったことを確認し撤去する.
- [ ] `grep -rn "ProjectToggle\|project-toggle" web/ e2e/` で残存参照が 0 件であることを再確認する (docs 除く).

## テスト追従

### 単体テスト (撤去)

- [ ] `web/__tests__/project-chip.test.tsx` AC-4 (`ProjectToggle button が project-chip を持つ`) を撤去する.
- [ ] `web/__tests__/task-card-component.test.tsx` AC-17 / AC-23 の ProjectToggle prop API 不変性 assert を撤去する.
- [ ] `web/__tests__/task-card-hotfix.test.tsx` AC-9 / AC-10 を撤去する.
- [ ] `web/__tests__/task-form-grid-layout.test.tsx` AC-11 の ProjectToggle 関連 it を撤去する.

### 単体テスト (書き換え)

- [ ] `web/__tests__/today-view.test.tsx` の ProjectToggle 経由操作を `userEvent.selectOptions(screen.getByLabelText("プロジェクト"), <id>)` に置き換える.
- [ ] `web/__tests__/tomorrow-view.test.tsx` を同様に書き換える (idPrefix が異なる点に注意).
- [ ] `web/__tests__/design-tokens.test.ts` の `TARGET_CSS_FILES` から `"ui/project-toggle/project-toggle.css"` を削除する.

### 単体テスト (追加)

- [ ] `web/__tests__/task-card-component.test.tsx` に次の it を追加する (D-006 / 単一ファイル方針).
  - AC-1: `<select id="create-project">` の存在.
  - AC-2: option 列挙 (「プロジェクトなし」 + projects).
  - AC-3: onChange spy で onProjectIdChange が想定値で呼ばれる.
  - AC-4: label の accessible name が「プロジェクト」かつ `.visually-hidden` 付与.

### E2E (削除)

- [ ] `e2e/project-toggle.spec.ts` を削除する.

### E2E (書き換え)

- [ ] `e2e/projects.spec.ts` の `projectToggleButton` helper を `page.getByLabel("プロジェクト")` + `selectOption({ label: "<name>" })` に書き換える.
- [ ] `e2e/remove-inline-project-create.spec.ts` の `projectToggleButton` 参照を同様に書き換える.

### a11y / 全件 green

- [ ] `pnpm -w test` を実行し単体テスト全件 green を確認する.
- [ ] `pnpm -w e2e` (もしくは playwright runner) を実行し E2E 全件 green を確認する.
- [ ] `e2e/a11y.spec.ts` の violations === 0 を 5 view 全てで確認する.

## ドキュメント

- [ ] `docs/developer/features/project-toggle-ui/spec.md` 冒頭の状態欄に「撤去済 (BL-065 で巻き戻し)」を 1 段落追記する (D-005).
- [ ] `docs/developer/planning/backlog.md` BL-065 行は既に Todo 記載済のため追加編集不要. 完了後に Done へ更新する想定 (本 BL 内では着手しない).

## 仕上げ

- [ ] 受け入れ基準 (spec.md AC-1 〜 AC-10) を全て満たすことを確認する.
- [ ] auditor に監査を依頼する.
- [ ] レビュー依頼 (Pull Request 作成).
