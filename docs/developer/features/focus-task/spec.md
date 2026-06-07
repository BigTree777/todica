# 仕様: 現在のタスク（フォーカス）と完了時の自動繰上げ

- 状態: ドラフト
- 関連: [`../../planning/backlog.md`](../../planning/backlog.md) BL-006
- 由来要件: FR-012（今日のタスクから 1 つを "現在のタスク" に選べる）/ FR-013（現在のタスクが完了されたら自動で次へ繰り上げる）
- 関連 NFR: NFR-011（現在のタスクは "大きく" 単独で表示されること）

## 背景 / 課題

Todica の中核体験 UC-001「今日のループを回す」は「今日のタスクから 1 つを選んで集中 → 完了で自動的に次へ」の一本道で成り立つ. 既に BL-005 で今日ビュー (`GET /api/v1/today`) が `tasks` と `nextTaskId`（並びの先頭 = 「次の 1 つ」のヒント）を返すようになり, 並び順は決定論的 (`priority → createdAt → id`) に確定している. しかし以下が未実装である.

- **「現在のタスク」を明示的に選ぶ操作**（FR-012）が, データ層・API・UI のいずれにも存在しない. `FocusSelection` エンティティは論理スキーマ ([`architecture/database/schema.md`](../../architecture/database/schema.md) §FocusSelection) に定義されているが, 物理スキーマ (drizzle) と Repository / API は無い.
- **`/api/v1/focus` エンドポイント**は `openapi.yaml` に GET / PUT の path 骨格だけが存在し, request / response schema は未定義. サーバ実装も未着手.
- **完了時の自動繰上げ**（FR-013）が成立していない. 現在のタスク = 今日ビュー先頭 が完了したとき, 「次に何が現在のタスクになるか」を保証する機構がサーバ側に無い. BL-005 で `nextTaskId` は出るが, それは「並びの先頭」であって「現在のタスク」ではない（spec の境界が曖昧なまま BL-006 に持ち越されている）.
- **UI 上の視覚的強調**（NFR-011 "大きく単独で表示"）が無い. 今日ビュー (`web/src/ui/today-view/today-view.tsx`) は `nextTaskId` を state に保持しているが描画には使われていない (L191-192 に `void nextTaskId` のコメント). 「現在のタスクを 1 つ選んで集中させる」体験が成立していない.

BL-006 は **FR-012 / FR-013 / NFR-011 を満たす形で「現在のタスク」の概念と自動繰上げを実装** することで, UC-001 の一本道を完成させる.

## ゴール / 非ゴール

### ゴール

- **「現在のタスク」を 1 つだけ持てる**（FR-012）. ユーザーが今日のタスクから 1 つを明示的に "現在" として選択でき, 同時に "現在" になれるのは 1 つだけ.
- **「現在のタスク」未選択時のフォールバックを定義する**. 明示的に選んでいない場合, 今日ビューの並びの先頭（= BL-005 の `nextTaskId`）を **暗黙の "現在のタスク"** として扱う（明示選択 = `FocusSelection.currentTaskId != null`, 未選択 = `FocusSelection.currentTaskId == null`）. これにより「アプリを開いたら何かしらの "今やる 1 つ" が常にある」状態を担保する.
- **`GET /api/v1/focus` で「現在のタスク」を取得できる**.
- **`PUT /api/v1/focus` で「現在のタスク」を明示設定 / 解除できる**. body `{ taskId: string }` で設定, `{ taskId: null }` で解除.
- **現在のタスクが完了されたら自動で次へ繰り上げる**（FR-013）. サーバ側 `POST /api/v1/tasks/:id/complete` のロジックに統合し, 完了対象が現在のタスクだった場合は `FocusSelection.currentTaskId` を `null` に解除する（解除後は「未選択 = 暗黙フォールバック = 今日ビューの新しい先頭」が新たな現在のタスクとなる）.
- **現在のタスクが今日ビューから消える経路でも整合性を保つ**. 完了（上記）に加え, 削除 (`DELETE /tasks/:id`) / 期限変更 (today → tomorrow) で対象が今日ビューから外れた場合も, それが現在のタスクなら `FocusSelection.currentTaskId` を `null` に解除する.
- **UI 上で「現在のタスク」を視覚的に強調する**（NFR-011）. 今日ビュー (`TodayView`) で現在のタスクを他のタスクと区別できる単独・大きい表示にする.
- **UI 上で「現在に設定」「現在解除」操作を提供する**. ユーザーが今日のタスクの中から任意の 1 つを現在のタスクに変更できる.
- **`FocusSelection` を `version` 付きの楽観ロック対象とする**. 他エンティティと同様に `If-Match` で衝突検知する.

### 非ゴール

- **今日ビュー以外（明日 / プロジェクト一覧 等）からのフォーカス操作** → 本 feature は今日ビュー上のフォーカス UI のみを提供する.
- **「現在のタスク」専用の独立ビュー（ルート分離した「フォーカス画面」）** → 今日ビューに統合した強調表示で NFR-011 を満たす（既存の `TodayView` 内で 1 タスクを大きく表示するレイアウトに留め, 専用ルートは作らない）. 「単独で大きく表示」は CSS / レイアウトで実現する.
- **複数タスクの "現在" 選択** → FR-012 により同時に 1 つだけ.
- **「現在のタスク」の履歴・統計** → UC-001 にも project.md §8 In Scope にも記載がなく, OOS-008（ルーティン履歴なし）の精神とも整合する形で本 feature は履歴を持たない.
- **完了による完了数カウントの +1 反映** → BL-008 / FR-040 の責務.
- **今日ビュー以外への自動繰上げ（例: 明日のタスクが繰り上がる）** → 「次のタスク」は今日ビュー (`dueDate = "today"`) の並びの中から選ぶ. 今日のタスクが 0 件になれば `currentTaskId = null` のまま.
- **ルーティン由来タスクと通常タスクで現在のタスク選択を区別する** → BL-005 と同じく区別しない. `dueDate = "today" && trashedAt = null` であれば全て対象.
- **オフライン / PWA 対応のキュー処理** → BL-018 の責務. 本 feature はオンライン HTTP 経由の動作のみ規定する.

## 要件

### 機能要件

本機能で実装する FR は以下のとおり.

- **FR-012（今日のタスクから 1 つを "現在のタスク" に選べる）**
  - ユーザーは今日ビュー上のタスクから任意の 1 つを「現在のタスク」に選択できる.
  - 同時に「現在のタスク」になれるのは 1 つだけ.
  - 「現在のタスク」が明示的に未選択でも, 今日のタスクが 1 件以上あれば「並びの先頭タスク」が暗黙の現在のタスクとして振る舞う（UC-001「アプリを開くと優先度順に出る」「1 つを選ぶと大きく表示」の入口体験を欠かさない目的）.
- **FR-013（現在のタスクが完了されたら自動で次へ繰り上げる）**
  - 「現在のタスク」を完了 (`POST /tasks/:id/complete`) すると, サーバ側で `FocusSelection` が更新され, 完了直後の今日ビュー再取得で「次の 1 つ」が新たな現在のタスクとして提示される.
  - 「現在のタスク」が削除 (`DELETE /tasks/:id`) / 期限変更 (today → tomorrow) されて今日ビューから外れる場合も同様に自動で解除される（保証する範囲: 「もう今日ビューに居ない id が `currentTaskId` として残り続けない」）.

### 非機能要件

- **NFR-011（現在のタスクは "大きく" 単独で表示されること）**
  - 今日ビュー上で「現在のタスク」が他のタスクと比べて視認の主役になる表示にする. 具体的な CSS / レイアウトは UI 実装の裁量に任せる（"視認の主役" を満たすことが要件）.
- **NFR-001（単一ワークフロー強制, 既存）**
  - 「現在のタスク」を変える操作は「今日ビュー上で別タスクを選ぶ」「現在を解除する」「現在のタスクを完了する」の 3 経路に限定する. それ以外のカスタマイズ UI は持たない.
- **NFR-013（並び順の予測可能性, 既存）**
  - 自動繰上げで「次の現在のタスク」になるのは, BL-005 で確定した並び順 (`priority → createdAt → id`) の先頭. 同じデータ状態なら常に同じ id が選ばれる.

### 認証 / 冪等性 / 楽観ロックの規約

- `/api/v1/focus` も他の書き込み API と同じく Bearer 認証必須 (`UNAUTHORIZED` で 401).
- `PUT /api/v1/focus` は `Idempotency-Key` ヘッダ必須 (`MISSING_IDEMPOTENCY_KEY` で 400). 既知のキーは保存済み応答を返す.
- `PUT /api/v1/focus` は `If-Match` ヘッダ必須. `FocusSelection.version` と不一致なら 412 を返し, ボディに現行 `FocusSelection` を含める.
- `GET /api/v1/focus` は読取専用 (Idempotency-Key / If-Match 不要).

## 受け入れ基準

> 書き方は [`../../quality/acceptance-criteria.md`](../../quality/acceptance-criteria.md) に従う. Gherkin の Given/When/Then で表現する.

### `FocusSelection` の初期状態と暗黙フォールバック（FR-012）

```
シナリオ: 初回アクセス時の FocusSelection はサーバ初期化時に 1 件存在し currentTaskId は null
  Given サーバを起動した直後で FocusSelection を一度も更新していない
  When  GET /api/v1/focus を呼ぶ
  Then  200 OK で { focus: { id: "singleton", currentTaskId: null, version: 1, updatedAt: <ISO 8601> } } が返る
```

```
シナリオ: currentTaskId が null のとき, 今日ビューの先頭タスクが暗黙の "現在のタスク" として扱える
  Given FocusSelection.currentTaskId = null
  And   今日ビューに タスク A (並び先頭), B が存在する
  When  クライアントが GET /api/v1/today と GET /api/v1/focus を取得する
  Then  GET /api/v1/today の nextTaskId は A.id
  And   GET /api/v1/focus の currentTaskId は null
  And   クライアントは「現在のタスク = currentTaskId ?? nextTaskId = A」と解釈できる
```

### `GET /api/v1/focus`（現在のタスク参照取得）

```
シナリオ: 認証なしの GET /api/v1/focus は 401
  Given Authorization ヘッダを付けない
  When  GET /api/v1/focus を呼ぶ
  Then  401 UNAUTHORIZED が返る
```

```
シナリオ: currentTaskId が設定済みのとき GET /api/v1/focus は当該 id を返す
  Given FocusSelection.currentTaskId = "task-X"
  When  GET /api/v1/focus を呼ぶ
  Then  200 OK で { focus: { id: "singleton", currentTaskId: "task-X", version: <N>, updatedAt: <ISO 8601> } } が返る
```

### `PUT /api/v1/focus`（明示設定 / 解除）

```
シナリオ: PUT /api/v1/focus で現在のタスクを明示設定できる
  Given FocusSelection.currentTaskId = null, version = 1
  And   タスク "task-X" が dueDate = "today", trashedAt = null で存在する
  When  PUT /api/v1/focus に { taskId: "task-X" } を Idempotency-Key と If-Match: "1" を付けて送る
  Then  200 OK で { focus: { currentTaskId: "task-X", version: 2, ... } } が返る
  And   以後の GET /api/v1/focus も同じ値を返す
```

```
シナリオ: PUT /api/v1/focus { taskId: null } で現在のタスクを解除できる
  Given FocusSelection.currentTaskId = "task-X", version = 5
  When  PUT /api/v1/focus に { taskId: null } を Idempotency-Key と If-Match: "5" を付けて送る
  Then  200 OK で { focus: { currentTaskId: null, version: 6, ... } } が返る
```

```
シナリオ: 今日のタスクでない id (dueDate = "tomorrow") を currentTaskId に設定しようとすると 400
  Given タスク "task-T" が dueDate = "tomorrow", trashedAt = null で存在する
  When  PUT /api/v1/focus に { taskId: "task-T" } を送る
  Then  400 INVALID_FOCUS_TARGET が返る
  And   FocusSelection の currentTaskId は変わらない
```

```
シナリオ: 存在しないタスク id を currentTaskId に設定しようとすると 400
  When  PUT /api/v1/focus に { taskId: "nonexistent-id" } を送る
  Then  400 INVALID_FOCUS_TARGET が返る
```

```
シナリオ: ゴミ箱状態 (trashedAt != null) のタスクを currentTaskId に設定しようとすると 400
  Given タスク "task-D" が trashedAt = <非 null> で存在する
  When  PUT /api/v1/focus に { taskId: "task-D" } を送る
  Then  400 INVALID_FOCUS_TARGET が返る
```

### 楽観ロック / 冪等性

```
シナリオ: If-Match なしの PUT /api/v1/focus は 400 MISSING_IF_MATCH
  When  PUT /api/v1/focus に { taskId: "task-X" } を If-Match なしで送る
  Then  400 MISSING_IF_MATCH が返る
```

```
シナリオ: If-Match の version 不一致は 412 を返し現行 focus を含める
  Given FocusSelection.version = 3
  When  PUT /api/v1/focus に If-Match: "2" で送る
  Then  412 が返る
  And   レスポンスボディに { focus: { version: 3, ... } } が含まれる
```

```
シナリオ: Idempotency-Key の再送は保存済み応答を返す (二重実行されない)
  Given 同じ Idempotency-Key で PUT /api/v1/focus を 1 回成功させた (version 1 → 2)
  When  まったく同じ Idempotency-Key + body + If-Match で再送する
  Then  保存済みの 200 OK 応答が返り, FocusSelection.version は 2 のまま (3 に進まない)
```

### 自動繰上げ: 完了経路（FR-013, 主シナリオ）

```
シナリオ: 現在のタスクを完了するとサーバ側で currentTaskId が null に解除される
  Given 今日のタスク A, B, C が priority → createdAt → id の順で並ぶ
  And   FocusSelection.currentTaskId = A.id
  When  POST /api/v1/tasks/{A.id}/complete を呼ぶ
  Then  200 OK が返る
  And   その後の GET /api/v1/focus は currentTaskId = null を返す
  And   その後の GET /api/v1/today の nextTaskId は B.id である
  And   クライアントは「現在のタスク = null ?? nextTaskId = B」と解釈できる (暗黙フォールバック)
```

```
シナリオ: 現在のタスクではないタスクを完了しても currentTaskId は変わらない
  Given FocusSelection.currentTaskId = A.id
  And   今日のタスク A, B, C が存在する
  When  POST /api/v1/tasks/{C.id}/complete を呼ぶ
  Then  GET /api/v1/focus は currentTaskId = A.id のままを返す
```

```
シナリオ: 今日のタスクが現在のタスク 1 件だけのときに完了すると, その後の nextTaskId は null
  Given FocusSelection.currentTaskId = A.id
  And   今日のタスクは A のみ
  When  POST /api/v1/tasks/{A.id}/complete を呼ぶ
  Then  GET /api/v1/focus は currentTaskId = null
  And   GET /api/v1/today の nextTaskId は null
  And   今日ビューに表示するタスクは無い (「現在のタスク」も存在しない)
```

### 自動繰上げ: 削除 / 期限変更経路

```
シナリオ: 現在のタスクを削除すると currentTaskId が null に解除される
  Given FocusSelection.currentTaskId = A.id
  When  DELETE /api/v1/tasks/{A.id} を呼ぶ
  Then  204 が返る
  And   その後の GET /api/v1/focus は currentTaskId = null を返す
```

```
シナリオ: 現在のタスクの期限を tomorrow に変更すると currentTaskId が null に解除される
  Given FocusSelection.currentTaskId = A.id, A.dueDate = "today"
  When  PATCH /api/v1/tasks/{A.id} に { dueDate: "tomorrow" } を送る
  Then  200 OK が返る
  And   その後の GET /api/v1/focus は currentTaskId = null を返す
```

```
シナリオ: 現在のタスクではないタスクの削除 / 期限変更は currentTaskId に影響しない
  Given FocusSelection.currentTaskId = A.id
  And   今日のタスク A, B が存在する
  When  DELETE /api/v1/tasks/{B.id} を呼ぶ
  Then  GET /api/v1/focus は currentTaskId = A.id のまま
```

```
シナリオ: 現在のタスクの dueDate を tomorrow → today に戻しても自動で現在のタスクには再設定されない
  Given FocusSelection.currentTaskId = null (前項で解除済み)
  And   タスク A の dueDate を tomorrow から today に戻す
  When  GET /api/v1/focus を呼ぶ
  Then  currentTaskId = null のまま
  ※ 自動で再設定するルールは持たない (NFR-001: 単一ワークフロー. 暗黙フォールバックは並びの先頭であり, 戻したタスクが先頭になる保証はない)
```

### UI: 視覚的強調（NFR-011）

```
シナリオ: 今日ビューで「現在のタスク」が他と区別される形で大きく表示される
  Given 今日ビューに タスク A (現在のタスク = currentTaskId ?? nextTaskId), B, C が並ぶ
  When  ユーザーが今日ビューを表示する
  Then  A は他のタスク (B, C) と区別される単独 / 大表示のセクションに描画される
  And   B, C は通常のリスト行として描画される
```

```
シナリオ: 現在のタスクが未選択 (currentTaskId = null) でも先頭タスクが現在のタスクとして強調される
  Given FocusSelection.currentTaskId = null
  And   今日ビューに タスク A (並び先頭), B が存在する
  When  ユーザーが今日ビューを表示する
  Then  A が「現在のタスク」として強調表示される (= 暗黙フォールバック)
```

```
シナリオ: 今日のタスクが 0 件のときは「現在のタスク」の強調表示も存在しない
  Given 今日のタスクが 0 件 (currentTaskId = null かつ nextTaskId = null)
  When  ユーザーが今日ビューを表示する
  Then  「現在のタスク」セクションは表示されない (または「今日のタスクはありません」のような空状態を示す)
```

### UI: 操作（「現在に設定」「現在解除」）

```
シナリオ: 今日ビューのタスクを「現在に設定」できる
  Given 今日ビューに タスク A (現在), B が並ぶ
  When  ユーザーが B の「現在に設定」操作 (ボタン / クリック等) を行う
  Then  PUT /api/v1/focus に { taskId: B.id } が送られる
  And   成功後, 今日ビューを再取得すると B が現在のタスクとして強調表示される
```

```
シナリオ: 現在のタスクを「現在解除」できる
  Given FocusSelection.currentTaskId = A.id, 今日ビューに A (現在), B が並ぶ
  When  ユーザーが「現在解除」操作を行う
  Then  PUT /api/v1/focus に { taskId: null } が送られる
  And   成功後, 暗黙フォールバックにより並び先頭 A が改めて (暗黙の) 現在のタスクとして強調される
  ※ 「解除したのに同じ A が現在になる」のは, A が依然として並び先頭であるため. UI / 文言で混乱しないかは plan.md で検討する.
```

```
シナリオ: 完了アクションで現在のタスクが切り替わる導線が今日ビューから完結する
  Given 今日ビューに タスク A (現在), B, C が並ぶ
  When  ユーザーが A の「完了」操作を行う
  Then  POST /api/v1/tasks/{A.id}/complete が送られる
  And   サーバが FocusSelection.currentTaskId を null に解除する
  And   再取得後の今日ビューには B (新しい並び先頭) が現在のタスクとして強調表示される
  And   ユーザーは「完了で自動的に次へ」を体感できる (UC-001)
```

## 未決事項 / 確認待ち

- **U-001 「未選択時の暗黙フォールバック = 今日ビュー先頭」の解釈で良いか**
  - 保守側デフォルト案: 採用する. UC-001「アプリを開くと優先度順に出る」「1 つを選ぶと大きく表示」を欠かさず, かつ「明示的に解除する」「自動繰上げ後に一旦 null になる」の状態を矛盾なく表現できる.
  - 代替案: 「未選択時は何も表示しない / 強調しない」. シンプルだが UC-001 の入口体験を欠く. 自動繰上げ後に「次のタスク」が現在として強調されないと FR-013 の体感が薄れる.
  - 確認質問: 暗黙フォールバックを採用して良いか.
- **U-002 自動繰上げのトリガーは「完了」だけか, 「削除」「期限 today→tomorrow」も含むか**
  - 保守側デフォルト案: 3 経路すべてで `currentTaskId = null` に解除する. 「`currentTaskId` が今日ビューに存在しない id を指し続ける」状態を作らない目的（整合性担保）.
  - 代替案: 完了のみ. 削除 / 期限変更は別途明示の解除を要求. ただし「ゴミ箱の id が現在のタスクとして残る」「明日に移ったタスクが現在のタスクとして残る」状態を許すことになる.
  - 確認質問: 削除 / 期限変更も自動解除する方針で良いか.
- **U-003 自動繰上げ時に「次の現在のタスク」をサーバが自動設定するか, 解除のみに留めるか**
  - 保守側デフォルト案: **解除のみ** (`currentTaskId = null`). 次の現在のタスクは暗黙フォールバック (`nextTaskId`) で表現する.
  - 理由: 自動で次の id を `currentTaskId` に書き込むと「明示選択 vs 暗黙フォールバック」の区別が崩れ, 「明示的に選んだら次の完了で自動的に "次の id" が明示選択状態になる」のは挙動として暴走しやすい. 解除に留め, 「次は暗黙フォールバックが効く」と統一する方がモデルがシンプル.
  - 代替案: 完了時に `currentTaskId = <次の先頭 id>` に書き換える. UC-001 の文言「自動で次が現在のタスクになる」をより忠実に表現するが, 上記の理由で不採用としたい.
  - 確認質問: 解除のみとし, 「次」は暗黙フォールバックに任せる方針で良いか.
- **U-004 `GET /api/v1/today` のレスポンスに `currentTaskId` を含めるか**
  - 保守側デフォルト案: **含めない** (`/today` は `{ tasks, nextTaskId }` のまま. `currentTaskId` は `/focus` で別途取得する).
  - 理由: BL-005 で確定した `/today` の責務は「今日ビューの一覧 + 並びの先頭」であり, `FocusSelection` は別概念. クライアントは 2 リクエストになるが TanStack Query の並列フェッチで実用上問題ない. レスポンス形状の変更は BL-005 のテストにも影響する.
  - 代替案: `/today` に `currentTaskId` を追加し 1 リクエストで取れるようにする. ネットワーク往復は減るが, BL-005 の契約変更（テスト更新）と「`/today` が `FocusSelection` を知る」責務肥大が発生する.
  - 確認質問: 2 エンドポイント分離で良いか, それとも 1 リクエスト化を優先するか.
- **U-005 `FocusSelection` レコードは「サーバ初期化時に 1 件作る」or「初回 GET 時に lazy 作成」か**
  - 保守側デフォルト案: **マイグレーション / 起動時に 1 件 INSERT** (`id = "singleton", currentTaskId = null, version = 1`). 単一レコード前提のため lazy より素直.
  - 代替案: 初回 GET 時に存在しなければ作る. lazy ぶん起動コストは下がるが, レース条件の考慮が増える.
  - 確認質問: 起動時 INSERT で良いか.
- **U-006 「現在解除」UI を提供するか**
  - 保守側デフォルト案: 提供する. NFR-001 違反ではない (操作は 3 経路に閉じる. spec.md NFR-001 節参照).
  - 代替案: 提供しない. 「現在のタスク」は「別タスクを選ぶ」「完了する」でしか変えられない. NFR-001 をより厳格に運用するならこちら.
  - 確認質問: 解除 UI を提供する方針で良いか.
- **U-007 `If-Match` のため `FocusSelection` を読んでから PUT する経路で 412 をどう体験させるか**
  - 保守側デフォルト案: 他エンティティと同じく 412 を投げる. 多端末で同時に focus を変えるシナリオは単一ユーザー前提 (CORE-2) では稀だが, ADR-0010 の楽観ロック方針との一貫性のため形式は揃える.
  - 確認質問: 一貫性のため 412 採用で良いか.
