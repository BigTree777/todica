# 設計・実装計画: 完了タスク数カウンタの配置見直し

> [`spec.md`](spec.md) の要件を、どう実現するかに落とす。

## 方針概要

`today-view.tsx` の `<header>` 内に完了数カウンタを移動し、h1 と「＋プロジェクトの追加」
ボタンの間に配置する。変更は UI 配置の最小変更のみで、サーバ API・データモデル・
Repository への変更は一切行わない。

## 影響範囲

| 領域 | 変更内容 |
| --- | --- |
| API | なし |
| DB | なし |
| モジュール | なし |
| UI | `web/src/ui/today-view/today-view.tsx`（カウンタ要素を header 内に移動）、`web/src/ui/today-view/today-view.css`（新規作成またはインラインスタイルで対応・カウンタのデザイントークン適用） |

## 設計詳細

### データモデル

変更なし。`completionCount` は `repository.today()` のレスポンス（`TodayData` 型）に
既に含まれており、BL-008 で実装済み。

### 処理フロー

変更なし。`useMutation` の成功後に `invalidateAll()` で `["today"]` を invalidate し、
再フェッチした `todayData.completionCount` を描画する既存フローを維持する。

### JSX の変更

**変更前** (`today-view.tsx` の `<header>` 外):

```jsx
<header style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
  <h1>今日</h1>
  <button type="button" onClick={() => setProjectDialogOpen(true)}>
    ＋プロジェクトの追加
  </button>
</header>

{/* BL-008 / FR-040 ... */}
<div aria-label="今日の完了タスク数">
  <span>今日の完了: {completionCount}</span>
</div>
```

**変更後** (カウンタを `<header>` 内に移動):

```jsx
<header className="today-view__header">
  <h1>今日</h1>
  <span
    className="today-view__completion-count"
    aria-label="今日の完了タスク数"
  >
    今日の完了: {completionCount}
  </span>
  <button type="button" onClick={() => setProjectDialogOpen(true)}>
    ＋プロジェクトの追加
  </button>
</header>
```

- `<div aria-label="今日の完了タスク数"><span>...</span></div>` を廃止し、
  `<span aria-label="今日の完了タスク数">...{completionCount}</span>` に変更する。
- header の `style` 属性（インラインスタイル）を className に移行し、今日ビューの
  CSS クラスとして管理する。
- `aria-label="今日の完了タスク数"` の識別子を維持することで BL-008 の既存テストと
  アクセシビリティ担保を継続する。

### CSS の変更

`web/src/ui/today-view/today-view.css` を新規作成し以下を追加する（ファイルが存在しない
場合のみ新規作成。`today-view.tsx` で import する）。

```css
/* BL-047: 完了数カウンタの配置見直し */

.today-view__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: var(--space-md);
}

.today-view__completion-count {
  font-size: var(--font-size-small);
  color: var(--color-fg-subtle);
}
```

### 例外 / エラー処理

変更なし。`completionCount` は `todayData?.completionCount ?? 0` のフォールバックが
既に BL-008 実装で存在する。

## 重要な決定

- **D-001: 配置案の選択**: BL-035 U-003 の 3 案のうち (c) today-view 見出し右を採用する。
  - (a) サイドバー下部: 完了数は「今日のタスク」文脈の情報であり、全ページ共通のサイドバーに
    常時表示するのは過剰露出。また AppShell は presentational only（props なし）設計のため
    `completionCount` を渡すには props 追加が必要で変更コストが高い。
  - (b) focus-view 統合: focus-view は「現在のタスクに集中する」単一責務であり（BL-037 spec REQ-2）、
    今日の進捗集計は責務外。
  - (c) today-view 見出し右: 完了数は「今日のタスク」文脈の情報として最も自然な配置。
    既存 header に追加するだけで変更が最小。モックに明示されていない要素を控えめな
    サイズ・色で表示することでモックの精神を損なわない。

- **D-002: `<div>` から `<span>` への変更**: ヘッダ内のフロー要素として自然なインライン要素
  （`<span>`）に変更する。`aria-label` を `<span>` に移動することで、BL-008 のテストが
  `aria-label="今日の完了タスク数"` 要素の `textContent` を検索するクエリは引き続き機能する。

- **D-003: インラインスタイルの除去**: 既存 `header` の `style={{ display: "flex", ... }}` を
  CSS クラスに移行し、スタイル管理を一元化する。デザイントークン（BL-046 完了済み）を活用する。

## リスク / 代替案

- **BL-008 テストへの影響**: `today-view.test.tsx` の BL-008 テスト群は要素の `aria-label`
  を検索するが、要素タイプ（div/span）ではなく `aria-label` 文字列で照合しているため、
  `<div>` → `<span>` の変更でテストが壊れるリスクは低い。念のため実装後に確認する。

- **E2E テストへの影響**: e2e/ 配下の E2E テストで完了数カウンタを明示的に参照している
  テストが存在する場合は調整が必要。`e2e/state-restoration.spec.ts` が関連する可能性があるため
  実装前に確認する。

## テスト方針

> 全体方針は [`../../quality/test-catalog.md`](../../quality/test-catalog.md)。

- BL-008 の既存単体テスト（`today-view.test.tsx` の「今日の完了数表示」describeブロック）が
  green を維持することを最優先で確認する。
- 新しい単体テストとして「カウンタが header 内に存在すること」を確認するテストを追加する
  （spec.md の受け入れ基準「配置」シナリオに対応）。
- 「focus-view / tomorrow-view には完了数カウンタが存在しない」は既存の各ビューテストで
  担保されている（= 追加実装なし）ため、独立した新規テストは不要。
- E2E テストは既存の `e2e/state-restoration.spec.ts` が完了数の復元を検証しているため、
  green 維持を確認する。新規 E2E テストは原則不要（単体テストで十分）。
