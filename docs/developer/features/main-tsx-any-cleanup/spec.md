# 仕様: web/src/main.tsx の as any 解消 + 死 eslint コメント撤去

- 状態: ドラフト
- 関連: [`../../planning/backlog.md`](../../planning/backlog.md) BL-084

## 背景 / 課題

`web/src/main.tsx` の 4 箇所 (line 252-253 / 277-278 / 326-327 / 518-519) で `const anyDb = db as any;` が `getDb()` の戻り値を型キャストしている. これは `web/src/repositories/local-db.ts` の `getDb()` が `Promise<unknown>` を返すため. `as any` の直上には `// eslint-disable-next-line @typescript-eslint/no-explicit-any` という ESLint 用ディレクティブが付くが, 本リポジトリの lint は Biome に切り替わっているため死コメント.

加えて 6 個の Local 系ファイル (`local-task-repository.ts` / `local-settings-repository.ts` / `local-trash-repository.ts` / `local-project-repository.ts` / `local-routine-repository.ts` / `local-reset-usecase.ts`) で同じ `interface DBConnection` が重複定義されている (8 メソッドまたは 6 メソッドの最小インターフェース).

## ゴール / 非ゴール

### ゴール

- `local-db.ts` に `LocalDb` 型を新設し export する.
- `getDb()` の戻り型を `Promise<LocalDb>` にする.
- 6 個の Local 系ファイルから個別の `interface DBConnection` を撤去し, `LocalDb` を import して使う.
- `main.tsx` の 4 箇所の `const anyDb = db as any;` + `// eslint-disable-next-line` を撤去し, `db` を直接渡す.
- Biome lint で `noExplicitAny` 警告が `web/src/main.tsx` から消える.

### 非ゴール

- ローカル DB の永続化スキーマ / Repository の API / Local Reset Usecase の挙動の変更.
- `getDb()` の動的 import 構造の変更.
- 他ファイルの `as any` (今回は `main.tsx` の 4 件のみが対象).

## 要件

- **FR-1**: `LocalDb` 型は `SQLiteDBConnection` の最小インターフェース (現状 `local-task-repository.ts` が定義している 8 メソッド) と互換.
- **FR-2**: 6 Local 系ファイルが `LocalDb` を import して使う (個別 interface 定義の重複なし).
- **FR-3**: `main.tsx` から `as any` / `anyDb` / `eslint-disable-next-line` が全廃.
- **FR-4**: 既存テスト全件 green / typecheck / lint exit 0.

## 受け入れ基準

```
シナリオ: main.tsx に as any が残らない
  Given web/src/main.tsx
  When  grep "as any" を実行する
  Then  ヒット 0 件
```

```
シナリオ: main.tsx に死 eslint コメントが残らない
  Given web/src/main.tsx
  When  grep "eslint-disable" を実行する
  Then  ヒット 0 件
```

```
シナリオ: LocalDb 型が共有される
  Given web/src/repositories/local-db.ts
  When  ファイルを読む
  Then  export interface LocalDb が定義されている
  And   6 個の Local 系ファイルが import type { LocalDb } from "./local-db.js" もしくは相対パスで参照する
```

```
シナリオ: 既存挙動の維持
  Given vitest 全件
  When  実行する
  Then  退行なし
```
