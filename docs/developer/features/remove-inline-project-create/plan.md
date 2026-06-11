# 設計・実装計画: today ヘッダの「＋プロジェクトの追加」ボタン撤去 (remove-inline-project-create)

> [`spec.md`](spec.md) の要件を、どう実現するかに落とす。

## 方針概要

`today-view.tsx` から (1) ヘッダ内のボタン JSX, (2) `projectDialogOpen` state, (3) `ProjectCreateDialog` のマウント JSX, (4) `ProjectCreateDialog` の import 文 の 4 箇所を削除する純粋な「削減」変更. `ProjectCreateDialog` コンポーネント本体および `/projects` 側のプロジェクト作成 UI は無改修. テスト資産については BL-044 で追加した E2E (`e2e/inline-project-create.spec.ts`) を全削除し, BL-047 で追加した「ヘッダ 3 要素同居」テストを削除しつつ「ボタンが存在しないこと」の回帰ガードを 1 件追加する.

## 影響範囲

| 領域 | 変更内容 |
| --- | --- |
| API | 変更なし (`POST /api/v1/projects` 等は無改修) |
| DB | 変更なし |
| ドメイン / サーバ | 変更なし |
| Repository | 変更なし (`ProjectRepository.create` は `/projects` 側から引き続き呼ばれる) |
| UI (削除) | `web/src/ui/today-view/today-view.tsx`: ヘッダボタン JSX / `projectDialogOpen` state / `ProjectCreateDialog` マウント JSX / `ProjectCreateDialog` import 文 (計 4 箇所) |
| UI (温存) | `web/src/ui/project-create-dialog/project-create-dialog.tsx` および `.css` / `web/src/ui/projects-view/projects-view.tsx` / `web/src/ui/tomorrow-view/` / `web/src/ui/focus-view/` / `web/src/ui/app-shell/` (BL-049 のハンバーガーメニュー) |
| 単体テスト (削除) | `web/__tests__/today-view.test.tsx` の BL-047 同居テスト 1 件 (`it("シナリオ: ヘッダに h1「今日」・カウンタ・「＋プロジェクトの追加」ボタンが同居する (REQ-1)", ...)`) |
| 単体テスト (追加) | `web/__tests__/today-view.test.tsx` に「today ヘッダに『＋プロジェクトの追加』ボタンが存在しないこと」を検証する it ブロック 1 件 |
| 単体テスト (コメント修正) | `web/__tests__/today-view.test.tsx` 内の `// BL-044: ヘッダ領域に「＋プロジェクトの追加」button が増えたため` コメント (複数箇所) を「BL-050 で撤去済み」に文面更新. テストロジックは無変更 |
| 単体テスト (温存) | `web/src/ui/project-create-dialog/project-create-dialog.test.tsx` は無改修 |
| E2E (削除) | `e2e/inline-project-create.spec.ts` (ファイル全体) |
| E2E (修正) | `e2e/a11y.spec.ts` の「`/today` モーダル展開状態」スキャン (BL-044 で追加された 1 件) を削除. 既存 7 view のスキャンは変更しない |
| E2E (温存) | `e2e/projects.spec.ts` / `e2e/project-toggle.spec.ts` / その他既存 E2E |

## 設計詳細

### データモデル

変更なし. UI state の削減のみ:

- `projectDialogOpen: boolean` (`useState(false)` で宣言) → 削除.
- `projectId: string` (`useState("")`) は維持 (起票フォーム内 `ProjectToggle` が値設定を担う).

### コンポーネント設計

`today-view.tsx` の差分のみ. 削除前後の構造比較:

**削除前** (現行 ≒ BL-044 / BL-047 後の状態):

```tsx
import { ProjectCreateDialog } from "../project-create-dialog/project-create-dialog.js";
// ...
const [projectDialogOpen, setProjectDialogOpen] = useState(false);
// ...
<header className="today-view__header">
  <h1>今日</h1>
  <span aria-label="今日の完了タスク数">今日の完了: {completionCount}</span>
  <button type="button" onClick={() => setProjectDialogOpen(true)}>
    ＋プロジェクトの追加
  </button>
</header>
// ...
<ProjectCreateDialog
  repository={projectRepository}
  open={projectDialogOpen}
  onClose={() => setProjectDialogOpen(false)}
  onCreated={(project) => setProjectId(project.id)}
/>
```

**削除後** (本 BL の最終状態):

```tsx
// (import 文から ProjectCreateDialog の行を削除)
// (projectDialogOpen state の宣言を削除)
// ...
<header className="today-view__header">
  <h1>今日</h1>
  <span aria-label="今日の完了タスク数">今日の完了: {completionCount}</span>
</header>
// ...
// (ProjectCreateDialog のマウント JSX を丸ごと削除)
```

- `projectId` / `setProjectId` は起票フォーム内 `<ProjectToggle value={...} onChange={(next) => setProjectId(next ?? "")} />` で引き続き使用されるため温存する.
- `setProjectId(project.id)` (= 自動選択経路) の呼出は本 BL で唯一の参照箇所 (`ProjectCreateDialog` の `onCreated`) が消えるため自然に消滅する. これに伴う他箇所への影響は無い (`/projects` で作成 → today に戻る経路では自動選択は元から発生しない).
- `projectRepository` prop は無改修. 起票フォーム内の `useQuery({ queryKey: ["projects"], queryFn: () => projectRepository.list() })` で引き続き利用される.

### 処理フロー

本 BL は「機能の追加」ではなく「UI 経路の削減」のため, 新しい処理フローは無い. 既存の経路は以下のように整理される:

| 経路 | BL-050 前 | BL-050 後 |
| --- | --- | --- |
| today からプロジェクト追加 (モーダル) | ヘッダボタン → モーダル → `POST /api/v1/projects` → トグル即時反映 + 自動選択 | **削除** |
| `/projects` からプロジェクト追加 (インラインフォーム) | ProjectsView 内フォーム → `POST /api/v1/projects` → 一覧反映 | 維持 |
| today / tomorrow のプロジェクト選択 (起票時) | `<ProjectToggle />` 巡回 | 維持 |
| ハンバーガーメニュー → `/projects` | BL-049 で導入 (任意 view から到達可) | 維持 |

### 例外 / エラー処理

- 削除に伴う新規の例外経路は無い.
- `ProjectCreateDialog` 内部の `notifyError` 経路は `/projects` 側からの呼出があれば動作し続ける. 呼出が無いなら未到達コードになるが, 本 BL では削除しない (REQ-3 / 非ゴール).

## 重要な決定

- **D-001 (削除ファースト. `/projects` 起点への移植は行わない)**: 「today ヘッダのボタン → モーダル」の経路に独自の検証価値は無く (= サーバ側挙動は `/projects` 起点と同一), 削除のみで UI 重複の解消というゴールに到達する. 起点付け替えは `e2e/projects.spec.ts` との重複テストを生むだけのため不採用.
- **D-002 (`ProjectCreateDialog` コンポーネント本体は残す)**: `/projects` 側で利用される可能性 + 将来の再利用余地があるため. 削除コストの単純化と, 機能の物理的ロールバック (= プロジェクト追加モーダル自体の廃止) を回避する観点.
- **D-003 (`e2e/inline-project-create.spec.ts` はファイル全削除)**: spec U-1 で確定. `e2e/projects.spec.ts` で `/projects` 起点の作成は既にカバーされており, ファイルを残す動機が無い. 「念のため起点付け替えで残す」は重複テストを増やすだけで保守コストが上がる.
- **D-004 (BL-047 の「3 要素同居」テストを 1 件削除し, 代わりに「ボタンが存在しないこと」を 1 件追加する)**: BL-047 で確定した「h1 → カウンタ → ＋プロジェクトの追加」の DOM 順序のうち 3 要素目が消えるため, 当該 it ブロックは前提が崩れる. 削除と同時に「ボタンが存在しない」の回帰ガードを置くことで, 将来の誤マージ (=「＋プロジェクトの追加」ボタンを再追加するコミット) を CI で阻止する.
- **D-005 (BL-047 の spec.md は変更しない)**: spec U-3 の判断. BL-050 は BL-047 が定めた「DOM 順序 = h1 → カウンタ → ＋プロジェクトの追加」のうち 3 要素目を撤去する形で上書きするが, 完了済み spec の改変ではなく後続 BL の責務として記述する (本 BL spec の関連 BL 一覧で明示). BL-047 spec への遡及更新が必要なら別 BL.
- **D-006 (a11y E2E の「モーダル展開状態」スキャンを 1 件削除)**: BL-044 で `e2e/a11y.spec.ts` に追加されたモーダル展開スキャンは, 起点ボタンが消えるため再現不能になる. 既存 7 view のスキャンは無改修.
- **D-007 (ナビゲーション / ハンバーガーメニューへの追加機能は持たない)**: 「ハンバーガーメニュー直下にプロジェクト追加ショートカットを置く」のような代替導線は本 BL では作らない. `/projects` への遷移経路で十分とユーザー判断済み.
- **ADR は起票しない**: 本 BL の判断は UI 経路の局所削減であり, アーキテクチャ判断には至らない.

## リスク / 代替案

- **リスク: `ProjectCreateDialog` のコンポーネント本体が誰からも参照されなくなる (dead code 化)**. 緩和: plan 段階で `web/src/` 内の参照を grep で確認する. ProjectsView が利用しているなら現状維持. 利用が無い場合でも温存 (D-002) するが, 別 BL で「dead code 削除」を起票するか auditor に判断を委ねる.
- **リスク: 既存テスト (今日ビュー単体) の他の it ブロックでヘッダ内 button への暗黙依存が残っている**. 緩和: `BL-044` を grep して全コメント箇所を確認し, テストロジック (= `within(form).getByRole("button", ...)` で scope 限定) が依然として正しく動作することを確認する (撤去後はそもそも form 外に「追加」ラベル button が無くなるため `getByRole("button", { name: "追加" })` も曖昧性なく機能する).
- **リスク: BL-051 (unified-day-view) と作業時期が近接した場合の競合**. BL-051 は HTML 構造とクラス体系の統一を目指すため, ヘッダ要素の構成が変わる. 緩和: BL-050 は BL-051 より先に着手し, BL-051 開始時にはヘッダが 2 要素 (h1 + カウンタ) になっている前提とする. backlog の依存欄でも BL-051 は BL-050 依存と記載済み.
- **リスク: `/projects` 画面の作成フォームが「（未分類）」しか持たないなど想定外の状態**. 緩和: plan 段階で `web/src/ui/projects-view/projects-view.tsx` を確認し, 作成フォーム / 名称変更 / 削除の存在を確認する. 既存 `e2e/projects.spec.ts` も同様に確認する.
- **代替案 (不採用): 起点を `/projects` に付け替えて E2E を残す**. spec U-1 / D-003 の根拠で不採用.
- **代替案 (不採用): モーダルコンポーネント本体も削除**. `/projects` 側での利用 / 将来の再利用余地を残すため不採用 (D-002).
- **代替案 (不採用): 撤去ではなくハンバーガー側の「プロジェクト」リンクの方を削除**. ユーザー要望 (今日ヘッダのボタン撤去) と逆方向の対応であり, 「全 view から `/projects` に到達できる」というハンバーガー導入のメリットを損なうため不採用.

## テスト方針

> 全体方針は [`../../quality/test-catalog.md`](../../quality/test-catalog.md)。

### 重点確認

1. **「ヘッダにボタンが存在しないこと」の回帰ガード**: AC-1 を `web/__tests__/today-view.test.tsx` (vitest + jsdom) で確実にカバーする. 将来「＋プロジェクトの追加」ボタンを再追加するコミットが入った瞬間に red にする.
2. **`/projects` 経路の維持**: AC-3 / AC-4 を Playwright E2E でカバーする. 新規テストは原則書かず, 既存 `e2e/projects.spec.ts` のシナリオが green を維持することで担保する. 不足があれば 1 件補強する (spec U-2).
3. **a11y violations 0 件の維持**: AC-6. 既存 `e2e/a11y.spec.ts` から「`/today` モーダル展開状態」スキャンを削除し, 残りの 7 view スキャンが green であることを確認する.
4. **テスト資産の整合性**: AC-7 / AC-8 / AC-9 を grep / ファイル存在チェックで確認する.

### テスト追加 / 削除サマリ

- **追加**: `web/__tests__/today-view.test.tsx` に「today ヘッダに『＋プロジェクトの追加』ボタンが存在しない」を検証する it ブロック 1 件. BL-050 の describe (新規) を作るか, BL-047 describe 配下に置くかは実装者判断 (本 BL の目印になる describe 名「BL-050 / today ヘッダのボタン撤去」を使うのが望ましい).
- **削除**: 
  - `e2e/inline-project-create.spec.ts` (ファイル全体, 約 506 行).
  - `web/__tests__/today-view.test.tsx` 内の `it("シナリオ: ヘッダに h1「今日」・カウンタ・「＋プロジェクトの追加」ボタンが同居する (REQ-1)", ...)` 1 件.
  - `e2e/a11y.spec.ts` 内の「`/today` モーダル展開状態」スキャン (BL-044 で追加された 1 件).
- **コメント文面のみ修正** (テストロジック無変更): `web/__tests__/today-view.test.tsx` 内の `// BL-044: ヘッダ領域に「＋プロジェクトの追加」button が増えたため` コメント (約 10 箇所) を「`// BL-050: ヘッダから「＋プロジェクトの追加」button を撤去 (元は BL-044 で追加されていた)`」のような文面に更新する. テスト挙動には影響しない.
- **無変更**: `web/src/ui/project-create-dialog/project-create-dialog.test.tsx` (コンポーネント本体の単体テスト).

### テスト実行コマンド

- web 単体テスト: `cd web && pnpm test`
- E2E: `pnpm e2e` (リポジトリ全体. inline-project-create.spec.ts が消えるため shard の構成変更は不要)
- lint / typecheck: 既存 CI と同じコマンドで実行.
