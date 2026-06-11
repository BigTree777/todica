# 設計・実装計画: 起票カードのプロジェクト選択を `<select>` に戻し ProjectToggle を撤去 (project-toggle-removal)

> [`spec.md`](spec.md) REQ-1〜REQ-5 / AC-1〜AC-10 を実現するための設計と実装手順.

## 方針概要

`<TaskFormCard>` 内の `<ProjectToggle ... />` 呼び出しを「visually-hidden `<label>` + `<select>` + `<option>` 群」に直接置換し, 同時に `<ProjectToggle />` の本体 (`web/src/ui/project-toggle/`) と test を丸ごと削除する. 値の型 (`projectId: string`, "" = 未分類) は親 view (today / tomorrow) の既存 useState と互換のため, 親 view 側の改修は不要. domain / server / API は無改修. 関連する単体 / E2E テスト 10 ファイルを「ProjectToggle 固有 it の撤去」と「select 経由操作への書き換え」の 2 種類で追従する.

## 影響範囲

| 領域 | 変更内容 |
| --- | --- |
| API | 変更なし (`POST /api/v1/tasks` の `projectId: string | null` を維持) |
| DB | 変更なし |
| ドメイン | 変更なし (`Task.projectId: string | null`, `Project` 型) |
| Web モジュール (改修) | `web/src/ui/task-card/task-form-card.tsx`: `<ProjectToggle />` → `<label>` + `<select>` 置換, `ProjectToggle` import 撤去, JSDoc から ProjectToggle 言及を削除 |
| Web モジュール (削除) | `web/src/ui/project-toggle/project-toggle.tsx`, `web/src/ui/project-toggle/project-toggle.css`, `web/src/ui/project-toggle/project-toggle.test.tsx` (ディレクトリごと撤去) |
| 既存単体テスト (改修) | `web/__tests__/project-chip.test.tsx` (AC-4 撤去), `task-card-component.test.tsx` (AC-17 / AC-23 撤去 + select 関連 it 追加), `task-card-hotfix.test.tsx` (AC-9 / AC-10 撤去), `task-form-grid-layout.test.tsx` (AC-11 の ProjectToggle 関連 it 撤去), `today-view.test.tsx` / `tomorrow-view.test.tsx` (ProjectToggle 経由操作 → `userEvent.selectOptions()` に書き換え), `design-tokens.test.ts` (`TARGET_CSS_FILES` から `"ui/project-toggle/project-toggle.css"` 撤去) |
| 既存 E2E (削除) | `e2e/project-toggle.spec.ts` (BL-041 で追加した spec 全体を削除) |
| 既存 E2E (改修) | `e2e/projects.spec.ts` の `projectToggleButton` helper を `page.getByLabel("プロジェクト")` + `selectOption(...)` 系に書き換え; `e2e/remove-inline-project-create.spec.ts`, `e2e/today-view-create-form.spec.ts` も同様 |
| 無修正 | `web/src/ui/today-view/today-view.tsx` / `tomorrow-view/tomorrow-view.tsx` (TaskFormCard の prop シグネチャを変えないため), `web/src/ui/task-card/task-card.css` (`.task-card__header .project-chip` は表示側のため維持), `web/src/ui/day-view/day-view.css` (BL-056 `.project-chip`), `e2e/a11y.spec.ts` |

## 設計詳細

### TaskFormCard の DOM 置換

`task-form-card.tsx` の `<div className="task-card__header">` 配下を次のように書き換える.

#### 改修前 (BL-041 + BL-059 時点)

```tsx
<div className="task-card__header">
  <ProjectToggle
    value={projectId === "" ? null : projectId}
    onChange={(next) => onProjectIdChange(next ?? "")}
    projects={projects}
    idPrefix={idPrefix}
    groupLabel="プロジェクト"
  />
  <PriorityStars
    value={priority}
    onChange={onPriorityChange}
    groupLabel="優先度"
    idPrefix={idPrefix}
  />
</div>
```

#### 改修後 (本 BL)

```tsx
<div className="task-card__header">
  <label htmlFor={`${idPrefix}-project`} className="visually-hidden">
    プロジェクト
  </label>
  <select
    id={`${idPrefix}-project`}
    value={projectId}
    onChange={(e) => onProjectIdChange(e.target.value)}
  >
    <option value="">プロジェクトなし</option>
    {projects.map((p) => (
      <option key={p.id} value={p.id}>
        {p.name}
      </option>
    ))}
  </select>
  <PriorityStars
    value={priority}
    onChange={onPriorityChange}
    groupLabel="優先度"
    idPrefix={idPrefix}
  />
</div>
```

#### 留意点

- `<select>` の `value` には `""` (= 未分類) をそのまま渡す. 親 view 側の `projectId === "" ? null : projectId` 変換は無改修.
- ファイル冒頭の JSDoc (`* - header 段: ProjectToggle (左) + PriorityStars (右)` 等) を「`<select>` (左) + PriorityStars (右)」相当に書き直す.
- `import { ProjectToggle } from "../project-toggle/project-toggle.js";` 行を削除.
- 既存の `TaskFormCardProps` の型シグネチャ (projects / projectId / onProjectIdChange / idPrefix) は無改修. 親 view (today/tomorrow) は触らない.

### ProjectToggle 撤去手順

1. `web/src/ui/project-toggle/project-toggle.tsx` 削除.
2. `web/src/ui/project-toggle/project-toggle.css` 削除.
3. `web/src/ui/project-toggle/project-toggle.test.tsx` 削除.
4. 結果 `web/src/ui/project-toggle/` ディレクトリは空 → 撤去.
5. `web/__tests__/design-tokens.test.ts` の `TARGET_CSS_FILES` から `"ui/project-toggle/project-toggle.css"` を削除.
6. `grep -rn "ProjectToggle\|project-toggle" web/ e2e/` で残存参照を確認 (docs を除く).

### 既存テスト追従の方針

#### 撤去すべき it (BL-041 固有挙動を assert している)

| ファイル | 撤去対象 | 撤去理由 |
| --- | --- | --- |
| `web/__tests__/project-chip.test.tsx` | AC-4 (`ProjectToggle button が project-chip を持つ`) | `<select>` には `.project-chip` を当てないため. TaskCard 表示側 chip の AC は別の it で維持. |
| `web/__tests__/task-card-component.test.tsx` | AC-17 / AC-23 の「ProjectToggle prop API 不変性」assert | ProjectToggle 自体が無くなるため. |
| `web/__tests__/task-card-hotfix.test.tsx` | AC-9 / AC-10 (ProjectToggle 関連) | ProjectToggle 経由の hotfix 対象が無くなるため. |
| `web/__tests__/task-form-grid-layout.test.tsx` | AC-11 の ProjectToggle 関連 it | grid 内の `[data-project-toggle]` 配置 assert は select に置き換わるため. select の grid 内配置は本 BL の AC ではない (BL-066 の責務). |

#### 書き換えるべき it (「プロジェクトが選択できる」を新 UI で確認している)

| ファイル | 書き換え方針 |
| --- | --- |
| `web/__tests__/today-view.test.tsx` | ProjectToggle 経由操作 (`userEvent.click(projectToggleButton)`) を `userEvent.selectOptions(screen.getByLabelText("プロジェクト"), "p-1")` に置き換え. 起票時 `projectId` 検証 it はそのまま残す. |
| `web/__tests__/tomorrow-view.test.tsx` | 同上 (idPrefix が異なる点に注意: `tomorrow-create-project`). |
| `e2e/projects.spec.ts` | `projectToggleButton` helper を `page.getByLabel("プロジェクト")` + `selectOption(...)` 系に書き換え. 巡回 (click を N 回) の代わりに `selectOption({ label: "仕事" })` を使う. |
| `e2e/remove-inline-project-create.spec.ts` | 同上. `projectToggleButton` 参照を `getByLabel("プロジェクト")` の select に置換. |

#### 削除すべきファイル

- `e2e/project-toggle.spec.ts` (BL-041 で追加した spec 全体).
- `web/src/ui/project-toggle/project-toggle.test.tsx` (本体撤去と同時).

#### 追加すべき it (新 UI 仕様の assert)

`web/__tests__/task-card-component.test.tsx` に次の it を新設する (D-006 / 別ファイルは作らない).

- AC-1 相当: `<select id="create-project">` の存在.
- AC-2 相当: option 列挙 (「プロジェクトなし」 + projects).
- AC-3 相当: onChange の spy で onProjectIdChange が想定値で呼ばれる.
- AC-4 相当: label の accessible name が「プロジェクト」かつ `.visually-hidden` が付与されている.

### a11y / axe の維持戦略

- BL-029 の `e2e/a11y.spec.ts` (5 view) は無改修.
- `<select>` + `<label htmlFor>` は WCAG 2.1 AA に既定で適合 (HTML 標準). label が `.visually-hidden` でも axe は accessible name を htmlFor 経由で検出する.
- 既存の `.visually-hidden` クラス (CSS) は他箇所 (TaskFormCard の inputId label) で既に使われている前提. 念のため実装時に CSS 定義の存在を確認する.

### 処理フロー

1. ユーザが `<select>` を開く → option 一覧 (「プロジェクトなし」+ projects) が表示される.
2. ユーザが option を選ぶ → `onChange(e)` → `onProjectIdChange(e.target.value)` → 親 view の `setProjectId(...)` → 再 render.
3. ユーザが「追加」ボタンを押す → 親 view の submit handler → `repository.create({ projectId: projectId === "" ? null : projectId, ... })` → サーバ送信.
4. 起票後, 親 view が `setProjectId("")` で reset → `<select>` の表示は「プロジェクトなし」に戻る (HTML 標準挙動).

### 例外 / エラー処理

- 親 view の null 変換ロジック (`"" → null`) は無改修なので, 例外パスも変わらない.
- `<select>` は HTML 標準で「value 属性に未存在の option を指定された場合」に空表示にフォールバックする. projectId="p-deleted" (一覧から消えた id) の場合, 表示は空になるが内部 state は "p-deleted" のまま残る. 本 BL ではこの edge case を新たに扱わない (BL-041 D-005 の「削除済 id を null に矯正」相当のロジックは, 元 `<select>` 実装 (BL-001) でも追加していなかったため, 元の挙動に戻すだけ).

## 重要な決定

spec.md の D-001 〜 D-007 を参照. 大きな設計判断は spec 側に集約した. 追加で plan 固有の決定があれば本節に追記する.

- **P-001 (置換手順の単一トランザクション化)**:
  TaskFormCard の置換 → ProjectToggle 撤去 → 既存テスト追従, の 3 段階を 1 つの PR にまとめる. 中間状態 (ProjectToggle が居るのに `<select>` も居る等) を main に混入させない.

- **P-002 (test-designer への引き継ぎ)**:
  spec.md AC-1 〜 AC-10 のうち, 単体テストで cover 可能なもの (AC-1 〜 AC-6, AC-8, AC-10) は `task-card-component.test.tsx` への追加で表現. AC-7 / AC-9 は既存 E2E + a11y で吸収. test-designer は spec を直接参照すれば良い.

## リスク / 代替案

### リスク

- **R-1 (追従漏れ)**: spec/plan に挙げた 10 ファイル以外で ProjectToggle / project-toggle を参照しているコードが残ると, 撤去後にビルド失敗または dead reference になる. 緩和: 実装着手前に `grep -rn "ProjectToggle\|project-toggle" web/ e2e/` を必ず実行し plan を更新.
- **R-2 (BL-041 spec ファイルの整合性)**: D-005 で「残す + 追記」を選んだため, BL-041 spec を読んだ将来の開発者が現役仕様と誤解するリスク. 緩和: spec.md 冒頭の状態欄に「撤去済 (BL-065)」を明記し, 本 BL spec へのリンクを張る.
- **R-3 (UI 文言の不一致)**: D-001 で「プロジェクトなし」を採用. 既存テストに「（未分類）」を期待している箇所が残っていれば失敗する. 緩和: 着手前に `grep -rn "未分類" web/ e2e/` で全件確認.
- **R-4 (a11y violations 増加)**: visually-hidden label は accessible name を提供するが, `.visually-hidden` CSS の実装が不適切だと screen reader が読まないケースがある. 緩和: 既存の `.visually-hidden` 定義 (BL-059 で使用中) を流用し新規定義しない.

### 代替案

- **代替 A: `<select>` を共通コンポーネント化 (`<ProjectSelect />`)**:
  将来 BL-066 (box 縮小) で共通スタイルを当てる際に役立つ. ただし本 BL の規模では over-engineering. 不採用.
- **代替 B: `<label>` を画面上に出す (visually-hidden せず)**:
  BL-001 元実装の「プロジェクト (任意)」相当. header 段の縦方向リズムが崩れるため不採用 (U-4 で別 BL に委ねる).
- **代替 C: BL-041 spec ディレクトリを丸ごと削除**:
  履歴を失うため不採用 (D-005).

## テスト方針

> 全体方針は [`../../quality/test-catalog.md`](../../quality/test-catalog.md).

### 単体テスト (Vitest + Testing Library)

- 主戦場: `web/__tests__/task-card-component.test.tsx`.
- AC-1 / AC-2 / AC-3 / AC-4 / AC-6 / AC-10 を新規 it として追加する.
- 既存 it で ProjectToggle 固有の prop / DOM 構造を assert していたものは撤去する (spec D-007 の 10 ファイル参照).
- 「プロジェクト選択で起票時 projectId が正しい」系の it は `userEvent.selectOptions()` 経由に書き換える.

### E2E (Playwright)

- `e2e/projects.spec.ts` で「`<select>` で project を選び起票, タスク一覧の chip に正しい name が出る」を確認.
- `e2e/remove-inline-project-create.spec.ts` も `<select>` 経由 helper に書き換え.
- `e2e/project-toggle.spec.ts` は削除.
- `e2e/a11y.spec.ts` は無改修で violations 0 を維持.

### スモーク

- 実装後に `pnpm -w test` 全件 green + `pnpm -w e2e` (該当 spec) green を確認する.
- 視覚スモーク (`pnpm -w dev` 起動) で `<select>` が表示され, option 一覧から選択できることを目視確認 (BL-066 が box 縮小を担うため box が大きいのは想定内).
