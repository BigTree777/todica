# タスク: プロジェクトカード / プロジェクト起票カードのプロジェクト名フォントサイズを h2 に揃える

> [`plan.md`](plan.md) を実行可能な単位に分解する。完了したらチェックを入れる。

## test-designer 範囲: 失敗するテストを先に用意

新規テストファイル `web/__tests__/project-name-font-emphasis.test.ts` を作成し、以下を含める。
パターンは `web/__tests__/completion-counter-emphasis.test.ts` の CSS 文面 match スタイル
(readFileSync + extractRuleBody) と、`web/__tests__/project-card-component.test.tsx` の
動的 import + render パターンを参考にする。

- [x] AC-CSS-font-size: `web/src/ui/project-card/project-card.css` の `.project-card__input`
      ルール本文に `font-size: var(--font-size-h2)` が含まれることを検証する (REQ-1)。
- [x] AC-CSS-flex 保存: 同ルール本文に既存の `flex: 1` (または `flex-grow: 1`) が引き続き
      含まれることを検証する (REQ-3 保護)。
- [x] AC-CSS-placeholder 保存: `.project-card__input::placeholder` ルール本文に
      `color: var(--color-fg-subtle)` が引き続き含まれることを検証する (REQ-3 保護)。
- [x] AC-DOM-ProjectCard 不変: `<ProjectCard project={{ id: "p1", name: "仕事" }} ... />` を
      jsdom で render し、`<input id="project-name-p1" className="project-card__input">` が
      存在し、`<label htmlFor="project-name-p1" className="visually-hidden">プロジェクト名</label>`
      と `for` ↔ `id` で関連付けされていることを検証する (REQ-4 保護)。
- [x] AC-DOM-ProjectFormCard 不変: `<ProjectFormCard name="" ... />` を jsdom で render し、
      `<input id="project-name" className="project-card__input" placeholder="プロジェクト名">`
      が存在することを検証する (REQ-4 保護)。
- [x] AC-非波及-task/routine 無改修: `web/src/ui/task-card/task-card.css` と
      `web/src/ui/routine-card/routine-card.css` に `.project-card__input` 系セレクタが
      追加されていないことを CSS 文面 match で検証する (= 系統独立の回帰ガード)。
- [x] 上記テストが実装前に **red** (= AC-CSS-font-size が失敗) になることを
      `npx vitest run web/__tests__/project-name-font-emphasis.test.ts` で確認する。
      他の AC (既存宣言保存 / DOM 不変 / 非波及) は実装前から green で構わない (= 回帰ガード)。

## implementer 範囲: 実装

- [x] `web/src/ui/project-card/project-card.css` の `.project-card__input` ルール本文に
      `font-size: var(--font-size-h2)` を 1 宣言追加する (plan.md §「CSS の変更」参照)。
      既存宣言 `flex: 1` は維持する。
- [x] `.project-card__input::placeholder` ルール本文の `color: var(--color-fg-subtle)` は
      維持する (改変しない)。
- [x] 親 `.project-card` ルールには `font-size` を追加しない (副作用範囲拡大の回避 / D-001)。
- [x] `web/src/ui/project-card/project-card.tsx` と `web/src/ui/project-card/project-form-card.tsx`
      は **編集しない** (NFR-SCOPE-CSS-ONLY / REQ-4)。
- [x] `web/src/ui/task-card/task-card.css` / `web/src/ui/routine-card/routine-card.css` /
      `web/src/styles/tokens.css` を **編集しない** (NFR-NO-ROUTINE-OR-TASK-CASCADE /
      NFR-NO-NEW-TOKENS)。

## implementer 範囲: 既存テスト green 維持確認

- [x] `npx vitest run web/__tests__/project-card-component.test.tsx` が全件 green であることを
      確認する。特に AC-4 (`.project-card__input` の `flex: 1` / `::placeholder` 薄色) と
      AC-18 (box-shadow / transition / animation / :hover 不在) が green。
- [x] `npx vitest run web/__tests__/inline-edit-all-cards.test.tsx` の `<ProjectCard>` 系
      シナリオが全件 green であることを確認する。
- [x] `npx vitest run web/__tests__/projects-view.test.tsx` 等の `/projects` 関連
      既存テストが全件 green であることを確認する。
- [x] `npx vitest run web/__tests__/design-tokens.test.ts` の `--font-size-h2` 定義検証が
      green であることを確認する。

## 全件実行

- [x] リポジトリルートから `npx vitest run` で vitest 全件 green を確認する。
- [x] `npm -w e2e test` で Playwright 全件 green を確認する。
      特に `/projects` のプロジェクト作成 / 名前変更 / 削除フローを扱う既存 spec
      (`e2e/projects-*.spec.ts` 系) の green 維持。
- [x] `npm -w web run typecheck` / `npm -w web run lint` が 0 件であることを確認する。

## auditor 範囲: 仕上げ確認

- [x] 受け入れ基準 (spec.md §「受け入れ基準」) の全シナリオを満たすことを確認する。
- [x] `git diff` で本 BL の変更ファイルが **`web/src/ui/project-card/project-card.css` 1
      ファイルのみ** (= テスト新設ファイル `web/__tests__/project-name-font-emphasis.test.ts`
      および本 feature 配下の docs を除く) であることを確認する
      (NFR-SCOPE-CSS-ONLY / NFR-NO-ROUTINE-OR-TASK-CASCADE / NFR-NO-NEW-TOKENS の回帰ガード)。
- [x] `web/src/ui/project-card/project-card.tsx` / `web/src/ui/project-card/project-form-card.tsx` /
      `web/src/ui/task-card/task-card.css` / `web/src/ui/routine-card/routine-card.css` /
      `web/src/styles/tokens.css` が `git diff` 上で無改修であることを確認する。
- [x] 手動確認 (任意): ブラウザ実機で `/projects` を開き、プロジェクト名 input が
      `/today` のタスク名 input / `/routines` のルーティン名 input と同じ視覚サイズで
      並ぶことを目視確認する (REQ-2)。

## ドキュメント

- [x] `docs/developer/planning/backlog.md` の BL-110 行を `Todo` → `Done` に更新する
      (実装完了後)。
