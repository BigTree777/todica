# タスク: カード系ボタンをアイコンに置換 + 起票カードのキャンセルを右上「閉じる ✕」に移設

> [`plan.md`](plan.md) を実行可能な単位に分解する。完了したらチェックを入れる。

## 前提整備

- [x] T-0-1 (管理者): `web/package.json` に `lucide-react` を `dependencies` に追加する
      (plan.md D-001 / 最新の `^0.4xx.0` を確認して固定). `npm install` で lock を更新する.
- [x] T-0-2 (管理者): `npm install` 後の bundle 影響確認は実装後 (T-2 完了後) に `vite build` で
      bundle size を 1 度測る. 著しい増加 (> 100 KB gzip) があれば named import 漏れを点検する.

## テスト設計 (test-designer)

- [x] T-1-1: 新規テストファイル `web/__tests__/card-buttons-iconify.test.tsx` を作成し,
      spec.md AC-1 〜 AC-11 を網羅する失敗テストを書く (= 現状コードでは red).
      - AC-1: TaskCard の 5 button (完了 / 削除 / 現在のタスクにする / 明日にする / 今日にする)
        が `aria-label` + 子 `<svg aria-hidden="true">` を持つ (5 it / 描画経路は dueDateMode と
        showSetFocus / actionSet を切替えて全 5 種を網羅).
      - AC-2: ProjectCard 削除 button (1 it).
      - AC-3: RoutineCard 削除 button (1 it).
      - AC-4: 3 起票カードでキャンセル button が DOM 上に存在しない
        (textContent / aria-label / accessibleName のいずれも「キャンセル」が無い / 3 it).
      - AC-5: 3 起票カード root 直下に accessibleName「閉じる」 button が 1 個存在し
        click で onCancel mock が呼ばれる (3 it).
      - AC-6: 「閉じる」 button が `type="button"` で onSubmit を発火しない (1 it / TaskFormCard 代表).
      - AC-7: 3 起票カードで `type="submit"` の button が `aria-label="追加"` + `svg[aria-hidden='true']` を持つ
        (3 it).
      - AC-8 / AC-9: today-view の Escape / ✕ → close + + ボタン focus 復帰
        (`document.activeElement === button.app-shell__create` / 2 it).
      - AC-10: 各 icon button の `getComputedStyle(...).minWidth` / `.minHeight` が "44px"
        (代表 3 it: TaskCard 削除 / TaskFormCard 閉じる / TaskFormCard 追加).
        jsdom で観察できない場合は `button.classList.contains("card-action-button")` で間接観察に
        フォールバック (plan.md R-2 / D-008).
      - AC-11: 任意 icon button の svg が `aria-hidden="true"` を持つ (1 it).
- [x] T-1-2: `web/__tests__/common-button-style.test.tsx` の `findButtonClassNameByLabel` helper を
      「textContent または `aria-label` 属性値で hit」する形に拡張する (helper 1 関数の改修).
      改修後, 既存 AC の挙動が壊れないことを確認する.
- [x] T-1-3 (test-designer 範囲): 既存 textContent ベース assertion を持つテストファイルに対し,
      本 BL の改修後に red になる箇所をリストアップしてコメントで明記する.
      対象: task-card-component / task-card-hotfix / inline-edit-all-cards /
      project-card-component / routine-card-component の 5 ファイル.
      改修自体は implementer が行う (T-3-2 〜 T-3-6).
- [x] T-1-4: `npx vitest run` をリポジトリルートで実行して T-1-1 の全 it が red であることを確認する
      (failing tests を control サンプルとして残す).

## 実装 (implementer)

- [x] T-2-1: `web/src/ui/task-card/task-card.tsx` の 5 button を Lucide アイコン化する.
      - 子要素を SVG 単独 (`<Check size={18} aria-hidden="true" />` 等) に置換.
      - 各 button に `aria-label="削除"` / `"完了"` / `"現在のタスクにする"` / `"明日にする"` / `"今日にする"` を付与.
      - 各 button の className に `card-action-button` を追加 (既存 className は維持).
      - 既存 onClick / type / 配置制御 className (`task-card__actions__delete` 等) は無変更.
- [x] T-2-2: `web/src/ui/task-card/task-form-card.tsx` を改修.
      - root `<form>` 直下第一子に右上 ✕ button (`<X size={18} aria-hidden="true" />` + `aria-label="閉じる"` + `type="button"` + `onClick={onCancel}`) を追加.
      - className: `button card-action-button task-card__close`.
      - 既存 `.task-card__actions` 内の「キャンセル」 button を **撤去**.
      - 既存 `.task-card__actions` 内の「追加」 button を Lucide `Plus` に置換
        (`aria-label="追加"` / `card-action-button` を className に追加).
- [x] T-2-3: `web/src/ui/project-card/project-card.tsx` の「削除」を Lucide `Trash2` に置換
      (`aria-label="削除"` / `card-action-button` を追加).
- [x] T-2-4: `web/src/ui/project-card/project-form-card.tsx` を改修.
      - root `<form>` 直下に右上 ✕ button (`project-card__close`) 追加 + 既存「キャンセル」撤去.
      - 「追加」 submit を Lucide `Plus` に置換.
- [x] T-2-5: `web/src/ui/routine-card/routine-card.tsx` の「削除」を Lucide `Trash2` に置換
      (`aria-label="削除"` / `card-action-button` を追加).
- [x] T-2-6: `web/src/ui/routine-card/routine-form-card.tsx` を改修
      (T-2-2 / T-2-4 と同形 / `routine-card__close`).
- [x] T-2-7: `web/src/ui/task-card/task-card.css` に以下を追加.
      - `.card-action-button { min-width: 44px; min-height: 44px; padding: var(--space-sm); display: inline-flex; align-items: center; justify-content: center; }`
      - `.task-card--form { position: relative; padding-top: calc(var(--space-md) + 44px); }`
      - `.task-card__close { position: absolute; top: var(--space-sm); right: var(--space-sm); }`
- [x] T-2-8: `web/src/ui/project-card/project-card.css` に T-2-7 と同形の宣言を追加
      (selector は `.project-card--form` / `.project-card__close`).
- [x] T-2-9: `web/src/ui/routine-card/routine-card.css` に T-2-7 と同形の宣言を追加
      (selector は `.routine-card--form` / `.routine-card__close`).
- [x] T-2-10: `npx vitest run` で T-1 の新規テスト全 it が green になることを確認.

## 既存テスト追従改修 (implementer)

- [x] T-3-1: `web/__tests__/task-card-component.test.tsx` の textContent ベース assertion を
      `aria-label` / accessibleName ベースに書き換え (概算 8 件).
- [x] T-3-2: `web/__tests__/task-card-hotfix.test.tsx` の focus-view actions /
      起票カード「キャンセル」/「追加」 textContent assertion を改修
      (概算 5 件; 「キャンセル」 textContent → 右上 ✕ button + onCancel 観察).
- [x] T-3-3: `web/__tests__/inline-edit-all-cards.test.tsx` の 3 系統「削除」/「キャンセル」 textContent
      assertion を改修 (概算 6 件; AC-3 / AC-6 / AC-11 系の labels 配列マッチを
      `aria-label` 経由に変更).
- [x] T-3-4: `web/__tests__/project-card-component.test.tsx` を改修 (概算 3 件).
- [x] T-3-5: `web/__tests__/routine-card-component.test.tsx` を改修 (概算 3 件).
- [x] T-3-6: `npx vitest run` をリポジトリルートで実行し全件 green を確認する.

## 仕上げ

- [x] T-4-1: `npm run typecheck` (web + ルート) で 0 件.
- [x] T-4-2: `npm run lint` で 0 件.
- [x] T-4-3: `vite build` で警告 / エラー 0 件. bundle size を T-0-2 の通り確認.
- [x] T-4-4: Playwright 全件 green (login → today flow → 起票 → ✕ → Escape の通り抜けを含む).
- [x] T-4-5: 受け入れ基準 spec.md AC-1 〜 AC-13 を全て満たすことを確認.
- [x] T-4-6: auditor へレビュー依頼. 差し戻し時は該当タスクへ戻る.

## ドキュメント

- [x] T-5-1: 本 spec / plan / tasks の chk を埋める. backlog.md の BL-114 を Done に更新する
      (管理者の最終仕上げ).
- [x] T-5-2 (不要): 本 BL は API / DB / domain / Repository 改修なし. project.md / 他 BL spec への波及なし.
