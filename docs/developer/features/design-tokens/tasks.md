# タスク: デザイントークン / CSS 基盤の整備

> [`plan.md`](plan.md) を実行可能な単位に分解する。完了したらチェックを入れる。

## 実装

### 1. tokens.css の作成と import

- [ ] `web/src/styles/` ディレクトリを新規作成する
- [ ] `web/src/styles/tokens.css` を新規作成し、spec.md REQ-2 の 18 変数（`--color-danger` 除く）を `:root` に定義する
- [ ] `web/src/main.tsx` に `import './styles/tokens.css'` を追加する

### 2. app-shell.css の置換

- [ ] `TODO(BL-046)` マーカー付きの暫定値を `var(--トークン名)` に置換する（plan.md §「置換マッピング」参照）
- [ ] `--sidebar-width` マーカーを削除し、`200px` ハードコードを残す（REQ-4・D-006）
- [ ] ファイル先頭の `TODO(BL-046)` コメントブロックを削除する

### 3. focus-view.css の置換

- [ ] `TODO(BL-046)` マーカー付きの暫定値を `var(--トークン名)` に置換する
- [ ] `font-size: 28px`（`__name`）は `var(--font-size-h2)` に**しない**。マーカーを削除しハードコードを残す（D-005）
- [ ] ファイル先頭の `TODO(BL-046)` コメントブロックを削除する

### 4. tomorrow-view.css の置換

- [ ] `TODO(BL-046)` マーカー付きの暫定値を `var(--トークン名)` に置換する（`#666` → `var(--color-fg-subtle)` を含む）
- [ ] ファイル先頭の `TODO(BL-046)` コメントブロックを削除する

### 5. projects-view.css の置換

- [ ] `TODO(BL-046)` マーカー付きの暫定値を `var(--トークン名)` に置換する（`#595959` → `var(--color-fg-subtle)` を含む）
- [ ] ファイル先頭の `TODO(BL-046)` コメントブロックを削除する

### 6. routines-view.css の置換

- [ ] `TODO(BL-046)` マーカー付きの暫定値を `var(--トークン名)` に置換する（`#666` / `#595959` → `var(--color-fg-subtle)` を含む）
- [ ] ファイル先頭の `TODO(BL-046)` コメントブロックを削除する

### 7. settings-view.css の置換

- [ ] `TODO(BL-046)` マーカー付きの暫定値を `var(--トークン名)` に置換する（`#666` → `var(--color-fg-subtle)` を含む）
- [ ] ファイル先頭の `TODO(BL-046)` コメントブロックを削除する

### 8. trash-view.css の置換

- [ ] `TODO(BL-046)` マーカー付きの暫定値を `var(--トークン名)` に置換する（`#595959` → `var(--color-fg-subtle)` を含む）
- [ ] ファイル先頭の `TODO(BL-046)` コメントブロックを削除する

### 9. priority-stars.css の置換

- [ ] `TODO(BL-046)` マーカー付きの暫定値を `var(--トークン名)` に置換する（`#B45309` → `var(--color-accent)`、`#595959` → `var(--color-fg-subtle)`、`#1d4ed8` → `var(--color-focus-ring)`）
- [ ] ファイル先頭の `TODO(BL-046)` コメントブロックを削除する

### 10. project-toggle.css の置換

- [ ] `TODO(BL-046)` マーカー付きの暫定値を `var(--トークン名)` に置換する（`#595959` → `var(--color-fg-subtle)` / `var(--color-border)` の使い分けに注意、`#1a1a1a` → `var(--color-fg)`、`#1d4ed8` → `var(--color-focus-ring)`）
- [ ] ファイル先頭の `TODO(BL-046)` コメントブロックを削除する

### 11. project-create-dialog.css の置換

- [ ] `TODO(BL-046)` マーカー付きの暫定値を `var(--トークン名)` に置換する（`#595959` → `var(--color-border)`、`#fff` → `var(--color-bg)`、`#1a1a1a` → `var(--color-fg)`、`#1d4ed8` → `var(--color-focus-ring)`）
- [ ] ファイル先頭の `TODO(BL-046)` コメントブロックを削除する

### 12. today-view.tsx のコメント整理

- [ ] `today-view.tsx` 内の 2 件の `TODO(BL-046)` コメントを削除する（スタイル変更なし、コメントのみ）

## テスト

- [ ] `grep -r 'TODO(BL-046)' web/src/` の出力がゼロであることを確認する
- [ ] テストスイート全件（単体）を実行し、green であることを確認する
- [ ] E2E テスト全件を実行し、green（25 件以上 green）であることを確認する
- [ ] axe 検査を実行し、WCAG violations 増加がないことを確認する

## ドキュメント

- [ ] ADR-0012（CSS フレームワーク選定）を `docs/developer/adr/0012-css-framework.md` に作成する

## 仕上げ

- [ ] 受け入れ基準（spec.md）を全て満たすことを確認する
  - `tokens.css` の存在と 18 変数の定義
  - `main.tsx` の import 追加
  - `grep -r 'TODO(BL-046)' web/src/` 出力ゼロ
  - 全テスト green
- [ ] レビュー依頼
