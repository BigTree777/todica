# タスク: ダークモード対応（OS カラースキーム追従）

> [`plan.md`](plan.md) を実行可能な単位に分解する。完了したらチェックを入れる。

## 実装（色の単一情報源化 → ダーク上書き）

- [ ] `tokens.css` の `:root` に新設 3 トークンを追加（ライト値）: `--color-danger: #c00` /
      `--color-success: #060` / `--color-scrim: rgba(0, 0, 0, 0.5)`
- [ ] コンポーネント CSS の生の色をトークン参照へ置換:
  - [ ] `settings-view.css`: `#c00` → `var(--color-danger)` / `#060` → `var(--color-success)`
  - [ ] `project-create-dialog.css`: `rgba(0,0,0,0.5)` → `var(--color-scrim)`
  - [ ] `app-shell.css`: `rgba(0,0,0,0.4)` → `var(--color-scrim)`
  - [ ] `sw-update-dialog.css`: `rgba(0,0,0,0.4)` → `var(--color-scrim)`
  - [ ] `login-view.css` / `initial-setup-view.css`: `var(--color-danger, #c00)` → `var(--color-danger)`
- [ ] コンポーネント CSS / tokens.css のコメント内 hex を整理（トークン名参照へ、個別 hex を残さない）
- [ ] `tokens.css` に `@media (prefers-color-scheme: dark) { :root { ... } }` を追加し、
      全 `--color-*`（既存 8 + 新設 3）をダーク候補値で再定義（plan のトークン表）
- [ ] ダークブロックにカラー以外のトークンを含めないことを確認（`--space-*` / `--radius-*` /
      `--font-size-*` / `--sidebar-width` を書かない）

## テスト（test-designer が先に失敗するテストを用意 / AC-1〜AC-5）

- [ ] AC-1 ガード: `web/src/ui/**/*.css`（tokens.css 除く）の宣言値・`var()` フォールバックに
      生の色（hex / rgb / rgba / hsl / 名前付き色）が無い（コメント除外）
- [ ] AC-2 ガード: tokens.css に `@media (prefers-color-scheme: dark)` + 内側 `:root` が存在
- [ ] AC-3 ガード: :root とダークの `--color-*` 集合が一致（ダーク網羅・欠け無し）
- [ ] AC-4 ガード: 新設 3 トークンがライト / ダーク双方に定義される
- [ ] AC-5 ガード: ダークブロックの宣言が `--color-*` に限定される
- [ ] AC-6 回帰: リポジトリルートで `npx vitest run` が全 green

## ドキュメント

- [ ] 新規 ADR-0013 を起票（`docs/developer/adr/_template.md` をコピー）: 「OS カラースキーム追従の
      ダークモードを `prefers-color-scheme` の CSS トークン上書きのみで実装。手動トグル / 設定 / 永続化は
      非採用」。代替案（data-theme + JS トグル / `light-dark()`）の却下根拠を記載
- [ ] ADR-0012 は編集しない（BL-046 時点の記録として保持。plan D-5 参照）
- [ ] `tokens.css` 冒頭コメントにダーク方針（prefers-color-scheme 追従・カラーのみ上書き）を追記
- [ ] `docs/developer/architecture/web-client/overview.md` はスタイル / トークンの記載が無いため
      本 BL では変更不要（判断結果を記録。追加が必要になれば別途）

## 仕上げ

- [ ] 受け入れ基準（spec.md AC-1〜AC-6）を全て満たすことを確認
- [ ] `npm run lint`（warning 0）/ `npm run typecheck`（pass）
- [ ] auditor に視覚 / コントラスト（AC-V1〜AC-V3）の実在確認を依頼（OS ダーク設定下の各 view /
      WCAG AA 実測 / リロード無し追従）
- [ ] レビュー依頼（auditor 承認 → PR）
</content>
