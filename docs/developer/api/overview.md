# API 概要

> API の共通方針。エンドポイント定義は [`openapi.yaml`](openapi.yaml) を正とする。

## 基本方針

- プロトコル / スタイル: TODO: <REST / GraphQL / gRPC>
- ベース URL: `TODO:`
- データ形式: TODO: <例: application/json>

## バージョニング

- 方式: TODO: <例: URL パス /v1, ヘッダ>

## 認証 / 認可

- 認証方式: TODO: <例: Bearer Token / OAuth2>
- TODO: <トークン取得・権限スコープ>

## エラー形式

```json
{
  "error": {
    "code": "TODO_ERROR_CODE",
    "message": "<人間向けメッセージ>"
  }
}
```

| HTTP | 用途 |
| --- | --- |
| 400 | リクエスト不正 |
| 401 / 403 | 認証 / 認可エラー |
| 404 | リソースなし |
| 500 | サーバエラー |

## ページング / ソート / レート制限

- TODO:
