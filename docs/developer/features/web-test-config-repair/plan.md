# 設計・実装計画: web workspace の vitest 実行基盤修復 (web-test-config-repair)

> [`spec.md`](spec.md) の要件を, どう実現するかに落とす.

## 方針概要

`web/vitest.config.ts` を新規 1 ファイル追加し, `globals: true` / `environment: "jsdom"` / `include` / `setupFiles` の最小構成だけ持たせる. ルートの `vitest.config.ts` は無改修で, 既存検証経路 (ルートからの `npm test`) には副作用を一切与えない. setup.ts の中身も無改修.

## 影響範囲

| 領域 | 変更内容 |
| --- | --- |
| `web/vitest.config.ts` | **新規追加**. `defineConfig({ test: { globals: true, environment: "jsdom", include: ["**/*.test.ts", "**/*.test.tsx"], setupFiles: ["./__tests__/setup.ts"] } })` |
| `vitest.config.ts` (ルート) | 無改修 |
| `web/__tests__/setup.ts` | 無改修 (本 BL から `setupFiles` で参照するのみ) |
| `web/package.json` | 無改修 (`scripts.test` は `vitest run` のまま) |
| `web/tsconfig.json` | 無改修 |
| `web/vite.config.ts` | 無改修 (vitest 設定とは独立) |
| production code (`web/src/**`, `domain/src/**`, `server/src/**`) | 一切無改修 |
| ドキュメント | `docs/developer/features/web-test-config-repair/` (spec / plan / tasks) と `docs/developer/planning/backlog.md` の BL-055 行追加のみ |

## 設計詳細

### データモデル

該当なし (本 BL は設定ファイル 1 つの追加に閉じる. データ構造の追加・変更は無い).

### 処理フロー

#### 修復後の `npm test -w web` の経路

1. ルートで `npm test -w web` を実行する.
2. npm が `web` ワークスペースに移って `npm run test` (= `vitest run`) を起動する.
3. vitest が CWD (= `web/`) で設定ファイルを探索し, **新設した `web/vitest.config.ts`** を発見する.
4. `defineConfig` の `test` 設定 (jsdom / globals / include / setupFiles) が読み込まれる.
5. `web/__tests__/setup.ts` が読み込まれ, `@testing-library/jest-dom` の matcher 登録 / `HTMLDialogElement` polyfill / `fake-indexeddb` の `IDBFactory` 差し込み等が実行される.
6. `**/*.test.ts` と `**/*.test.tsx` にマッチする web 配下のテストファイルが jsdom 環境で実行される.
7. 全件 green であれば exit 0 で完了する.

#### ルートからの `npm test` の経路 (無改修, 維持)

1. ルートで `npm test` (= `vitest run`) を実行する.
2. vitest が CWD (= リポジトリルート) で **ルートの `vitest.config.ts`** を発見する.
3. ルート設定の `include` (`domain/**/*.test.ts`, `server/**/*.test.ts`, `web/**/*.test.ts`, `web/**/*.test.tsx`) が拾われる.
4. `environmentMatchGlobs` で web 配下のテストだけが jsdom 環境に切り替わる. domain / server は node 環境.
5. `setupFiles: ["./web/__tests__/setup.ts"]` が読み込まれる (web の setup を全テストに対して読むが, 非 web では polyfill が no-op).
6. 全件 green であれば exit 0 で完了する.

本 BL の差分はルートの探索結果に影響しない (vitest はカレント解決から上位探索を行うため, ルートで起動した時点で `web/vitest.config.ts` は読まれない).

### 例外 / エラー処理

- 該当なし (設定ファイルの追加 1 件のみ. ランタイムでのエラー分岐は持たない).
- 仮に `web/vitest.config.ts` の記述ミスで vitest 起動時にエラーが出る場合は, AC-1 が失敗する形で即座に検出される.

### 想定するファイル本文 (要点のみ)

実装時の参考として, `web/vitest.config.ts` の本文骨格を以下に示す (確定形は実装者が決める. ヘッダコメントの文言・改行位置などは plan で固定しない).

```ts
// 概念図 (実装者の参考用. 確定形は実装者が決める)
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "jsdom",
    include: ["**/*.test.ts", "**/*.test.tsx"],
    setupFiles: ["./__tests__/setup.ts"],
  },
});
```

- ヘッダコメントには「web workspace 単体実行 (`npm test -w web`) を成立させるための最小設定. ルート設定とは独立に動作する」旨を日本語で残す方針とする (CLAUDE.md の言語規約に従う).
- `coverage` は意図的に持たせない (spec D-006).
- `environmentMatchGlobs` も持たせない (spec D-003: include 対象がすべて web 配下に閉じるため不要).

## 重要な決定

- **`web/vitest.config.ts` の新設で対応する**: spec D-001. ルートからの import / re-export は採用せず, web 配下に独立した最小設定を置く.
- **ルート設定への delegate を採用しない理由**: ルート設定は `setupFiles: ["./web/__tests__/setup.ts"]` のようにルート CWD 前提のパスを持つ. web 配下から import すると相対パス解決が壊れるリスクがある. 値だけを抽出して share する仕組みは BL のスコープに対して過剰なため不採用.
- **`environment: "jsdom"` を全体に適用する**: ルート設定が `environmentMatchGlobs` でファイル単位に切り替えているのは, domain / server の node テストと混在しているため. web 単体実行では混在しないので単純化できる.
- **`setupFiles` のパスは相対 `./__tests__/setup.ts`**: vitest は設定ファイル位置からの相対解決を行う. `web/vitest.config.ts` を web/ 直下に置くので, `./__tests__/setup.ts` で正しく `web/__tests__/setup.ts` に到達する.
- **`include` から `web/` プレフィックスを外す**: ルート設定の `web/**/*.test.ts(x)` は CWD がルートだから付いている. web 配下から起動すると CWD が web/ なので, `**/*.test.ts(x)` で十分.
- **setup.ts は確認のみで無改修**: 既存 setup.ts は jsdom 前提で書かれている (HTMLDialogElement polyfill / fake-indexeddb / cleanup). `environment: "jsdom"` を指定すれば意図通り動作することを実装時に確認するだけにとどめる.
- **本 BL に専用の単体テストを追加しない**: spec D-007. 検証は「コマンド実行結果」と「設定ファイル本文の目視確認」で行う. BL-048 (lint-typecheck-repair) は execSync で `npm run lint` / `npm run typecheck` を subprocess 検証する形式を採ったが, 本 BL で同形式を採ると `npm test -w web` が vitest 内側から再帰起動する形になり回避コストが見合わない. 詳細は spec D-007 参照.

## リスク / 代替案

### リスク

- **vitest の設定ファイル探索順序の差異**: `vitest run` が workspace 配下で起動された際にどの設定ファイルを採用するかは vitest のバージョンに依存する可能性がある. 本 BL では `vitest@^2.1.8` (ルート `package.json` の devDependency) に固定された挙動を前提にする. メジャー更新時に挙動が変わる可能性は将来 BL で扱う.
- **`setupFiles` の相対パス解決のミス**: パスがずれると jsdom 環境は構築されるが polyfill / matcher が登録されず, `<dialog>` を扱う today-view 系テストが失敗する. AC-1 (実コマンド全件 green) で必ず検出される.
- **`include` の glob が web 配下を越えて拾う可能性**: 通常は CWD ルートから探索されるが, vitest の解釈次第で意図しないファイルが拾われる可能性は残る. AC-1 で web 配下の既知件数と一致することを確認できる.

### 代替案 (不採用)

- **ルート `vitest.config.ts` を web/ 配下から re-export する**: パス解決の維持コストが高く, 値のうち `setupFiles` がルート CWD 前提のため web 配下では破綻する. 不採用.
- **`web/package.json` の `scripts.test` を `vitest run --root ..` などに変更**: workspace 単体実行のセマンティクスを壊し, 「`-w web` で web のテストだけが対象になる」期待を満たさなくなる. 不採用.
- **`environmentMatchGlobs` を web 設定にも持たせる**: 単体実行では include 対象が web 配下のみで, ファイル単位の環境切替を持つ理由がない. 不採用.
- **`coverage` を web 設定にも入れる**: ルート経路で取得済みのため重複. 不採用.

## テスト方針

> 全体方針は [`../../quality/test-catalog.md`](../../quality/test-catalog.md).

- 本 BL は専用の単体テストを追加しない (spec D-007).
- 検証は次の 2 つで行う:
  1. **コマンド実行結果**: `npm test -w web` および `npm test` (ルート) がそれぞれ exit 0 で全件 green になることを実機で確認する.
  2. **設定ファイル本文の目視確認**: `web/vitest.config.ts` が `environment: "jsdom"` / `globals: true` / `setupFiles: ["./__tests__/setup.ts"]` / `include: ["**/*.test.ts", "**/*.test.tsx"]` を持つことを目視確認する (spec AC-3〜AC-6).
- 既存の単体テスト・E2E は無修正で通る (spec G-2, NFR-NO-PRODUCT-CHANGE). 本 BL の差分は jsdom 環境を未提供のまま実行されていた `npm test -w web` 経路を成立させるのみで, テスト本体・production code には touch しない.
- `npm run lint` / `npm run typecheck` も本 BL で touch するファイルが TS / 設定の小ファイル 1 つだけのため, 既存どおり exit 0 を維持できる想定. 実装時に確認する.
