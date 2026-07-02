# ADR-0013: ダークモードの実現方式（OS 追従・トークン上書き）

- 状態: 承認
- 日付: 2026-07-02
- 決定者: project-designer（BL-140 仕様策定時）

## 背景 / 状況

BL-140「ダークモード対応（OS 追従）」において、ダークモードの実現方式を確定する必要がある。
要件は「OS のカラースキーム設定（`prefers-color-scheme`）に追従する」ことのみで、
手動トグル・設定項目・永続化は非ゴールとする（`docs/developer/project.md` の CORE-1
「設定・選択肢を増やさない」設計原則と整合）。

前提条件:

1. スタイル基盤は ADR-0012 で **vanilla CSS + `:root` CSS variables** に確定済み。
   カラーは `web/src/styles/tokens.css` の `--color-*` トークンに集約されている。
2. ADR-0012 §結果 で「将来ダークモードを導入する場合、
   `@media (prefers-color-scheme: dark) { :root { ... } }` で対応できる」と既に想定されている。
3. 依存追加ゼロ（ADR-0012 §決定 理由 1）を維持したい。

## 検討した選択肢

| 選択肢 | 利点 | 欠点 |
| --- | --- | --- |
| **`@media (prefers-color-scheme: dark)` でカラートークンのみ上書き** | 追加依存ゼロ。CSS のみで完結し JS を持たない。全 view が `:root` トークンを参照済みのため 1 ファイル（tokens.css）の変更で全画面に波及。OS 追従という要件そのものにブラウザネイティブで一致。 | ユーザーが OS 設定と独立にテーマを選ぶことはできない（今回は非ゴールのため問題にならない）。 |
| **JS / `data-theme` 属性 + クラス切替** | 手動トグル・永続化に拡張しやすい。 | JS ランタイムとステート管理を持ち込む。localStorage 等の永続化は CORE-1（設定を増やさない）に反する。OS 追従だけなら過剰。 |
| **ライブラリ導入（テーマ管理 CSS/JS）** | 高機能。 | 依存追加。個人開発・OSS のコスト原則（ADR-0012）に反する。要件に対し過大。 |

## 決定

**`@media (prefers-color-scheme: dark) { :root { --color-* } }` によるカラートークン上書き方式**を採用する。

- `tokens.css` の `:root`（ライト既定）に対し、同ファイル内の
  `@media (prefers-color-scheme: dark)` 内の `:root` でカラートークンのみをダーク値に上書きする。
- 上書き対象はカラートークン（`--color-*`）に限定し、余白・角丸・タイポグラフィのトークンは変更しない。
- コンポーネント CSS は生の色を持たず、すべて `var(--color-*)` を参照する（色の単一情報源化）。
- 手動トグル・設定 UI・永続化は実装しない（OS 追従のみ）。

## 結果 / 影響

- 良い影響:
  - `tokens.css` の変更のみでライト / ダーク両対応が全 view に波及する。
  - JS・依存を一切追加しない。ADR-0012 の方針と完全に整合。
  - 色が `var(--color-*)` に一元化され、ガードテストで生色の再混入を恒久的に防げる。
- トレードオフ / 注意点:
  - ダーク配色のコントラストは白背景前提の値と別に取り直す必要がある。
    WCAG AA を目標とし、値の妥当性は監査（auditor / architecture-reviewer）が実在確認する。
  - `prefers-color-scheme` 非対応の旧ブラウザではライト既定にフォールバックする（実害なし）。
  - 将来「OS と独立した手動テーマ切替」が要件化した場合は、本方式に `data-theme` 上書きを
    足す形で拡張できる（その時点で再検討）。
- 関連:
  - ADR-0012（CSS フレームワーク選定 / デザイントークン基盤）
  - `docs/developer/features/dark-mode/spec.md`
  - `docs/developer/features/dark-mode/plan.md`
  - `web/src/styles/tokens.css`
