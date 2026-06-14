# 計画: VITE_API_BASE_URL の dev / 本番説明整合

- 状態: ドラフト
- 関連: [`spec.md`](spec.md)

## 方針概要

`.env.example` のコメントを正本とし, `setup/server.md` と `quick-start.md` を同じ規則に揃える. 表記方針は次のとおり.

- dev: `http://localhost:3000` (Web の `:5173` から API の `:3000` を別オリジンで叩く)
- 本番: 空文字 (相対パス `/api/...` が同一オリジンに解決される. nginx 等で Web と API を同一ドメイン配信する構成を前提)

## 影響範囲

| ファイル | 編集箇所 |
|---|---|
| `docs/developer/setup/server.md` | env 表に dev/本番差を示す注記または列を追加 |
| `docs/user/quick-start.md` | A-2 セクションに「dev 想定」「Web は build 時埋め込み」「サーバ dev 起動は env をランタイム読み」の区別を追記 |
| `__tests__/docs/api-base-url-doc-align.test.ts` (新規) | 2 文書に dev/本番説明が含まれていることを grep ベース検証 |

`.env.example` / `deploy-guide.md` は無改修.

## 設計詳細

### setup/server.md の env 表

現状:
```
| `VITE_API_BASE_URL` | `http://localhost:3000` | Web から呼び出すサーバ URL |
```

更新後 (表の説明列を分離し, 表の下に短い注記で dev/本番差を述べる):
- 表の「説明」セルに `dev: http://localhost:3000 / 本番: 空（相対パス）` のような複数行で書く, または
- 表の直下に「dev では `http://localhost:3000` を指定する. 本番 (nginx 等で Web と API を同一ドメイン配信) では空にして相対パス `/api/...` で解決させる」と注記する.

採用: 表の直下の注記方式 (表のセル幅を保つため).

### quick-start.md A-2

現状:
```
> Web クライアントは **ビルド時に `VITE_*` を埋め込む**ため、`VITE_API_BASE_URL` は次の step より前に決めておく。
> パスワードと認証トークンはビルド時に埋め込まれない。
```

更新後 (上記引用ブロックを 2 段に分離し dev 想定を明示):
- 1 段目: Web (build 時埋め込み) と サーバ dev 起動 (env はランタイム読み) の違いを述べる.
- 2 段目: A-2 の値 `http://localhost:3000` は dev 想定. 本番では空文字 (相対パス) を選ぶ.

### テスト

`__tests__/docs/api-base-url-doc-align.test.ts`:

- setup/server.md に「本番」「相対パス」「空」のいずれかに相当する説明が `VITE_API_BASE_URL` の付近に存在する.
- quick-start.md A-2 セクションに「dev」「本番」「相対パス」のいずれかに相当する区別の説明が存在する.
- 既存テスト (`onboarding-doc-repair.test.ts` / `faq-reset-time.test.ts` / `no-legacy-auth-refs.test.ts`) は退行しない.

## 重要な決定

- **D-1**: 表ではなく注記方式を採用 (表のセル幅維持).
- **D-2**: `.env.example` のコメントを正本扱い (内容を変更しない).
- **D-3**: ADR は作らない (env の使い分けは既に `.env.example` で確定済の事実整理にとどまる).

## テスト方針

- 単体テスト: 上記 grep ベース 1 ファイル.
- 手動確認: 3 文書を続けて読んで矛盾がないこと.
