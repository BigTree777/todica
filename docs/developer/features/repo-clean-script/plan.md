# 計画: clean / clean:dist script の追加

- 状態: ドラフト
- 関連: [`spec.md`](spec.md)

## 方針概要

`rimraf` を使った 2 つの script をルート `package.json` に追加. `domain/dist` の依存関係を踏まえて `clean:dist` は build とセットにする.

## 影響範囲

| ファイル | 変更内容 |
|---|---|
| `package.json` | `clean` / `clean:dist` script + `rimraf` devDependency 追加 |
| `package-lock.json` | rimraf 追加に伴う lock 更新 |
| `__tests__/structure/repo-clean-script.test.ts` (新規) | scripts 存在検証 |

## 設計詳細

### clean script

```json
"clean": "rimraf test-results web/dev-dist .e2e-data \"**/*.tsbuildinfo\""
```

- 対象: `test-results/` / `web/dev-dist/` / `.e2e-data/` / 全 `*.tsbuildinfo`.
- `**/*.tsbuildinfo` で workspace 配下も一括 (rimraf は glob を解釈する).
- `node_modules` は対象外.

### clean:dist script

```json
"clean:dist": "rimraf domain/dist server/dist web/dist && npm run build -w domain"
```

- 全 workspace の `dist/` を消したあと, `domain` だけ build し直す.
- 他 workspace の build は呼び出し側 (テスト / 開発フロー) で実行する想定 (本 BL では `domain` のみ).

## 重要な決定

- **D-1**: `rimraf` を採用 (cross-platform). `rm -rf` 直書きしない.
- **D-2**: `clean` と `clean:dist` を分離 (前者は再ビルド不要, 後者は `domain` の再ビルド必須).
- **D-3**: ADR は作らない.

## テスト方針

- `__tests__/structure/repo-clean-script.test.ts` で `package.json` の scripts に `clean` / `clean:dist` が存在することを検証.
- 実コマンドの実行は手動確認 (rimraf がファイルを消すことは rimraf 自身がテスト済み).
