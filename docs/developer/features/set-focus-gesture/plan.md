# 設計・実装計画: 「現在に設定」操作の導線再設計 (set-focus-gesture)

> [`spec.md`](spec.md) の要件を、どう実現するかに落とす。

## 方針概要

BL-042 で撤去した `setFocusMutation` / `handleSetFocus` を `today-view.tsx` に再導入し (git 履歴 `4f2089c~1` の実装が下敷きにできる), タスク一覧の各カードに状態系コントロール `<button>` 「現在のタスクにする」を追加する. サーバ / ドメイン / Repository 層は無改修 (`PUT /api/v1/focus` と `TaskRepository.setFocus` は BL-006 のまま再利用). 変更は web クライアントの today-view 1 ファイル + E2E のみで完結する.

## 影響範囲

| 領域 | 変更内容 |
| --- | --- |
| API | 変更なし (`PUT /api/v1/focus` を既存仕様のまま呼ぶ. openapi.yaml 無改修) |
| DB | 変更なし (`FocusSelection` 既存スキーマのまま) |
| ドメイン / サーバ | 変更なし (`clearFocusIfMatches` 等の自動解除ロジックも無改修) |
| Repository | 変更なし (`TaskRepository.setFocus` は HTTP / Local 両実装済み) |
| UI | `web/src/ui/today-view/today-view.tsx`: `setFocusMutation` + `handleSetFocus` 再導入, 一覧カードに「現在のタスクにする」button 追加. `tomorrow-view` / `focus-view` は無改修 |
| E2E | 新規 `e2e/set-focus-gesture.spec.ts` (AC-1〜AC-3, AC-5〜AC-9). `e2e/state-restoration.spec.ts` の skip 解除 + 新ラベル追随 (AC-4). `e2e/a11y.spec.ts` は既存のまま green 維持 (AC-10) |

## 設計詳細

### データモデル

変更なし. 使用する既存モデル:

- `FocusSelection { id: "singleton", currentTaskId: string | null, version: number, updatedAt }` (BL-006)
- `SetFocusCommand { taskId: string | null, ifMatch: number }` (`web/src/repositories/task-repository.ts` に定義済み)

### 処理フロー (明示 focus 設定)

1. ユーザーが一覧カードの「現在のタスクにする」button を作動 (クリック / タップ / Enter / Space).
2. `handleSetFocus(task.id)`:
   - `focus` query の data が未ロードなら no-op (spec REQ-2).
   - `setFocusMutation.mutate({ taskId: task.id, ifMatch: focusData.version })`.
3. `setFocusMutation` (旧 BL-006 実装と同型):
   - Idempotency-Key を生成し, `PUT /api/v1/focus` のエントリを offline-queue に enqueue.
   - offline なら楽観成功で終了. online なら `repository.setFocus(cmd)` を実行し, 成功時に queue エントリを dequeue.
4. `onSuccess`: `["today"]` / `["focus"]` を invalidate → 再フェッチで強調セクションに反映. query key は focus-view と共有しているため `/focus` 側も自動で追随する (BL-037 D-003).
5. `onError`: `notifyError("通信に失敗しました")` + **`["focus"]` を invalidate** (spec REQ-7 の再試行可能性. 旧実装からの差分).

### UI 配置 (today-view 一覧カード)

```
<li>
  <span>{task.name}</span>
  <PriorityStars ... />
  <button type="button">現在のタスクにする</button>   ← 新規 (状態系グループ. アクション 3 ボタンの前)
  <button type="button">削除</button>
  <button type="button">明日にする</button>           ← origin="routine" では非表示 (既存)
  <button type="button">完了</button>
</li>
```

- 強調セクション (`<section aria-label="現在のタスク">`) には追加しない.
- 視覚スタイルは暫定 (素の button). `/* TODO(BL-046) */` マーカーを残す.

### 例外 / エラー処理

| 事象 | 挙動 |
| --- | --- |
| online 412 (`OptimisticLockError`) | `notifyError("通信に失敗しました")` + `["focus"]` invalidate. ConflictDialog は使わない (task エントリ前提の機構のため. spec REQ-7) |
| ネットワークエラー / 401 | 同上 |
| offline | enqueue 済みエントリをオンライン復帰時に flush (BL-018 既存機構) |
| focus query 未ロード中の作動 | no-op (`if (!focusData) return`) |
| `dueDate="tomorrow"` のタスクへの設定 | UI 上発生しない (tomorrow ビューに button を置かない. サーバ側の `INVALID_FOCUS_TARGET` ガードは既存のまま) |

## 重要な決定

- **D-001 (UX = カード上の専用コントロール)**: 長押し / コンテキストメニュー / カードタップを退け, 常時表示のネイティブ `<button>` を採用. 根拠は spec §「UX の決定」(単一実装でマウス / タッチ / キーボード同等, 発見可能性, E2E 決定論性, foundation REQ-5 の許容候補). UI レイヤ内の局所決定であり foundation の規約の枠内のため **ADR は起票しない**.
- **D-002 (アクション 3 ボタン規約との整合)**: 本コントロールは `PriorityStars` と同じ「状態系コントロール」分類とし, foundation REQ-3 のカウント外とする (spec §「foundation REQ-3 との整合」).
- **D-003 (解除 UI 非提供)**: focus の解除は FR-013 の自動解除のみ. `PUT /focus { taskId: null }` は UI から呼ばない (spec REQ-4).
- **D-004 (tomorrow ビュー非対象)**: FR-012 + サーバの `INVALID_FOCUS_TARGET` ガードに従い, button を置かない (spec REQ-5).
- **D-005 (失敗時の `["focus"]` invalidate)**: 旧実装は onError で invalidate しなかったため, 412 後に stale な `version` が残り再試行が失敗し続ける問題があった. 本 BL で onError でも `["focus"]` を invalidate する.
- **D-006 (412 を ConflictDialog に乗せない)**: `ConflictDialog` / `ConflictError` は task の編集衝突向けに設計されており, `FocusSelection` の衝突 (単一ユーザー前提では多タブ時のみ発生) に転用する価値が薄い. `notifyError` + 再フェッチで足りる.
- **D-007 (ラベル「現在のタスクにする」)**: backlog BL-043 の文言に一致させる (spec U-1). skip 中 E2E の旧ラベル「現在に設定」は skip 解除時に新ラベルへ更新する.

## リスク / 代替案

- **リスク: ボタン追加によるカードの視覚的密度上昇**. BL-042 で 6 → 3 に減らした操作肢が実質 4 つに見える懸念. 緩和: 状態系グループ (PriorityStars 側) に寄せて配置し, BL-046 のトークン適用時にアイコン化 / 弱い視覚ウェイトを検討 (spec U-2). 代替案だった「不可視ジェスチャ」は発見可能性とアクセシビリティで劣後するため不採用.
- **リスク: Tab ストップ増加によるキーボード巡回の長さ**. カードあたりのフォーカス可能要素が増える. BL-029 の方針 (最低限のキーボード保証) の範囲では許容. 将来 ARIA 設計の見直し (roving tabindex 等) が必要なら別 BL で扱う.
- **リスク: 旧実装の単純復元による仕様の取りこぼし**. 旧実装は「現在解除」も含んでいた. 本 BL では設定のみ再導入し, 解除を復元しないことをテストで担保する (AC-8).

## テスト方針

> 全体方針は [`../../quality/test-catalog.md`](../../quality/test-catalog.md)。

- **E2E (Playwright) を主体とする**. today-view にはコンポーネント単体テストが存在せず, 本 BL の検証対象は「UI 導線 → サーバ反映 → 別ビュー反映」の貫通経路のため.
  - 新規 `e2e/set-focus-gesture.spec.ts`: AC-1 (button の存在 / 不在), AC-2 (クリック → 強調セクション反映 + `GET /api/v1/focus` の API 検証), AC-3 (/focus 反映 = 完了の目安), AC-5 (キーボードのみ. `keyboard.spec.ts` のパターン踏襲), AC-6 (routine 由来), AC-7 (tomorrow 非対象), AC-8 (解除 UI 不在 + 完了での自動解除), AC-9 (失敗時バナー. `page.route` で 412 / abort を注入).
  - `e2e/state-restoration.spec.ts`: skip 解除 + ラベルを「現在のタスクにする」に更新 (AC-4).
  - `e2e/a11y.spec.ts`: 既存のまま green を維持 (AC-10).
- **サーバ / Repository の単体・統合テスト**: 追加しない (無改修のため. BL-006 の既存テストでカバー済み).
- **重点確認**: (1) 明示設定後の強調対象が暗黙フォールバックではなく `currentTaskId` 由来であること (リロード復元で判別する), (2) 失敗時に再試行可能であること (D-005), (3) focus-view / tomorrow-view の無改修 (回帰).
