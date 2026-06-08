# 仕様: プロジェクト管理（作成・名称変更・削除）

- 状態: 確定
- 関連: BL-016（プロジェクト管理）
- 機能要件参照: FR-020 / FR-021 / FR-022 / OOS-010

## 背景 / 課題

Todica はタスク管理アプリであり、現在タスクを「プロジェクト」でグループ化する機能が存在しない。
`tasks.project_id` カラムおよび `projects` テーブルはデータモデル上すでに定義済みだが（BL-001 時点）、
CRUD エンドポイントと管理 UI が未実装のため利用できない。
この機能はプロジェクトの作成・名称変更・削除を提供し、タスク起票時のプロジェクト選択を可能にする。

## ゴール / 非ゴール

- ゴール:
  - プロジェクトを作成できる（FR-020）
  - プロジェクトの名称を変更できる（FR-021）
  - プロジェクトを削除できる（FR-022）
  - タスク起票フォームでプロジェクトを選択できる（プロジェクト一覧ドロップダウン）
  - プロジェクト削除時、紐付くタスクの `projectId` を null にする（カスケード NULL）
- 非ゴール:
  - アーカイブ（プロジェクトを非表示にする機能）は提供しない（OOS-010 に準ずる）
  - PM ツール的な機能（担当者・期限・優先度・ガントチャート・工数管理）は提供しない
  - プロジェクト間でのタスク移動 UI は提供しない（タスク PATCH で `projectId` を変更することで対応）
  - プロジェクト名の一意性保証は行わない（同名プロジェクトを複数作成可能）

## 要件

- 機能要件:
  - FR-020: プロジェクトを作成できる（name は 1〜200 文字、制御文字禁止）
  - FR-021: プロジェクトの名称を変更できる（楽観ロック必須）
  - FR-022: プロジェクトを削除できる（楽観ロック必須、紐付くタスクは null 化）
  - プロジェクト一覧を取得できる（name 昇順ソート）
  - タスク起票フォームでプロジェクト一覧からプロジェクトを選択できる
- 非機能要件:
  - 全書き込み操作は Idempotency-Key 必須（冪等性保証）
  - 名称変更・削除は If-Match による楽観ロック必須

## 受け入れ基準

### プロジェクト作成（FR-020）

```
シナリオ: 正常系 - プロジェクトを作成できる
  Given 認証済みクライアントが Idempotency-Key ヘッダを付与している
  When  POST /api/v1/projects に { name: "仕事" } を送信する
  Then  201 Created で { project: { id, name: "仕事", version: 1, createdAt, updatedAt } } が返る
  And   GET /api/v1/projects の一覧に "仕事" が含まれる

シナリオ: 正常系 - 同名プロジェクトを複数作成できる
  Given "仕事" という名前のプロジェクトがすでに存在する
  When  POST /api/v1/projects に { name: "仕事" } を別の Idempotency-Key で送信する
  Then  201 Created で新しいプロジェクトが返る
  And   GET /api/v1/projects の一覧に "仕事" が 2 件含まれる

シナリオ: 冪等性 - 同じ Idempotency-Key で 2 回 POST すると 1 件しか作成されない
  Given 認証済みクライアントが同じ Idempotency-Key でリクエストを送信する
  When  POST /api/v1/projects に同じ Idempotency-Key で 2 回送信する
  Then  2 回目は 1 回目と同じ 201 レスポンスが返る
  And   プロジェクトは 1 件のみ作成されている

シナリオ: バリデーション - 空の name は拒否される
  Given 認証済みクライアントが Idempotency-Key ヘッダを付与している
  When  POST /api/v1/projects に { name: "" } を送信する
  Then  400 Bad Request で { code: "INVALID_PROJECT_NAME" } が返る

シナリオ: バリデーション - 201 文字以上の name は拒否される
  Given 認証済みクライアントが Idempotency-Key ヘッダを付与している
  When  POST /api/v1/projects に 201 文字の name を送信する
  Then  400 Bad Request で { code: "INVALID_PROJECT_NAME" } が返る

シナリオ: バリデーション - 制御文字を含む name は拒否される
  Given 認証済みクライアントが Idempotency-Key ヘッダを付与している
  When  POST /api/v1/projects に制御文字（例: ""）を含む name を送信する
  Then  400 Bad Request で { code: "INVALID_PROJECT_NAME" } が返る

シナリオ: Idempotency-Key なしは拒否される
  Given 認証済みクライアントが Idempotency-Key ヘッダを付与していない
  When  POST /api/v1/projects に { name: "仕事" } を送信する
  Then  400 Bad Request で { code: "MISSING_IDEMPOTENCY_KEY" } が返る

シナリオ: 認証なしは拒否される
  Given 未認証クライアントがリクエストを送信する
  When  POST /api/v1/projects に { name: "仕事" } を送信する
  Then  401 Unauthorized で { code: "UNAUTHORIZED" } が返る
```

### プロジェクト一覧取得

```
シナリオ: 正常系 - プロジェクト一覧が name 昇順で返る
  Given "仕事" と "個人" という名前のプロジェクトが存在する
  When  GET /api/v1/projects を送信する
  Then  200 OK で { projects: [...] } が返る
  And   一覧は name 昇順（Unicode コードポイント順 = "仕事", "個人" の順）である

シナリオ: 正常系 - プロジェクトが 0 件のとき空配列が返る
  Given プロジェクトが 1 件も存在しない
  When  GET /api/v1/projects を送信する
  Then  200 OK で { projects: [] } が返る

シナリオ: 認証なしは拒否される
  Given 未認証クライアントがリクエストを送信する
  When  GET /api/v1/projects を送信する
  Then  401 Unauthorized で { code: "UNAUTHORIZED" } が返る
```

### プロジェクト名称変更（FR-021）

```
シナリオ: 正常系 - プロジェクトの名称を変更できる
  Given プロジェクト（id: "p-1", name: "仕事", version: 1）が存在する
  When  PATCH /api/v1/projects/p-1 に If-Match: 1, Idempotency-Key 付きで { name: "仕事2" } を送信する
  Then  200 OK で { project: { id: "p-1", name: "仕事2", version: 2, updatedAt: <更新後> } } が返る

シナリオ: 楽観ロック衝突 - If-Match が現行 version と不一致
  Given プロジェクト（id: "p-1", version: 2）が存在する
  When  PATCH /api/v1/projects/p-1 に If-Match: 1 で送信する
  Then  412 Precondition Failed で { project: <現行プロジェクト> } が返る

シナリオ: If-Match ヘッダなしは拒否される
  Given プロジェクト（id: "p-1"）が存在する
  When  PATCH /api/v1/projects/p-1 に If-Match ヘッダなしで送信する
  Then  400 Bad Request で { code: "MISSING_IF_MATCH" } が返る

シナリオ: 存在しない id への PATCH は 404
  Given id: "nonexistent" のプロジェクトは存在しない
  When  PATCH /api/v1/projects/nonexistent に送信する
  Then  404 Not Found で { code: "PROJECT_NOT_FOUND" } が返る

シナリオ: バリデーション - 空の name は拒否される
  Given プロジェクト（id: "p-1", version: 1）が存在する
  When  PATCH /api/v1/projects/p-1 に { name: "" } を送信する
  Then  400 Bad Request で { code: "INVALID_PROJECT_NAME" } が返る
```

### プロジェクト削除（FR-022）

```
シナリオ: 正常系 - プロジェクトを削除できる
  Given プロジェクト（id: "p-1", version: 1）が存在し、紐付くタスクが 0 件である
  When  DELETE /api/v1/projects/p-1 に If-Match: 1, Idempotency-Key 付きで送信する
  Then  204 No Content が返る
  And   GET /api/v1/projects の一覧に "p-1" が含まれない

シナリオ: カスケード NULL - 削除したプロジェクトに紐付くタスクの projectId が null になる
  Given プロジェクト（id: "p-1", version: 1）が存在し、タスク（projectId: "p-1"）が 1 件存在する
  When  DELETE /api/v1/projects/p-1 に If-Match: 1, Idempotency-Key 付きで送信する
  Then  204 No Content が返る
  And   該当タスクの projectId が null になっている
  And   該当タスクはゴミ箱に移動していない（trashedAt = null のまま）

シナリオ: 楽観ロック衝突 - If-Match が現行 version と不一致
  Given プロジェクト（id: "p-1", version: 2）が存在する
  When  DELETE /api/v1/projects/p-1 に If-Match: 1 で送信する
  Then  412 Precondition Failed で { project: <現行プロジェクト> } が返る

シナリオ: If-Match ヘッダなしは拒否される
  Given プロジェクト（id: "p-1"）が存在する
  When  DELETE /api/v1/projects/p-1 に If-Match ヘッダなしで送信する
  Then  400 Bad Request で { code: "MISSING_IF_MATCH" } が返る

シナリオ: Idempotency-Key なしは拒否される
  Given プロジェクト（id: "p-1"）が存在する
  When  DELETE /api/v1/projects/p-1 に Idempotency-Key ヘッダなしで送信する
  Then  400 Bad Request で { code: "MISSING_IDEMPOTENCY_KEY" } が返る

シナリオ: 存在しない id への DELETE は 404
  Given id: "nonexistent" のプロジェクトは存在しない
  When  DELETE /api/v1/projects/nonexistent に If-Match: 1, Idempotency-Key 付きで送信する
  Then  404 Not Found で { code: "PROJECT_NOT_FOUND" } が返る

シナリオ: 認証なしは拒否される
  Given 未認証クライアントがリクエストを送信する
  When  DELETE /api/v1/projects/p-1 を送信する
  Then  401 Unauthorized で { code: "UNAUTHORIZED" } が返る
```

### Web クライアント - プロジェクト選択

```
シナリオ: 起票フォームにプロジェクト選択ドロップダウンが表示される
  Given プロジェクト「仕事」と「個人」が存在する
  When  TodayView の起票フォームが表示される
  Then  「プロジェクト」ドロップダウンに「仕事」と「個人」の選択肢が表示される
  And   「（未分類）」という選択肢も含まれる

シナリオ: プロジェクトを選択してタスクを起票できる
  Given プロジェクト「仕事」（id: "p-1"）が存在する
  When  起票フォームでプロジェクト「仕事」を選択してタスクを追加する
  Then  POST /api/v1/tasks に { projectId: "p-1" } が含まれる

シナリオ: プロジェクト未選択（未分類）でタスクを起票できる
  Given プロジェクトが 1 件も存在しない、または「（未分類）」を選択している
  When  起票フォームでプロジェクトを選択せずタスクを追加する
  Then  POST /api/v1/tasks に { projectId: null } が含まれる
```

### Web クライアント - ProjectsView（プロジェクト管理 UI）

```
シナリオ: プロジェクト一覧が表示される
  Given プロジェクト「仕事」と「個人」が存在する
  When  /projects ページを開く
  Then  「仕事」と「個人」がリスト表示される

シナリオ: プロジェクトを作成できる
  Given /projects ページが表示されている
  When  名称「趣味」を入力して作成ボタンを押す
  Then  「趣味」がプロジェクト一覧に追加される

シナリオ: プロジェクトの名称を変更できる
  Given プロジェクト「仕事」が一覧に表示されている
  When  「仕事」の名称変更ボタンを押し、「仕事2」と入力して保存する
  Then  一覧の表示が「仕事2」に更新される

シナリオ: プロジェクトを削除できる
  Given プロジェクト「仕事」が一覧に表示されている
  When  「仕事」の削除ボタンを押す
  Then  「仕事」がプロジェクト一覧から消える
```

## 未決事項 / 確認待ち

なし（設計方針はすべて確定済み）
