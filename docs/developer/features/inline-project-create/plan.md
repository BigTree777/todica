# 設計・実装計画: 「＋プロジェクトの追加」ボタンを今日ビューに配置 (inline-project-create)

> [`spec.md`](spec.md) の要件を、どう実現するかに落とす。

## 方針概要

新規コンポーネント `<ProjectCreateDialog />` (`web/src/ui/project-create-dialog/`) をネイティブ `<dialog>` 要素で実装し, `today-view.tsx` の見出し領域に置いた「＋プロジェクトの追加」ボタンから `showModal()` で開く. 作成 mutation は ProjectsView の `createMutation` (BL-016 / BL-018 / BL-034 慣行) と同型でダイアログコンポーネント内に閉じ込め, 成功時に `["projects"]` を invalidate + `onCreated(project)` コールバックで today-view の `projectId` state に自動選択を反映する. サーバ / ドメイン / Repository 層は無改修.

## 影響範囲

| 領域 | 変更内容 |
| --- | --- |
| API | 変更なし (`POST /api/v1/projects` を既存仕様のまま呼ぶ. openapi.yaml 無改修) |
| DB | 変更なし |
| ドメイン / サーバ | 変更なし (`INVALID_PROJECT_NAME` バリデーション等は既存のまま) |
| Repository | 変更なし (`ProjectRepository.create` / `HttpProjectRepository` は BL-016 実装をそのまま使う) |
| UI (新規) | `web/src/ui/project-create-dialog/project-create-dialog.tsx` + `project-create-dialog.css` (visually-hidden 不要なら css は最小. `::backdrop` 含む. `/* TODO(BL-046) */` マーカー) |
| UI (変更) | `web/src/ui/today-view/today-view.tsx`: ヘッダ領域に「＋プロジェクトの追加」button + open state + `<ProjectCreateDialog />` 設置 + `onCreated` で `setProjectId(project.id)`. `tomorrow-view` / `focus-view` / `projects-view` は無改修 |
| 単体テスト | 新規 `web/src/ui/project-create-dialog/project-create-dialog.test.tsx` (開閉 / 送信 / エラー保持) |
| E2E | 新規 `e2e/inline-project-create.spec.ts` (AC-1〜AC-11). `e2e/a11y.spec.ts` に「/today モーダル展開状態」のスキャンを 1 件追加 (AC-12) |

## 設計詳細

### データモデル

変更なし. 使用する既存モデル:

- `Project { id, name, version, createdAt, updatedAt }` (`web/src/repositories/project-repository.ts`)
- `CreateProjectCommand { id: string, name: string }` (id はクライアント生成 UUID. ProjectsView と同じ `generateId()` 流儀)

### コンポーネント設計

```tsx
// web/src/ui/project-create-dialog/project-create-dialog.tsx
export interface ProjectCreateDialogProps {
  repository: ProjectRepository;
  open: boolean;
  /** キャンセル / Escape / 作成成功 のいずれでも呼ばれる (親が open=false にする) */
  onClose: () => void;
  /** オンライン成功時のみ, 作成された Project を渡す (自動選択用. spec REQ-4) */
  onCreated: (project: Project) => void;
}
```

- `open` prop と `<dialog>` の実 DOM 状態は `useEffect` + `ref` で同期する (`open=true → dialog.showModal()`, `open=false → dialog.close()`).
- Escape は `<dialog>` の `cancel` イベント → `onClose()` で React state に同期する. backdrop クリックでは閉じない (クリックハンドラを置かない. spec REQ-5).
- 名称入力はダイアログ内ローカル state. `onClose` 時 (成功 / キャンセル / Escape) にクリアし, 失敗時は保持する (spec REQ-5 / REQ-7).
- 初期フォーカス: 名称入力に `autoFocus` を付ける (`showModal()` のデフォルトフォーカスを入力欄に固定する).
- 構造:

```tsx
<dialog ref={ref} aria-labelledby="project-create-title" onCancel={...}>
  <h2 id="project-create-title">プロジェクトの追加</h2>
  <form aria-label="プロジェクト追加フォーム" onSubmit={handleSubmit}>
    <label htmlFor="inline-project-name">プロジェクト名</label>
    <input id="inline-project-name" type="text" required maxLength={200} autoFocus ... />
    <button type="submit" disabled={createMutation.isPending}>追加</button>
    <button type="button" onClick={onClose}>キャンセル</button>
  </form>
</dialog>
```

### 処理フロー (プロジェクト追加)

1. ユーザーが today-view ヘッダの「＋プロジェクトの追加」button を作動 → `setDialogOpen(true)` → `dialog.showModal()`. フォーカスが名称入力へ.
2. 名称を入力し「追加」(または Enter) → `handleSubmit`:
   - `e.preventDefault()`. 空名称は `required` でブラウザが抑止 (`if (!name) return` の二重ガードも置く).
   - `createMutation.mutateAsync({ id: generateId(), name })`.
3. `createMutation` (ProjectsView `createMutation` と同型):
   - Idempotency-Key を生成し `POST /api/v1/projects` エントリを offline-queue に `safeEnqueue`.
   - `!navigator.onLine` なら楽観成功 (`undefined` を返す). online なら `repository.create(cmd)` 実行 → 成功時に queue エントリを `safeDequeueByKey`.
4. `onSuccess(result)`:
   - `["projects"]` を invalidate → today / tomorrow の `<ProjectToggle />` が再フェッチ後に新プロジェクトを巡回に含める (即時反映).
   - `result` が `Project` のとき (= オンライン成功) のみ `onCreated(result)` → today-view が `setProjectId(result.id)` (自動選択. spec REQ-4 / REQ-8).
   - 名称入力をクリアし `onClose()` → ダイアログが閉じ, フォーカスは開いたボタンに復帰 (`showModal()` ネイティブ挙動).
5. `onError`: `notifyError("通信に失敗しました")`. ダイアログは閉じず入力を保持する (spec REQ-7).

### today-view 側の変更

```tsx
<main>
  <h1>今日</h1>
  <button type="button" onClick={() => setDialogOpen(true)}>＋プロジェクトの追加</button>  {/* 新規. ヘッダ領域 */}
  ...
  <ProjectCreateDialog
    repository={projectRepository}
    open={dialogOpen}
    onClose={() => setDialogOpen(false)}
    onCreated={(p) => setProjectId(p.id)}
  />
</main>
```

- 既存の起票フォーム / タスクカード / 強調セクション / ConflictDialog には触らない.
- `projectRepository` prop は既存 (BL-016 で導入済み) をそのまま渡す.

### 例外 / エラー処理

| 事象 | 挙動 |
| --- | --- |
| 空名称で送信 | `required` + 二重ガードで POST 抑止. ダイアログ開いたまま (spec REQ-6 / AC-7) |
| 201 文字以上 | `maxLength=200` で入力段階で抑止 (単体テストで検証) |
| 制御文字 | クライアント未検査. サーバ 400 → `notifyError` 経路 (spec REQ-6) |
| サーバエラー / ネットワークエラー | `notifyError("通信に失敗しました")` + ダイアログ開いたまま入力保持 → 再試行可能 (spec REQ-7 / AC-8) |
| 送信中の連打 | 「追加」を `disabled={isPending}` (spec REQ-7) |
| offline | enqueue 済みエントリをオンライン復帰時に flush (BL-018). 楽観成功でダイアログは閉じるが自動選択はしない (spec REQ-8) |
| 412 / ConflictDialog | 発生しない (create は If-Match 無し). ConflictError ハンドリングは置かない (plan D-006) |

## 重要な決定

- **D-001 (ネイティブ `<dialog>` + `showModal()` の採用)**: フォーカストラップ / Escape クローズ / 背面 inert / フォーカス復帰がネイティブで得られ, 独自実装よりコードとテスト表面が小さい. ブラウザサポートは全モダンブラウザ + Android WebView で Baseline 済み. jsdom 25 (本リポジトリの単体テスト環境) も `showModal` をサポートする. 既存 `ConflictDialog` (div + role="dialog") の移行は本 BL ではしない (非ゴール). UI レイヤ内の局所決定のため **ADR は起票しない**.
- **D-002 (ボタンは today のみ)**: モック正本 (foundation §「モックアップ下段」/ REQ-2 / REQ-6) に従う. `["projects"]` query キャッシュは today / tomorrow で共有のため, 反映自体は両ビューに及ぶ (spec AC-10).
- **D-003 (作成成功時の自動選択)**: `onCreated(project)` → `setProjectId(project.id)`. 本導線の動機 (起票中のプロジェクト追加 / NFR-010) に直結し, 「即時反映」の E2E 検証もトグル表面の名前で決定論的に書ける. オフライン時は `Project` が返らないため自動選択しない (spec REQ-8).
- **D-004 (mutation はダイアログコンポーネント内に閉じる)**: today-view は既に大きい (foundation の課題 1). 作成 mutation / enqueue / notifyError はダイアログ側に持たせ, today-view へは `onCreated` の 1 点でだけ結合する. mutation の中身は ProjectsView `createMutation` と同型 (NFR-CONSISTENCY).
- **D-005 (重複名称チェックなし / トリムなし)**: project-crud (BL-016) の確定仕様 (同名許容, サーバ検証が正本) と整合. クライアント独自の検査を増やさない.
- **D-006 (ConflictDialog 非適用)**: create は楽観ロック対象外 (If-Match なし) のため 412 経路が存在しない. `notifyError` のみで足りる.
- **D-007 (backdrop クリックで閉じない)**: 入力途中の誤クリックでの消失を防ぐ. 閉鎖経路は「成功 / キャンセル / Escape」の 3 つに限定 (spec REQ-5).
- **D-008 (ProjectsView 無改修)**: 作成導線が 2 箇所になる重複は許容 (spec U-2). 整理は別 BL でユーザー確認.

## リスク / 代替案

- **リスク: `<dialog>` のネイティブ挙動差 (Android WebView / 旧ブラウザ)**. Baseline 対応済みだが, Capacitor WebView での Escape / フォーカス復帰は E2E (Chromium) と完全同一でない可能性がある. 緩和: E2E は Chromium で検証し, WebView 固有差分は Android 系 BL の手動確認項目に委ねる.
- **リスク: jsdom が `cancel` イベント (Escape) やフォーカストラップを完全再現しない**. 緩和: 単体テストは「開閉 / 送信 / エラー時の入力保持」に限定し, Escape / フォーカス挙動は Playwright E2E を正とする (spec U-5).
- **リスク: 自動選択の副作用** (起票意図がない追加でもトグルが選択状態になる). 緩和: 起票成功時のリセット (BL-041 AC-10) で自然解消. 害が顕在化したら自動選択をオプトアウトする変更は局所 (onCreated の 1 行) で済む.
- **代替案 (不採用): インラインフォーム** (ボタン押下でヘッダ直下にフォーム展開). モーダルよりレイアウトシフトが大きく, モック / backlog の想定 (モーダル) からも外れるため不採用.
- **代替案 (不採用): `ProjectToggle` 内に「+ 新規作成」巡回ポジションを追加**. トグルの「値の巡回」という単純な責務 (BL-041 D-002) を壊し, 巡回中の誤作動でモーダルが開く事故を生むため不採用.

## テスト方針

> 全体方針は [`../../quality/test-catalog.md`](../../quality/test-catalog.md)。

- **E2E (Playwright) を主体とする** (BL-043 と同じ判断. 検証対象が「UI 導線 → サーバ反映 → トグル / 別ビュー反映」の貫通経路のため).
  - 新規 `e2e/inline-project-create.spec.ts`: AC-1 (ボタンの存在 / 不在), AC-2 (モーダル開 + 初期フォーカス + URL 不変), AC-3 (作成 → 閉鎖 → トグル自動選択 = 完了の目安), AC-4 (そのまま起票で projectId 送信), AC-5 (巡回への組み込み), AC-6 (キャンセル / Escape + フォーカス復帰 + 入力破棄), AC-7 (空名称抑止), AC-8 (`page.route` で失敗注入 → バナー + 入力保持 + 再試行), AC-9 (同名許容), AC-10 (/tomorrow トグル + /projects 一覧反映), AC-11 (キーボードのみ. `keyboard.spec.ts` のパターン踏襲).
  - `e2e/a11y.spec.ts`: 既存 7 view の green 維持 + 「/today モーダル展開状態」のスキャン 1 件追加 (AC-12).
- **単体テスト (vitest + jsdom)**: 新規 `project-create-dialog.test.tsx` — open prop と showModal/close の同期, 送信で `repository.create` が呼ばれること, `maxLength=200` / `required` 属性, 失敗時に入力が保持されること, pending 中の disabled.
- **サーバ / Repository のテスト**: 追加しない (無改修. BL-016 の既存テストでカバー済み).
- **重点確認**: (1) 「今日ビュー上から追加 → トグル即時反映」の貫通 (AC-3 / AC-4), (2) 取消経路で POST が飛ばないこと (AC-6 / AC-7), (3) 失敗時の再試行可能性 (AC-8), (4) ProjectsView / tomorrow-view の無改修回帰 (AC-10).
