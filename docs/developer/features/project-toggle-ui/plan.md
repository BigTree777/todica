# 設計・実装計画: プロジェクト選択をトグル UI に変更 (project-toggle-ui)

> [`spec.md`](spec.md) の REQ-1〜REQ-6 / AC-1〜AC-10 を実現するための設計と実装手順.

## 方針概要

共通コンポーネント `<ProjectToggle value, onChange, projects, idPrefix />` を `web/src/ui/project-toggle/` に新設し, today / tomorrow の起票フォームの `<select id="task-project">` / `<select id="tomorrow-task-project">` を同じ部品で置換する. ドメイン値・API・サーバ実装は無改修. CSS はコンポーネントローカルに置き, デザイントークン化 (BL-046) は後追いで合流する. BL-040 (`priority-star-ui`) で確立した「共通コンポーネント + 単体テスト + view への組み込み + E2E 1 件追加」のパターンをそのまま踏襲する.

## 影響範囲

| 領域 | 変更内容 |
| --- | --- |
| API | 変更なし (`POST /api/v1/tasks` の `projectId` フィールドをそのまま使う) |
| DB | 変更なし |
| ドメイン | 変更なし (`projectId: string | null`) |
| Web モジュール (新設) | `web/src/ui/project-toggle/project-toggle.tsx`, `web/src/ui/project-toggle/project-toggle.css` |
| Web モジュール (改修) | `web/src/ui/today-view/today-view.tsx` (起票フォーム内 `<select id="task-project">` ブロックを置換), `web/src/ui/tomorrow-view/tomorrow-view.tsx` (起票フォーム内 `<select id="tomorrow-task-project">` ブロックを置換) |
| 既存テスト (改修) | `web/__tests__/today-view.test.tsx` (プロジェクト関連 it のみ: `describe("TodayView (BL-016 プロジェクト選択 UI)", ...)` 配下と, 起票フォーム要素列挙の it), `web/__tests__/tomorrow-view.test.tsx` (起票フォームの要素列挙 + 起票時 projectId 検証 it) |
| 新規テスト | `web/__tests__/project-toggle.test.tsx` (単体), `e2e/project-toggle.spec.ts` (新規, 1 件: 巡回 → 起票で正しい projectId 送信) |
| 既存 E2E (改修) | `e2e/projects.spec.ts` のプロジェクト紐付け起票部分 (`page.getByLabel("プロジェクト (任意)").selectOption(...)`) を, トグルボタンのクリック巡回経由に書き換え |
| 既存 E2E (無修正) | `e2e/a11y.spec.ts` (violations 0 を維持) |

## 設計詳細

### `<ProjectToggle />` コンポーネント

配置: `web/src/ui/project-toggle/project-toggle.tsx`.

```ts
import type { Project } from "../../repositories/project-repository";

export interface ProjectToggleProps {
  /** 現在値 (null = 未分類). */
  value: string | null;
  /** トグル巡回時のコールバック. 次の値 (null | string) を渡す. */
  onChange: (next: string | null) => void;
  /** プロジェクト一覧. ProjectRepository.list() の結果をそのまま渡す. */
  projects: Project[];
  /**
   * 同一画面に複数インスタンスが並ぶときの id 衝突回避.
   * 例: `create` / `tomorrow-create`. 省略時は React の useId を使う.
   */
  idPrefix?: string;
  /**
   * 用途別ラベル (アクセシビリティのコンテキスト).
   * 省略時は "プロジェクト".
   */
  groupLabel?: string;
}
```

### UI 構造

```tsx
<div data-project-toggle>
  <span id={`${prefix}-project-toggle-label`}>
    プロジェクト (トグルで選択)
  </span>
  <button
    type="button"
    aria-labelledby={`${prefix}-project-toggle-label`}
    aria-label={`プロジェクト: 現在 ${currentName} (タップで次へ)`}
    aria-describedby={`${prefix}-project-toggle-live`}
    onClick={handleClick}
    data-current-id={value ?? ""}
  >
    <span data-project-toggle-name>{currentName}</span>
  </button>
  <span
    id={`${prefix}-project-toggle-live`}
    aria-live="polite"
    data-visually-hidden
  >
    {`現在の選択: ${currentName}`}
  </span>
</div>
```

- ボタンの可視テキストは `currentName` (= `null` のとき「（未分類）」, それ以外は `project.name`).
- `aria-label` に「プロジェクト: 現在 ＜name＞ (タップで次へ)」を入れて, screen reader で現在値と操作可能性が伝わるようにする (REQ-4).
- 隠し `<span aria-live="polite">` を持ち, 値変化時に `「現在の選択: ＜name＞」` を読み上げさせる (REQ-4).
- `data-current-id` を E2E / 単体テストで現在値を取りやすくするためのフックとして付ける.
- `data-project-toggle` をスタイル / テストのフックに使う.

### 巡回ロジック

```ts
const PROJECT_TOGGLE_NULL_SENTINEL = null as const;

function nextValue(
  current: string | null,
  projects: Project[],
): string | null {
  if (projects.length === 0) return PROJECT_TOGGLE_NULL_SENTINEL;
  if (current === null) return projects[0].id; // 未分類 → 先頭
  const idx = projects.findIndex((p) => p.id === current);
  if (idx === -1) return PROJECT_TOGGLE_NULL_SENTINEL; // 削除済 id は未分類に矯正 (spec U-7)
  if (idx === projects.length - 1) return PROJECT_TOGGLE_NULL_SENTINEL; // 末尾 → 未分類
  return projects[idx + 1].id;
}
```

- `projects.length === 0` のとき, `handleClick` でも `onChange(null)` を呼ばない (no-op. AC-6).
- `current` が `projects[]` に存在しない id だった場合 (タブ間で削除された等), 次クリックで `null` に矯正する (spec U-7 デフォルト案 A).

### `handleClick` の挙動

```ts
function handleClick() {
  if (projects.length === 0) return; // AC-6 / no-op
  const next = nextValue(value, projects);
  if (next === value) return; // 余計な onChange を抑止
  onChange(next);
}
```

### 表示名の解決

```ts
function getCurrentName(value: string | null, projects: Project[]): string {
  if (value === null) return "（未分類）";
  const project = projects.find((p) => p.id === value);
  return project ? project.name : "（未分類）"; // 削除済 id は「未分類」相当に表示
}
```

### CSS

`web/src/ui/project-toggle/project-toggle.css` を新設.

- `[data-project-toggle]`: `display: flex; flex-direction: column; gap: 0.25rem;`
- `[data-project-toggle] button`: `width: 100%`, padding 適切, 枠線 1px, 角丸 `0.5rem`, 背景透過, テキスト色 `#1a1a1a`. ホバー / フォーカス時は OS 既定の outline を維持.
- `[data-project-toggle] button[data-current-id=""]`: 「未分類」状態のスタイル (微妙にディムするオプションは後で検討. 初版は同じスタイル).
- 長いプロジェクト名は ellipsis で省略: `[data-project-toggle-name] { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }`.
- `[data-visually-hidden]`: WAI-ARIA で参照される隠しテキスト. 標準的な visually-hidden パターン.
- WCAG 2.1 AA contrast (4.5:1) を満たす配色 (テキスト `#1a1a1a` on 背景 `#fff` = 18.9:1, 枠線 `#595959` on 背景 `#fff` = 7:1).

### today-view への組み込み

1. **起票フォームの `<select id="task-project">` ブロックを置換**.

   現状 (`today-view.tsx` 466-480 行):
   ```tsx
   <div>
     <label htmlFor="task-project">プロジェクト (任意)</label>
     <select id="task-project" value={projectId} onChange={(e) => setProjectId(e.target.value)}>
       <option value="">（未分類）</option>
       {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
     </select>
   </div>
   ```

   置換後:
   ```tsx
   <div>
     <ProjectToggle
       value={projectId === "" ? null : projectId}
       onChange={(next) => setProjectId(next ?? "")}
       projects={projects}
       idPrefix="create"
       groupLabel="プロジェクト"
     />
   </div>
   ```

   注: 既存の `projectId` state は `useState("")` (空文字 = 未分類) の互換を保つため, `<ProjectToggle>` の `value`/`onChange` 境界で `"" <-> null` 変換する. これにより既存 `handleCreate` の `projectId: projectId ? projectId : null` ロジック (today-view.tsx 338 行) は無改修で動く.

2. **`<label htmlFor="task-project">` の削除**.
   トグルボタン自体に `aria-label` で意味が乗るため不要. ただし「プロジェクト (トグルで選択)」相当の見える文字は `<ProjectToggle>` 内部の `<span>` が持つ (REQ-3 / 補助テキスト).

3. **起票後リセットの動作 (AC-10)**:
   現状の起票成功時の `setProjectId("")` リセット (today-view.tsx 内の `onSuccess`) はそのまま動く. `<ProjectToggle>` 側は controlled なので親 state のリセットでトグル表示も「（未分類）」に戻る.

### tomorrow-view への組み込み

1. 起票フォームの `<select id="tomorrow-task-project">` ブロック (tomorrow-view.tsx 326-340 行) を `<ProjectToggle value={...} onChange={...} projects={projects} idPrefix="tomorrow-create" groupLabel="プロジェクト" />` に置換.
2. `<label htmlFor="tomorrow-task-project">` を削除.
3. タスクカード上のプロジェクト表示 (tomorrow-view.tsx 363-365 行付近の `project = task.projectId ? projects.find(...) : null`) は触らない (spec の非ゴール).

### 段階的移行

1 PR で today / tomorrow 両 view を同時に置換する. 中間状態 (片方だけトグル) は許容しない (テスト整合性が崩れるため. BL-040 と同じ流儀).

ロールバック手順:

1. `web/src/ui/project-toggle/` ディレクトリを削除.
2. today-view / tomorrow-view を `git revert` 相当で `<select>` 版に戻す.
3. テストも対応する revert (`web/__tests__/project-toggle.test.tsx` 削除, `today-view.test.tsx` / `tomorrow-view.test.tsx` / `e2e/projects.spec.ts` の項目を revert).

### value の型変換

既存 view 側の state は `useState("")` (空文字 = 未分類) のため, `<ProjectToggle>` の境界で `"" <-> null` の変換を行う. これは「既存の `handleCreate` を無改修にする」「ロールバック容易性を保つ」ためのトレードオフ.

将来的に `useState<string | null>(null)` へ migrate する選択肢もあるが, 本 BL では「最小差分」を優先する.

## 重要な決定

- **D-001 (共通コンポーネント化)**: today / tomorrow の 2 view で同じ `<ProjectToggle />` を使う. props は `value / onChange / projects / idPrefix / groupLabel` の 5 つに絞る. BL-040 (`<PriorityStars />`) と同じ流儀.

- **D-002 (単一 `<button>` で巡回 UI を実装)**: `<select>` ではなく `<button type="button">` 1 個で実装する. クリックで「次の値に進む」のみ. 逆巡回は初版に含めない (spec U-1 を別 BL に切り出す).

- **D-003 (`null` も状態として等価)**: 「未分類」は専用ボタンや空白ではなく, 巡回ポジションの 1 つとして扱う. `value: string | null` で表現し, 巡回順は `null → projects[0] → ... → projects[last] → null` で確定 (REQ-2).

- **D-004 (`""` ↔ `null` の境界変換)**: 親 view 側の既存 `projectId` state (`useState("")`) を保護するため, `<ProjectToggle>` 境界で `""` ↔ `null` を変換する. 既存 `handleCreate` の `projectId: projectId ? projectId : null` ロジックを無改修にする.

- **D-005 (削除済み id は次クリックで `null` に矯正)**: タブ間でプロジェクトが削除された場合の `value` (= 存在しない id) は, 次クリックで `null` に矯正する (spec U-7 / 案 A). 表示は「（未分類）」相当に fallback.

- **D-006 (起票後にトグルをリセット)**: 既存 `<select>` 実装の挙動 (起票成功時に `setProjectId("")` でリセット) を踏襲. 新 UI でも親 state のリセットで「（未分類）」に戻る (AC-10).

- **D-007 (CSS の置き場所)**: `web/src/ui/project-toggle/project-toggle.css` にローカル CSS を置く. BL-046 のデザイントークン基盤 (`tokens.css`) が整い次第, 色値・余白を CSS 変数に差し替える PR を別途出す.

- **D-008 (キーボード矢印 / 数字キー / 逆巡回は初版に含めない)**: spec U-1 のとおり, 「Tab + Enter / Space で順方向巡回」のみで初版を確定する. 逆巡回 / 直接ジャンプは追加 BL で扱う.

## リスク / 代替案

- **リスク R-1 (プロジェクト数が多い場合の UX 劣化)**:
  プロジェクトが 5 件以上になると, トグルで目的の値にたどり着くまでに複数タップが必要となる. → 緩和策: project.md の前提 (個人利用) では 1 桁プロジェクトが想定されており, 初版はこれで十分とする. プロジェクト数が増えたら別 BL で「もっと見る」「フィルタ」を導入する (spec U-2).

- **リスク R-2 (a11y の `aria-live` 過剰通知)**:
  ボタンをタップする度に `<span aria-live="polite">` が再生されると, screen reader が連続して読み上げる可能性. → 緩和策: `aria-live="polite"` を採用 (assertive ではなく) し, ユーザーの読み上げ流れに沿うタイミングで通知する.

- **リスク R-3 (既存 `projects.spec.ts` E2E の破壊)**:
  `e2e/projects.spec.ts` の「プロジェクトを削除すると紐付いていたタスクは残る (カスケード null)」テストが `page.getByLabel("プロジェクト (任意)").selectOption(...)` を呼んでおり, `<select>` 前提のコードになっている. → 緩和策: T-003 で「トグルを X 回クリックして目的のプロジェクトに合わせる」経路に書き換える. 削除カスケードの本質 (projectId が null になる) は無傷.

- **リスク R-4 (既存 `today-view.test.tsx` / `tomorrow-view.test.tsx` の広範な改修)**:
  プロジェクト関連 it が 3〜4 件存在. → 緩和策: T-002 で「プロジェクト関連 it のみ」を書き換え, 他の it (期限切替 / 完了 / 削除 / focus / 優先度) には触らない.

- **代替案 (採用しない)**:
  - 案 A: `<select>` を残して見た目だけボタン化する → spec REQ-1 の「`<select>` を使わない」に反するため却下.
  - 案 B: ラジオボタングループでプロジェクトを横並び表示 → プロジェクト数が増えると幅が破綻し, モックの「1 個の横長ボタン」と一致しない. 却下.
  - 案 C: コンテキストメニュー (右クリック / 長押し) でプロジェクトを選ぶ → タップ数は減るが「1 タップで進む」のシンプルさを失い, モックの注記「(トグルで選択)」と一致しない. 却下.

## テスト方針

> 全体方針は [`../../quality/test-catalog.md`](../../quality/test-catalog.md).

### 単体 (vitest + @testing-library/react)

`web/__tests__/project-toggle.test.tsx` を新規作成. 最低 7 件:

- 構造: 1 個のボタンが存在し, 初期表示が「（未分類）」 (REQ-1, AC-1).
- クリック 1 回で `projects[0]` に進み, `onChange("p-1")` が呼ばれる (REQ-2).
- 末尾クリックで `null` に戻り, `onChange(null)` が呼ばれる (REQ-2).
- `projects` が空のとき, クリックしても `onChange` が呼ばれない (AC-6).
- 削除済 id (`value` が `projects[]` に無い id) のとき, クリックで `onChange(null)` (D-005).
- aria-label に「現在 ＜name＞」が含まれる (REQ-4).
- Tab + Space / Enter で巡回が動く (REQ-4 / AC-7).

### 結合 (today-view.test.tsx 改修)

既存 `describe("TodayView (BL-016 プロジェクト選択 UI)", ...)` 配下の 3 件 (起票フォーム表示 / プロジェクト選択して起票 / 未選択で起票) を書き換え:

- `screen.findByLabelText(/プロジェクト/)` → トグルボタンの取得 (`screen.getByRole("button", { name: /プロジェクト/ })` 等) に変更.
- `userEvent.selectOptions(...)` → `userEvent.click(toggleButton)` に変更.
- 起票時の `projectId` 送信 assert (`PROJECT_ID_P1` / `null`) は維持.

加えて, 起票フォーム要素列挙の it (305-326 行付近, "起票フォームはタスク名のみ必須である" シナリオ) で `<select id="task-project">` の存在を assert している箇所を, トグルボタンの存在に書き換える.

### 結合 (tomorrow-view.test.tsx 改修)

シナリオ A (起票フォーム要素列挙) と起票時 `projectId` の assert (454-555 行付近) を修正:

- `screen.queryByLabelText(/プロジェクト/)` → トグルボタンの取得 (`screen.getByRole("button", { name: /プロジェクト/ })`) に変更.
- 起票時 `projectId === null` の assert は維持 (D-004 の `"" → null` 変換が動くこと).
- カード上のプロジェクト表示テストは無修正 (非ゴール).

### E2E (project-toggle.spec.ts 新規)

新規 `e2e/project-toggle.spec.ts` 1 件:

- Given: プロジェクト "仕事" "個人" を事前作成.
- When: /today を開き, タスク名入力 + プロジェクトトグルを 1 回クリック ("仕事" 状態) + 「追加」.
- Then: 作成されたタスクの projectId が "仕事" の id と一致する (画面上の表示 or repository.list で確認).

### E2E (projects.spec.ts 改修)

既存テスト「プロジェクトを削除すると紐付いていたタスクは残る (カスケード null)」 (e2e/projects.spec.ts 16- 行):

- `page.getByLabel("プロジェクト (任意)").selectOption({ label: projectName })` を, トグルボタンを目的のプロジェクトまでクリックする経路に書き換え.
- 「目的のプロジェクトが現れるまでクリック」は最大 N 回 (= プロジェクト数) で必ず到達するため決定論的.
- 削除カスケードの本質 (projectId が null になる) の assert は無修正.

### E2E (a11y.spec.ts 既存)

修正不要. axe で violations === 0 を維持できることを最終確認 (T-008 で auditor が確認).

### 手動確認 (auditor 用チェックリスト)

- /today の起票フォームでトグルを 1 周クリックし, 全選択肢が現れることを確認.
- 「（未分類）」で起票したタスクが「プロジェクト未指定」として表示される.
- 任意プロジェクトを選んで起票し, 一覧でそのプロジェクト名が副情報として表示される (カード側は無傷).
- /tomorrow でも同様.
- タブ間でプロジェクトを削除した後, 起票画面でトグルが「（未分類）」相当に矯正される (D-005).
