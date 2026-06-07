# 仕様: タスク CRUD（起票・名称編集・期限切替・削除）

- 状態: ドラフト
- 関連: [`../../planning/backlog.md`](../../planning/backlog.md) BL-001 / BL-004 / BL-012
- 由来要件: FR-001（タスク起票）/ FR-002（期限値域）/ FR-005（期限切替）/ FR-007（削除）/ FR-008（2 階層固定）/ FR-009（名称編集）
- 関連 NFR: NFR-001（単一ワークフロー）/ NFR-002（マルチユーザー概念なし）/ NFR-010（最小手数の起票）/ NFR-011（フォーカス時単独大表示）/ NFR-012（設定項目最小化）/ NFR-013（並び順の予測可能性）/ NFR-020（日次整合）/ NFR-021（単一ユーザーデータ）

## 背景 / 課題

Todica は「やること」を最小手数で書き留め, "今やる 1 つ" に集中するためのツールである. その骨格となるのが **タスクという最小単位の作業項目** に対する起票・編集・削除である. これらの基本操作が成立しないと, 後続のフォーカス機能（BL-006）・今日ビュー（BL-005）・完了アクション（BL-003）など他のすべての P0 バックログが動かない. 本機能はそのための **タスクのライフサイクル（起票 → 編集 → 削除）の正本** をサーバ側に確立する.

加えて, project.md が掲げる「設定で迷わない」「気軽・高速にタスク化できる」「プロジェクト → タスクの 2 階層に固定」というプロダクトの基本姿勢を, 本機能の制約として最初から実装に焼き付ける. 期限の値域を today/tomorrow の 2 値に絞り（FR-002）, サブタスク・ネスト構造を持たない（FR-008）ことを, 入力バリデーションと API スキーマで担保する.

## ゴール / 非ゴール

### ゴール

- タスクの **起票** ができる（FR-001, NFR-010）.
- タスクの **名称** を後から変更できる（FR-009）.
- タスクの **期限** を today / tomorrow の 2 値間で切り替えられる（FR-002, FR-005）.
- タスクの **削除アクション** が動き, 対象がゴミ箱状態（`trashedAt != null`, `trashedReason = "deleted"`）に遷移する（FR-007, FR-060）.
- これらの操作が **API（REST + Idempotency-Key + If-Match）** と **Web クライアント UI** の双方で動く.
- スキーマ上は **プロジェクト → タスクの 2 階層を超えない**（FR-008）.

### 非ゴール

- 優先度の変更（FR-003 / FR-004）→ BL-002 に分離.
- 完了アクション・完了数カウント加算（FR-006 / FR-040）→ BL-003 に分離.
- 今日ビューの並び順・現在のタスク（フォーカス）の選択 → BL-005 / BL-006 に分離. 本機能は CRUD のみを担当し, 並び順は `dueDate` / `priority` / `createdAt` の組合せで参照できる形にしておくに留める.
- ゴミ箱の閲覧・復元・「空にする」→ BL-011 に分離. 本機能では「削除アクションで `trashedAt` を立てる」までを担当する.
- 自動繰越（FR-051）・日次リセット（FR-043）→ BL-010 に分離. ただし `trashedAt` / `trashedReason` / `dueDate` のスキーマは後段で活用できる形で確定させる.
- プロジェクトの作成・編集・削除（FR-020 / FR-022）→ BL-016 に分離. 本機能では `projectId` の **参照整合性チェック**（存在する Project の `id` か, null か）のみを行う. プロジェクトを作る UI は持たない.
- ルーティン由来タスク（FR-031）の生成 → BL-017 に分離. 本機能では `origin = "manual"` 固定のタスクのみを起票対象とする. `origin = "routine"` のタスクの編集・削除操作はスキーマ上の整合性のみ確認し, 生成経路は扱わない.
- 認証トークンの発行・ローテーション → BL-013 で扱う. 本機能では「Bearer トークン未提示なら 401 を返す」というミドルウェア経路の利用のみ.
- PWA 化・オフライン書込みキュー → BL-018 に分離. 本機能では同期 API として動くことのみを保証する. ただしサーバ側は `Idempotency-Key` の冪等処理を実装し, 将来のオフライン書込みキュー（再送）に備える.

## 要件

### 機能要件

本機能で実装する FR は以下のとおり.

- **FR-001 (タスクの起票)**
  - 利用者は粒度を問わずタスクを起票できる.
  - 起票時, プロジェクトに紐づけても良いし, 紐づけずに単独タスク（`projectId = null`）として登録しても良い.
  - 起票時の必須入力は **タスク名のみ**. `dueDate` / `priority` は既定値で起票できること（NFR-010）.
- **FR-002 (期限値域 today / tomorrow)**
  - 起票時の既定値は `"today"`.
  - 設定可能な値は `"today"` または `"tomorrow"` の 2 値のみ. それ以外の値はバリデーションエラーで弾く.
- **FR-005 (今日 → 明日 への期限切替)**
  - 登録済みタスクの `dueDate` を `"today"` ↔ `"tomorrow"` の 2 値の範囲内で切り替えられる.
  - 切替は PATCH `/tasks/{id}` で表現する. 本機能は API としての切替を提供する（今日ビュー上の専用導線 = FR-014 は BL-005 / BL-007 のスコープ）.
- **FR-007 (削除アクション)**
  - 削除されたタスクは **ゴミ箱状態** に遷移する（`trashedAt` を `now`, `trashedReason` を `"deleted"` に設定）.
  - 削除は完了数カウントに **含めない**（カウント変更は本機能では一切行わない）.
- **FR-009 (タスク名称の編集)**
  - 登録済みタスクの `name` を任意に変更できる.

加えて, 本機能スコープには直接含まれないが構造的に関係する以下を **スキーマ・API 設計上で担保** する.

- **FR-008 (2 階層固定)**: Task に `parentTaskId` 相当のフィールドを **作らない**. サブタスク・ネストを構造的に表現できないようにする.
- **FR-060 (ゴミ箱経由)**: 削除は「物理削除」ではなく `trashedAt` を立てる遷移として実装する. 物理削除は BL-010（日次リセット）・BL-011（ゴミ箱「空にする」）が担当する.

### 非機能要件

- **NFR-001 (単一ワークフロー)**: 起票フォームに「タスク名」「プロジェクト選択（任意）」「期限（既定 today, 値域 today / tomorrow）」以外の入力欄を置かない. ステータス・タグ・開始日・カスタムフィールドは UI からも API からも提供しない.
- **NFR-002 (マルチユーザー概念なし)**: タスクの API レスポンスに `userId` / `tenantId` / `ownerId` / `assigneeId` 等を含めない. データベーススキーマにも同等のカラムを持たない.
- **NFR-010 (最小手数の起票)**: 起票は **「タスク名を入力して Enter / 送信ボタン」のみで完結** すること. 既定値（`dueDate = "today"`, `priority = "normal"`, `projectId = null`, `origin = "manual"`）は API 側で自動補完するか, UI 側で初期値として持つ.
- **NFR-012 (設定項目最小化)**: 「タスク作成時の既定期限を変える」などのユーザー設定を提供しない.
- **NFR-013 (並び順の予測可能性)**: 本機能の責務は CRUD だが, 編集・期限切替によって `updatedAt` が更新されるため, 今日ビュー（BL-005）が二次キーに採用しうるフィールド（`createdAt`）を **不変** に保つこと（編集で `createdAt` を書き換えない）.
- **NFR-020 (日次整合)**: 全書き込み操作は 1 トランザクション内で `version = version + 1`, `updatedAt = now()` を必ず行う. クライアントから `Idempotency-Key` で再送されても同一の結果を返す（二重作成・二重削除を起こさない）.
- **NFR-021 (単一ユーザーデータ)**: タスクは単一のサーバインスタンスに保持され, クライアント間の同期は前提としない.

## 受け入れ基準

> 書き方は [`../../quality/acceptance-criteria.md`](../../quality/acceptance-criteria.md) に従う. Gherkin の Given/When/Then で表現し, 後続の test-designer がそのままテストに落とせる粒度とする.

### 起票（FR-001 / FR-002 / NFR-010）

```
シナリオ: タスク名のみでタスクを起票できる
  Given 認証済みのリクエストである
  And   サーバには既存タスクが 1 件もない
  When  クライアントが POST /api/v1/tasks を { "id": <UUIDv4>, "name": "牛乳を買う" } で送る
  And   ヘッダに Idempotency-Key として上記 id と同じ値を付ける
  Then  HTTP 201 Created が返る
  And   レスポンスボディの task は { id, name: "牛乳を買う", projectId: null, dueDate: "today", priority: "normal", origin: "manual", routineId: null, trashedAt: null, trashedReason: null, version: 1, createdAt, updatedAt } を含む
  And   GET /api/v1/tasks の結果に該当タスクが 1 件存在する
```

```
シナリオ: 起票時にプロジェクトを指定できる
  Given 認証済みのリクエストである
  And   既存のプロジェクト P1 が 1 件存在する
  When  クライアントが POST /api/v1/tasks を { "id": <UUIDv4>, "name": "資料を作る", "projectId": "<P1 の id>" } で送る
  Then  HTTP 201 Created が返り, 作成されたタスクの projectId が P1 の id に一致する
```

```
シナリオ: 存在しないプロジェクト ID を指定した起票は弾かれる
  Given 認証済みのリクエストである
  And   サーバに該当 ID のプロジェクトは存在しない
  When  クライアントが POST /api/v1/tasks を { "id": <UUIDv4>, "name": "x", "projectId": "non-existent" } で送る
  Then  HTTP 400 Bad Request が返り, レスポンスボディの code が "PROJECT_NOT_FOUND" である
  And   タスクは作成されない
```

```
シナリオ: 起票時の dueDate を tomorrow に指定できる
  Given 認証済みのリクエストである
  When  クライアントが POST /api/v1/tasks を { "id": <UUIDv4>, "name": "x", "dueDate": "tomorrow" } で送る
  Then  HTTP 201 Created が返り, 作成されたタスクの dueDate が "tomorrow" である
```

```
シナリオ: 値域外の dueDate を指定した起票は弾かれる（FR-002）
  Given 認証済みのリクエストである
  When  クライアントが POST /api/v1/tasks を { "id": <UUIDv4>, "name": "x", "dueDate": "2026-06-10" } で送る
  Then  HTTP 400 Bad Request が返り, レスポンスボディの code が "INVALID_DUE_DATE" である
  And   タスクは作成されない
```

```
シナリオ: 空文字の name を指定した起票は弾かれる
  Given 認証済みのリクエストである
  When  クライアントが POST /api/v1/tasks を { "id": <UUIDv4>, "name": "" } で送る
  Then  HTTP 400 Bad Request が返り, レスポンスボディの code が "INVALID_TASK_NAME" である
```

### 冪等性（NFR-020）

```
シナリオ: 同じ Idempotency-Key で 2 回起票しても 1 件しか作成されない
  Given 認証済みのリクエストである
  When  クライアントが POST /api/v1/tasks を { "id": "k1", "name": "牛乳を買う" } で送る
  And   サーバが 201 を返した後, クライアントが同じリクエスト（id = "k1", Idempotency-Key = "k1"）をもう一度送る
  Then  2 回目も HTTP 201 Created が返り, レスポンスの task は 1 回目と同じ内容である
  And   GET /api/v1/tasks の結果は該当タスクが 1 件のみである
```

### 名称編集（FR-009）

```
シナリオ: タスクの名称を編集できる
  Given 認証済みのリクエストである
  And   "牛乳を買う" という名前のタスク T が version = 1 で存在する
  When  クライアントが PATCH /api/v1/tasks/<T の id> を { "name": "豆乳を買う" } で送る
  And   ヘッダに If-Match: 1 を付ける
  Then  HTTP 200 OK が返り, レスポンスの task の name が "豆乳を買う", version が 2 である
  And   createdAt は変更されていない
  And   updatedAt は変更されている
```

```
シナリオ: 編集 PATCH で送らなかったフィールドは変更されない
  Given タスク T が { name: "x", projectId: "P1", dueDate: "today", priority: "normal", version: 1 } で存在する
  When  クライアントが PATCH /api/v1/tasks/<T の id> を { "name": "y" }, If-Match: 1 で送る
  Then  HTTP 200 OK が返り, task の projectId, dueDate, priority は元の値のまま, name が "y", version が 2 になる
```

### 期限切替（FR-005）

```
シナリオ: タスクの期限を today から tomorrow に切り替えられる
  Given タスク T が { dueDate: "today", version: 1 } で存在する
  When  クライアントが PATCH /api/v1/tasks/<T の id> を { "dueDate": "tomorrow" }, If-Match: 1 で送る
  Then  HTTP 200 OK が返り, task の dueDate が "tomorrow", version が 2 になる
```

```
シナリオ: タスクの期限を tomorrow から today に切り替えられる
  Given タスク T が { dueDate: "tomorrow", version: 1 } で存在する
  When  クライアントが PATCH /api/v1/tasks/<T の id> を { "dueDate": "today" }, If-Match: 1 で送る
  Then  HTTP 200 OK が返り, task の dueDate が "today", version が 2 になる
```

```
シナリオ: 期限値域外への切替は弾かれる
  Given タスク T が { dueDate: "today", version: 1 } で存在する
  When  クライアントが PATCH /api/v1/tasks/<T の id> を { "dueDate": "next-week" }, If-Match: 1 で送る
  Then  HTTP 400 Bad Request が返り, レスポンスの code が "INVALID_DUE_DATE" である
  And   task の dueDate は "today" のまま, version は 1 のままである
```

### 楽観ロック（NFR-020）

```
シナリオ: 古い version で編集すると 412 が返り, サーバ側現行値が返却される
  Given タスク T が version = 2 で存在する
  When  クライアントが PATCH /api/v1/tasks/<T の id> を { "name": "x" }, If-Match: 1 で送る
  Then  HTTP 412 Precondition Failed が返る
  And   レスポンスボディに現行 task（version = 2 の状態）が含まれる
  And   サーバ側の task は変更されない
```

```
シナリオ: If-Match ヘッダが欠落した編集リクエストは弾かれる
  Given タスク T が version = 1 で存在する
  When  クライアントが PATCH /api/v1/tasks/<T の id> を If-Match なしで送る
  Then  HTTP 400 Bad Request が返り, レスポンスの code が "MISSING_IF_MATCH" である
```

### 削除（FR-007 / FR-060）

```
シナリオ: タスクを削除するとゴミ箱状態になる（物理削除ではない）
  Given タスク T が { trashedAt: null, version: 1 } で存在する
  When  クライアントが DELETE /api/v1/tasks/<T の id> を If-Match: 1 で送る
  Then  HTTP 204 No Content が返る
  And   ストアの task は引き続き存在し, trashedAt は null ではなく, trashedReason は "deleted", version は 2 になっている
  And   GET /api/v1/tasks の既定（ゴミ箱外）結果には T が含まれない
```

```
シナリオ: 削除アクションは完了数カウントを増やさない
  Given Counter.completedCount が 0 である
  And   タスク T が { trashedAt: null } で存在する
  When  クライアントが DELETE /api/v1/tasks/<T の id> を送る
  Then  HTTP 204 が返り, Counter.completedCount は 0 のままである
```

```
シナリオ: 既にゴミ箱状態のタスクへの削除は no-op（冪等）
  Given タスク T が trashedAt != null, trashedReason = "deleted" で存在する
  When  クライアントが DELETE /api/v1/tasks/<T の id> を送る
  Then  HTTP 204 No Content が返り, ストアの T の trashedAt / trashedReason は変わらない
```

### 認証 / 存在しないリソース（NFR-002 と整合）

```
シナリオ: Bearer トークンを付けないリクエストは 401 を返す
  Given 認証ミドルウェアが有効である
  When  クライアントが Authorization ヘッダなしで POST /api/v1/tasks を送る
  Then  HTTP 401 Unauthorized が返り, タスクは作成されない
```

```
シナリオ: 存在しない id への編集は 404 を返す
  Given サーバに該当 id のタスクが存在しない
  When  クライアントが PATCH /api/v1/tasks/<存在しない id> を送る
  Then  HTTP 404 Not Found が返り, レスポンスの code が "TASK_NOT_FOUND" である
```

### 2 階層固定（FR-008）

```
シナリオ: タスクのスキーマにサブタスクを表す参照を持たない
  Given OpenAPI 定義の Task スキーマが確定している
  When  Task スキーマのプロパティ一覧を確認する
  Then  parentTaskId / subtaskIds / children / parent といったサブタスクを示すフィールドが存在しない
  And   API レスポンスにも同フィールドが含まれない
```

### Web クライアント UI（NFR-001 / NFR-010）

```
シナリオ: 今日ビューの起票フォームはタスク名のみ必須である
  Given Web クライアントが起動済みで, 今日ビューが表示されている
  When  起票フォームを開く
  Then  入力必須は「タスク名」のみで, 「プロジェクト（任意）」「期限（既定 today, 値域 today / tomorrow）」が任意項目として存在する
  And   ステータス・タグ・開始日・カスタムフィールド・サブタスクなどの入力欄は存在しない
```

```
シナリオ: 起票フォームでタスク名を入力して送信するとタスクが追加される
  Given 今日ビューが表示されている
  When  起票フォームに "牛乳を買う" と入力し送信する
  Then  サーバへの POST /api/v1/tasks が送られる
  And   起票が成功すると, 今日ビューに "牛乳を買う" のタスクが現れる
```

```
シナリオ: 既存タスクの名称を編集して保存できる
  Given 今日ビューに既存タスク "牛乳" が表示されている
  When  タスクの編集 UI を開き, 名称を "豆乳" に変更して保存する
  Then  サーバへの PATCH /api/v1/tasks/<id> が If-Match 付きで送られ, 成功すると今日ビューの表示も "豆乳" に更新される
```

```
シナリオ: 期限を今日 ↔ 明日 で切り替える操作を提供する
  Given 今日ビューに既存タスクが表示されている
  When  タスクの期限切替 UI（トグル相当）を操作する
  Then  PATCH /api/v1/tasks/<id> が dueDate の新しい値で送られる
  ※ 今日ビューから「明日」へ移したタスクが今日ビューの表示からどう外れるかの挙動は BL-007（今日 → 明日 切替の今日ビュー導線）で確定する
```

```
シナリオ: 削除アクションを実行するとタスクが今日ビューから消える
  Given 今日ビューに既存タスクが表示されている
  When  タスクの削除 UI を実行する
  Then  DELETE /api/v1/tasks/<id> が送られ, 成功すると今日ビューの表示から消える
  And   完了数カウントの表示は増加しない（カウント UI は BL-008 が提供. 本機能は加算が起きないことのみ担保）
```

## 未決事項 / 確認待ち

- **U-001 起票成功時のレスポンスボディ形状**: POST `/tasks` の 201 レスポンスに作成された task 全体を返すか, ID のみを返すかは feature 内で決める必要がある. **保守側デフォルト案: task 全体を返す**（クライアントが GET を追加発行せず楽観 UI を確定できるため）.
- **U-002 PATCH の部分更新セマンティクス**: 本仕様では PATCH を「送ったフィールドのみ更新」とする前提で受け入れ基準を書いた. JSON Merge Patch（`null` を送ると null クリア）/ JSON Patch（操作配列）/ 単純な部分上書きのどれを採るかは plan.md で確定する. **保守側デフォルト案: 単純な部分上書き. ただし `projectId` は明示的に `null` を許容**（プロジェクト紐付けの解除を表現するため）.
- **U-003 削除リクエストの If-Match 必須性**: 楽観ロックを削除にも適用するか. **保守側デフォルト案: 必須**（OpenAPI 骨格でも `IfMatch` が delete に付与されている）. ただし「既に削除済みのタスクに対する再 DELETE が version 衝突するのは UX を悪化させる」ため, 削除済み（`trashedAt != null` かつ `trashedReason = "deleted"`）相手の DELETE は 204 を返し冪等扱いとする.
- **U-004 トークン以外の代替認証**: ADR-0010 Au3「プライベートネットワーク内では認証なし許容」を本機能で利用可能とするかは BL-013 側で確定. 本機能の受け入れ基準は「認証ありの構成」を前提に書いた.
- **U-005 タスク名の最大長 / 文字種**: project.md / requirements.md に明示なし. **保守側デフォルト案: 1 文字以上 200 文字以内, 制御文字（改行・タブ・NUL）を除く UTF-8 文字列**（一般的なタスク管理ツールの値域に倣う）. 実装前にユーザー確認したい.
- **U-006 タスク一覧 API のフィルタ仕様**: GET `/tasks` のクエリパラメータ（`includeTrashed` 等）は本機能スコープ内に含めるか, ゴミ箱閲覧（BL-011）に委ねるか. **保守側デフォルト案: 本機能では `?trashed=<true|false|all>`（既定 false）のみ提供. 期限・プロジェクト等のフィルタは今日ビュー（BL-005）で `/today` を別途設けるため `/tasks` には載せない**.
- **U-007 origin = "routine" タスクの編集可否**: 本機能では `origin = "manual"` のみを対象とした. ルーティン由来タスクの編集・削除の振る舞いは BL-017 で確定する想定だが, **保守側デフォルト案: ルーティン由来タスクも本機能の API で編集・削除可能とし, 振る舞いは通常タスクと同じ**（ただし当日中に限る = 翌日には自動消滅. これは BL-010 / BL-017 の責務）.
