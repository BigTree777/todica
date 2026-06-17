# ADR-0012: CSS フレームワーク選定（デザイントークン基盤）

- 状態: 承認
- 日付: 2026-06-10
- 決定者: project-designer（BL-046 仕様策定時）

## 背景 / 状況

BL-046「デザイントークン / CSS 基盤の整備」において、CSS variables をどのアプローチで管理するかを確定する必要がある。
BL-035 の plan.md §「共通スタイル / トークン配置」では「vanilla CSS + CSS variables（保守側デフォルト）」を示し、
「ADR で比較し却下根拠を残す（BL-046 内で起票、任意）」と記述していた。

選定の前提条件:

1. todica は**個人開発 / OSS 公開を前提**とする（`docs/developer/project.md`）。依存の追加は保守コストに直結する。
2. 既存の CSS 慣行は **BEM + 素の CSS ファイル（コンポーネントローカル）**。BL-036〜BL-045 で
   合計 10 ファイルの CSS が同慣行で書かれており、フレームワーク導入には全ファイルの書き換えを要する。
3. ビルドツールは **Vite + TypeScript**（ADR-0008）。Tailwind は Vite plugin で導入可能だが、
   既存スタック外の依存となる。
4. グローバルなデザイントークン（CSS variables）を定義するだけでよく、コンポーネントごとの
   スタイルスコープ制御は現状の BEM で十分に達成できている。

## 検討した選択肢

| 選択肢 | 利点 | 欠点 |
| --- | --- | --- |
| **vanilla CSS + `:root` CSS variables** | 追加依存なし。既存 CSS を最小限の変更（暫定値 → `var(--...)` 置換）で移行できる。ブラウザネイティブ機能のため将来の互換性が高い。BEM との相性が良い。 | クラス名の自動補完が弱い（型安全性なし）。大規模 OSS での採用例は少ない。 |
| **Tailwind CSS** | ユーティリティクラスで一貫性が出る。コンポーネント間の共通スタイルが視覚化しやすい。 | 既存 CSS（BEM + 10 ファイル）との併用は事実上できず、全書き換えが必要。`devDependencies` 追加。ビルド設定の追加が必要。個人開発 / 小規模 OSS のコスト対効果が低い。 |
| **CSS Modules** | コンポーネントスコープで名前衝突を防ぐ。TypeScript の型補完が利く（`typed-css-modules` 等）。 | Vite は CSS Modules をサポートするが、既存の BEM クラス（`focus-view__card` 等）を CSS Modules の `styles.focusViewCard` に書き換えるコストが大きい。グローバルトークンの定義には `composes` や `:global` が必要で冗長になる。 |
| **CSS-in-JS（styled-components / emotion）** | TypeScript の型安全性が高い。テーマ変数をオブジェクトとして管理できる。 | ランタイムコストが生じる（SSR 非対応プロジェクトでも影響する）。依存が大きい。既存 CSS との共存が困難。 |

## 決定

**vanilla CSS + `:root` CSS variables** を採用する。

理由:

1. **依存追加ゼロ**: `web/package.json` への変更が不要。個人開発 / OSS のコスト原則と整合する。
2. **既存 CSS 慣行との一貫性**: BL-036〜BL-045 で確立した BEM スタイルをそのまま維持できる。
   書き換えコストは「暫定値 → `var(--トークン名)`」の一括置換のみ。
3. **ブラウザネイティブ**: CSS custom properties（variables）は主要ブラウザで標準サポート。
   polyfill や ビルド設定の追加が不要。
4. **トークン管理の十分性**: 18 変数（タイポ 4 / 余白 5 / 角丸 3 / カラー 7）の定義であれば、
   1 ファイル・1 `:root` ブロックで十分に管理できる。将来の変更も局所的。
5. **BL-035 の保守側デフォルトとの整合**: ui-redesign-foundation plan.md の D-006 で
   「vanilla CSS + CSS variables（依存追加を避けるため。個人開発・OSS の前提と整合）」と決定済み。

## 結果 / 影響

- 良い影響:
  - `web/src/styles/tokens.css` 1 ファイルの追加のみで基盤が整う。
  - 全 view が同一のトークンを `:root` から参照でき、変更の波及コストが下がる。
  - 将来ダークモードを導入する場合、`@media (prefers-color-scheme: dark) { :root { ... } }` で
    対応できる（BL-046 では対応しない）。
- トレードオフ / 注意点:
  - トークン名に型安全性がない（`var(--color-bordr)` のタイポをビルドで検出できない）。
    ただし `grep -r 'var(--'` による確認と E2E テストで実用上は十分と判断。
  - 将来コンポーネント数が大幅に増えた場合、BEM + グローバルトークンの組み合わせでは
    スタイルの管理限界が来る可能性がある。その時点で CSS Modules や Tailwind を再検討すること。
- 関連:
  - `docs/developer/features/design-tokens/spec.md`
  - `docs/developer/features/design-tokens/plan.md`
  - `docs/developer/features/ui-redesign-foundation/plan.md` §「共通スタイル / トークン配置」（D-006）
  - ADR-0008（web クライアント技術スタック）

## 適用範囲

本 ADR の「依存追加ゼロ」原則（§決定 理由 1）は **CSS フレームワーク** に対する原則である。
UI アイコンライブラリ・テストランナー等, CSS と直接関係しない用途で `web/package.json` に
依存を追加することは本原則の対象外とする（採用技術一覧は [ADR-0008](0008-web-client-tech-stack.md)
§「採用ライブラリ・ツール（確定）」を正典とする）。
