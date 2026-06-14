# 仕様: clean / clean:dist script の追加

- 状態: ドラフト
- 関連: [`../../planning/backlog.md`](../../planning/backlog.md) BL-089

## 背景 / 課題

リポジトリには次の生成物が手元に蓄積するが clean 手段が用意されていない:

- `test-results/` (Playwright artifacts, 1MB 超)
- `web/dev-dist/` (Vite PWA dev artifacts)
- 各 workspace の `dist/` (`domain/dist` / `server/dist` / `web/dist`)
- 各 workspace の `*.tsbuildinfo`
- `.e2e-data/` (e2e テスト時の SQLite データベース等)

`domain/dist` は他 workspace の解決元 (`@todica/domain` の `main` / `exports`) なので無条件削除はできず, clean とセットで build を回す手段が必要.

## ゴール / 非ゴール

### ゴール

- ルート `package.json` に `clean` script を追加し, テスト成果物・dev 成果物・`*.tsbuildinfo` を一掃する.
- ルート `package.json` に `clean:dist` script を追加し, 全 workspace の `dist/` を一掃した後 `domain` を build し直す.
- `rimraf` を devDependency に追加 (cross-platform 対応).

### 非ゴール

- `.gitignore` / CI 設定の変更.
- 既存生成物のコミット状態の整理 (別 BL).
- `node_modules` の cleanup (`npm ci` で代替可能).

## 要件

- **FR-1**: `npm run clean` 実行で `test-results/` / `web/dev-dist/` / `.e2e-data/` / 全 `*.tsbuildinfo` が消える.
- **FR-2**: `npm run clean:dist` 実行で `domain/dist` / `server/dist` / `web/dist` が消え, 続いて `domain` の build が走る.
- **FR-3**: 既存テスト全件 green / typecheck / lint exit 0.

## 受け入れ基準

```
シナリオ: clean script が生成物を消す
  Given test-results/ / web/dev-dist/ / .e2e-data/ / *.tsbuildinfo が存在する
  When  npm run clean を実行する
  Then  4 種類の生成物が消えている
```

```
シナリオ: clean:dist script が dist を再生成する
  Given 全 workspace の dist/ が存在する
  When  npm run clean:dist を実行する
  Then  3 dist/ が一度消えて, domain/dist が再ビルドされる
```

```
シナリオ: package.json に 2 script が追加されている
  Given package.json
  When  scripts キーを読む
  Then  "clean" と "clean:dist" が定義されている
```
