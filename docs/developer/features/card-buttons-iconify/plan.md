# 設計・実装計画: カード系ボタンをアイコンに置換 + 起票カードのキャンセルを右上「閉じる ✕」に移設

> [`spec.md`](spec.md) の要件を、どう実現するかに落とす。

## 方針概要

- `lucide-react` を新規 dep として 1 件追加し、3 表示カード + 3 起票カードの全アクション button を
  named import の Lucide コンポーネント (`Check` / `Trash2` / `Pin` / `SkipForward` / `SkipBack` /
  `X` / `Plus`) を子に持つ icon button に置換する。
- 各 button は `aria-label` で旧テキストラベルを保持し、SVG 側は `aria-hidden="true"` を付与する
  (WAI-ARIA Icon Button パターン)。
- 起票カード 3 枚は actions 段の「キャンセル」を撤去し、root に `position: relative` を加えて
  右上 `position: absolute` で「閉じる ✕」 button を新設。挙動 (= `onCancel`) は維持。
- タッチ領域は共通クラス `.card-action-button` で `min-width: 44px / min-height: 44px / padding`
  を担保する。3 系統 CSS で同形宣言する (系統独立の既存方針を維持)。

## 影響範囲

| 領域 | 変更内容 |
| --- | --- |
| API | 変更なし (REQ 範囲外 / spec 非ゴール) |
| DB | 変更なし |
| ドメイン / Repository | 変更なし |
| モジュール (新規 dep) | `web/package.json` に `lucide-react` を 1 件追加 (`^0.4xx.0` 系最新) |
| UI (TSX) | `web/src/ui/task-card/task-card.tsx` (5 button 置換) |
|   | `web/src/ui/task-card/task-form-card.tsx` (キャンセル → 右上 ✕ 移設 + 追加 → Plus) |
|   | `web/src/ui/project-card/project-card.tsx` (削除 1 button 置換) |
|   | `web/src/ui/project-card/project-form-card.tsx` (キャンセル → 右上 ✕ 移設 + 追加 → Plus) |
|   | `web/src/ui/routine-card/routine-card.tsx` (削除 1 button 置換) |
|   | `web/src/ui/routine-card/routine-form-card.tsx` (キャンセル → 右上 ✕ 移設 + 追加 → Plus) |
| UI (CSS) | `web/src/ui/task-card/task-card.css` (`.card-action-button` 共通宣言 + 起票カード右上 ✕ 配置) |
|   | `web/src/ui/project-card/project-card.css` (同形宣言) |
|   | `web/src/ui/routine-card/routine-card.css` (同形宣言) |
| テスト | spec REQ-13 に基づく改修 (件数は本 plan §「テスト方針」で確定) |
| ドキュメント | feature ディレクトリ (本 spec / plan / tasks)。`project.md` は触らない |

## 設計詳細

### D-001 (アイコンライブラリ): `lucide-react` を採用

- 理由:
  - Lucide はリリース済みの ISC ライセンス。React 公式バインディング `lucide-react` を提供。
  - named import で個別アイコンを tree-shake できる (`import { Trash2 } from "lucide-react"`)。
    本 BL で実利用するアイコンは 7 種 (`Check` / `Trash2` / `Pin` / `SkipForward` /
    `SkipBack` / `X` / `Plus`) のみ。
  - peer dep は `react` のみ (todica 既存と同一系列を要求)。
- バージョン指定: `package.json` の `dependencies` に `"lucide-react": "^0.460.0"` を追記する
  (実バージョンは tasks で最新を確認して固定)。
- 削除予定なし (Lucide 固定。差し替え可能性は非ゴール)。

### D-002 (Icon Button DOM 形): button 子は SVG 単独 + `aria-hidden="true"`

- DOM 形 (例):
  ```tsx
  <button
    type="button"
    className="button button--danger card-action-button task-card__actions__delete"
    aria-label="削除"
    onClick={onDelete}
  >
    <Trash2 size={18} aria-hidden="true" />
  </button>
  ```
- `lucide-react` が出力する `<svg>` は `<title>` / `<text>` を持たないため、`aria-hidden="true"`
  により accessibleName 計算から除外される。
- button の accessibleName は `aria-label` 単独で決まる (REQ-10 / NFR-1)。
- `size` prop で SVG の `width` / `height` を 18 px (D-003 で確定) に固定する。

### D-003 (アイコンサイズ): 18 px 固定

- Lucide default 24 px は密度が高く、既存 16 px テキストとの差が小さい。
- 16 px は jsdom 環境で SVG 要素確認時に小さく区別しにくい。
- **18 px** を採用 (Lucide `size={18}` で指定 / SVG 内部の stroke-width=2 は default 維持)。
- 視覚調整は実装後に必要なら +1〜+2 px の範囲で実装者が調整 (max 20 px / NFR-5 タッチ領域は維持)。

### D-004 (タッチ領域確保): 共通クラス `.card-action-button` を 3 系統 CSS で再宣言

- 既存方針: 3 系統 (task / project / routine) の CSS は **共有しない** (各 .css 冒頭コメント)。
  本 BL でもこの方針を維持し、共通クラス `.card-action-button` の宣言は
  `task-card.css` / `project-card.css` / `routine-card.css` の **3 ファイルで同形宣言** する。
- 共通宣言 (3 系統で同形):
  ```css
  .card-action-button {
    /* タッチ領域 44 × 44 px を保証する (NFR-5). */
    min-width: 44px;
    min-height: 44px;
    /* icon 18 px + padding で 44 × 44 を満たす. */
    padding: var(--space-sm);
    /* SVG icon を中央配置. */
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }
  ```
- 既存の `.button` 基底 (`web/src/styles/button.css`) と併用する
  (`className="button button--danger card-action-button"` のように合成)。
  `button` 基底の border / color / appearance 等はそのまま使う。
- 既存 className (`task-card__actions__delete` / `__complete` / `project-card__actions__delete`
  等) は配置制御 (auto-margin / justify-content) で参照されているため **撤去せず維持** する。

### D-005 (起票カード右上 ✕ button の DOM / CSS 配置)

#### DOM 形 (3 起票カード共通)

```tsx
<form onSubmit={onSubmit} aria-label={formAriaLabel} className="<card>-card <card>-card--form">
  {/* root 直下 第一子に close button を置く. tab order が先頭に来る. */}
  <button
    type="button"
    className="button card-action-button <card>-card__close"
    aria-label="閉じる"
    onClick={onCancel}
  >
    <X size={18} aria-hidden="true" />
  </button>
  ...
</form>
```

#### CSS 配置 (3 系統で同形宣言 / 各系統の css に追加)

```css
/* 起票カード root に position: relative を付与 (absolute の起点). */
.<card>-card--form {
  position: relative;
  /* 右上に icon button が乗るため title / actions 段との衝突を避けるため
   * 上 / 右 padding を追加で確保する. */
  padding-top: calc(var(--space-md) + 44px);
  /* 既存 .<card>-card の padding は維持. */
}

/* 右上 ✕ button. */
.<card>-card__close {
  position: absolute;
  top: var(--space-sm);
  right: var(--space-sm);
}
```

- `padding-top` 拡張は close button (44 px) と既存 header 段との視覚的重なりを避けるため。
  3 系統共通の構造変更。
- 共通クラス `.card-action-button` (D-004) の `min-width: 44px / min-height: 44px / padding` を継承する。
- `.task-card--form` は既存ルールで `task-card.css` に空ルールがあるためそこに追記する。
- `.project-card--form` / `.routine-card--form` も同様に既存空ルールに追記する。
- 衝突: 既存 `.task-card__actions` の auto-margin / `.project-card__actions` の右寄せ / 
  `.routine-card__actions` の `justify-content: flex-end` は **キャンセル button 撤去後も維持**
  (= 「追加」 single button が右端配置になる)。

#### 1 ファイル共通化案を採用しない理由

- 既存の CSS スコープ方針 (各 css 冒頭の「系統間で共有しない」コメント) を尊重。
- `web/src/styles/` 配下に新 css を追加すると import 順序を別途管理する必要が出る。
- 3 系統での同形宣言は 7〜8 宣言 × 3 = 約 24 行の重複。許容範囲。

### D-006 (key 経路 / focus 復帰の維持)

- 「閉じる ✕」 click → 既存 `onCancel` prop をそのまま呼ぶ。
- 親 view (today / tomorrow / projects / routines) 側で BL-104 で確立済みの
  `handleCancel = closeForm + focusCreateButton` をそのまま渡す経路を維持する。
- 親 view の改修は **不要** (TSX 側 prop シグネチャ無変更)。
- Escape キー listener も親 view 側 useEffect で従来通り動く。

### D-007 (アイコン import 経路)

- 各 TSX ファイル冒頭で named import:
  ```tsx
  import { Check, Pin, Plus, SkipBack, SkipForward, Trash2, X } from "lucide-react";
  ```
- 各 TSX で実利用するアイコンのみを import する (TaskCard は 5 種 / 起票カードは 2 種 / 他カードは 1 種)。
- `lucide-react` の peerDeps 警告が出ないことを確認 (D-001)。

### D-008 (jsdom / vitest 環境での観察可能性)

- 各 button 子要素として `<svg>` (Lucide の出力) が DOM 上に現れる。
- AC-1 〜 AC-3 / AC-5 / AC-7 / AC-11 は `container.querySelector("button[aria-label='削除'] svg[aria-hidden='true']")`
  などで観察可能。
- AC-10 (タッチ領域 44 × 44) は jsdom が layout 計算しないため `getBoundingClientRect` は使えない。
  代わりに `getComputedStyle(button).minWidth` / `.minHeight` で `"44px"` を観察する形にする
  (vitest config の `css: true` 前提)。

### 例外 / エラー処理

- アイコンの SVG 描画失敗時のフォールバック: 本 BL では追加しない (Lucide 失敗はビルド時に検出可能)。
- `onCancel` が未指定 (= undefined) の場合の既存挙動 (no-op) は維持する。

## 重要な決定

- D-001: アイコンライブラリは Lucide (`lucide-react`) で固定 (差し替え可能性は非ゴール)。
- D-002: button DOM は SVG 単独 + `aria-hidden="true"` / button 側 `aria-label`。
- D-003: アイコンサイズは 18 px 固定 (Lucide `size={18}`)。
- D-004: タッチ領域は共通クラス `.card-action-button` を 3 系統 CSS で同形宣言。
- D-005: 起票カード右上 ✕ は root 直下第一子 + `position: absolute` + 3 系統独立 CSS。
- D-006: `onCancel` prop シグネチャは無変更 / 親 view 改修不要。
- D-007: named import で tree-shake 経路を維持。
- D-008: jsdom 検証は `getComputedStyle` の minWidth / minHeight + querySelector("svg[aria-hidden]") で行う。

ADR 化判断: 本 BL の決定は UI 層の局所的なものであり、後続 BL の前提を縛らない (= D-001 の Lucide 固定も dependency 1 件で剥がせる) ため、ADR は作成しない。

## リスク / 代替案

- リスク R-1 (bundle size): `lucide-react` の tree-shaking が機能しないと、未使用 600+ アイコン分が
  bundle に入って数 MB 増える。対応: named import を徹底し、`vite build` 後の bundle size を確認する。
  代替案: SVG をプロジェクト内に直接 inline する (実装コストが上がる / 却下)。
- リスク R-2 (jsdom での `getComputedStyle` の minWidth 観察): vitest config の `css: true` で
  jsdom が CSS を反映できているかを test-designer が確認する必要がある。
  代替案: classList の存在 (`.card-action-button` が button に付いている) で間接観察する。
- リスク R-3 (既存テスト追従工数): textContent ベース assertion を持つテストファイル数が
  spec 概算で約 6 件 + helper 1 件 = 約 7 ファイル。実数は test-designer / implementer が確定する。
  各テスト改修は機械的 (textContent → aria-label) なため工数は限定的。
- リスク R-4 (右上 ✕ と header 段の視覚衝突): 起票カードの `padding-top` 拡張で 44 px 分の余白が
  生まれるため、上端の PriorityStars / プロジェクト `<select>` 段との衝突は発生しない。
  視覚レビューを auditor で確認。
- リスク R-5 (タッチ領域 44 × 44 と既存 button gap の整合): 各 actions 段の gap が `var(--space-sm)` (4 px)
  のため、icon button 隣接時に 44 + 4 + 44 = 92 px の幅を要する。
  `<TaskCard>` actions は最大 4 button (削除 / 現在のタスクにする / 明日にする / 完了) で
  44 × 4 + 4 × 3 = 188 px が下限。モバイル幅 320 px から margin / padding を引いた使用可能幅で収まることを
  実装後にレビュー (`flex-wrap: wrap` 既存指定で安全弁あり)。

## テスト方針

> 全体方針は [`../../quality/test-catalog.md`](../../quality/test-catalog.md)。

### 新規テスト (test-designer が作成)

新規テストファイル: `web/__tests__/card-buttons-iconify.test.tsx` (1 ファイル)
- 内訳:
  - AC-1 (TaskCard 5 button 置換): button ごとに `aria-label` + `svg[aria-hidden='true']` の存在を確認 (5 it)。
  - AC-2 (ProjectCard 削除置換) (1 it)。
  - AC-3 (RoutineCard 削除置換) (1 it)。
  - AC-4 (3 起票カードのキャンセル撤去) (3 it)。
  - AC-5 (3 起票カード右上 ✕ 存在 + onCancel 呼出) (3 it)。
  - AC-6 (✕ の `type="button"` で誤 submit しない) (1 it)。
  - AC-7 (3 起票カード Plus アイコン submit) (3 it)。
  - AC-8 (today-view Escape → close + focus 復帰): 既存 BL-104 系テスト経路で担保されているなら
    本 BL では参照だけにする / 必要なら 1 it。
  - AC-9 (✕ click → close + focus 復帰) (1 it / 3 view あるが today 代表で 1 件)。
  - AC-10 (タッチ領域 44 × 44 / getComputedStyle minWidth 観察) (代表 3 it: TaskCard 削除 /
    起票カード ✕ / 起票カード追加)。
  - AC-11 (svg aria-hidden assertion) (1 it / 代表 button で確認)。
  - 合計 約 22 〜 25 it。

### 既存テストの追従改修 (implementer が改修)

- `web/__tests__/task-card-component.test.tsx`: textContent → aria-label に書き換え (概算 8 件)。
- `web/__tests__/task-card-hotfix.test.tsx`: focus-view actions / 起票カード「キャンセル」/「追加」 textContent
  ベース AC を `aria-label` ベースに書き換え (概算 5 件)。
- `web/__tests__/inline-edit-all-cards.test.tsx`: 3 系統「削除」/「キャンセル」 textContent assertion
  を `aria-label` / 存在しないことの確認に書き換え (概算 6 件)。
- `web/__tests__/project-card-component.test.tsx`: 「削除」/「キャンセル」 textContent (概算 3 件)。
- `web/__tests__/routine-card-component.test.tsx`: 同上 (概算 3 件)。
- `web/__tests__/common-button-style.test.tsx`: `findButtonClassNameByLabel` helper を
  「textContent または aria-label 属性値で hit」する形に拡張する (helper 関数 1 箇所の改修で
  全 AC が透過的に通る)。代替として本 BL のカード button を helper の検索対象から外し
  別 helper を用意する選択肢もあるが、helper 1 関数拡張のほうが影響範囲が小さい。
- 追従総件数の概算: 約 25 〜 30 assertion 件 / 6 ファイル + helper 1 関数。

### Playwright (e2e)

- 既存 spec は `getByRole("button", { name: ... })` を使用しているため **無改修で通る想定** (REQ-12)。
- 念のため login → today flow → 起票 → ✕ 閉じる → Escape のスモークパスを auditor 段階で実機 / Playwright で確認する。

### typecheck / lint

- `lucide-react` の型定義は package 同梱 (TS ready) のため追加設定不要。
- `npm run typecheck` / `npm run lint` を tasks に含める。

### 受け入れ基準カバレッジ

- spec AC-1 〜 AC-13 をすべて vitest で網羅する (Playwright はスモーク代替)。
- 「テストが通る == 機能が実装されている」の対応関係を保つため、AC ⇔ it / describe を
  test-designer がコメントで明示する (例: `// AC-1: REQ-1 carryover`)。
