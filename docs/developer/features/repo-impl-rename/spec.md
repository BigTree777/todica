# 仕様: Drizzle Repository 実装のファイル命名

## 要件

- `server/src/infra/persistence/drizzle/` の Repository 実装ファイルは `drizzle-` 接頭辞を持つ。
- 実装クラス名と公開する振る舞いは変更しない。
- `server/src/data/` の Repository interface は変更しない。
- 実装を参照する import path は `drizzle-` 接頭辞付きのファイル名を使用する。

## 対象

- `drizzle-counter-repository.ts`
- `drizzle-focus-repository.ts`
- `drizzle-idempotency-store.ts`
- `drizzle-password-repository.ts`
- `drizzle-project-repository.ts`
- `drizzle-routine-repository.ts`
- `drizzle-session-repository.ts`
- `drizzle-settings-repository.ts`
- `drizzle-task-repository.ts`

## 受け入れ基準

- 対象9ファイルが `server/src/infra/persistence/drizzle/` に存在する。
- 旧ファイル名を参照する import path が存在しない。
- テスト、lint、typecheck が成功する。
