# 仕様: OpenAPI ドリフト検出機構

- 状態: 確定
- 関連: [`../../planning/backlog.md`](../../planning/backlog.md) の BL-116

## 背景 / 課題

[`../../architecture/api/overview.md`](../../architecture/api/overview.md) §8 は
**「OpenAPI 定義に書かれていない API は存在しない」** を運用原則とし,
[`../../architecture/server/overview.md`](../../architecture/server/overview.md) §4 末尾でも
「API レイヤの公開エンドポイントは `openapi.yaml` と一致させる」と規定する。

しかしこの原則を自動で担保する仕組みが無いため, 実装ハンドラと
[`../../architecture/api/openapi.yaml`](../../architecture/api/openapi.yaml) の
path / method 集合は手動レビューでしか突き合わせられない。結果として両者が乖離し得る。

現状, 実際に次のドリフトが存在する（本 spec 確定時点の調査結果）。

- **openapi にあり実装に無い**: `POST /tasks/{id}/restore`, `POST /projects/{id}/restore`,
  `POST /routines/{id}/restore`。実装では復元は `POST /trash/{id}/restore` に集約されている。
- **実装にあり openapi に無い**: `GET /healthz`（`server/src/app.ts` のインライン定義）,
  `POST /trash/{id}/restore`（`trash` ルータ）。

これらは「ハンドラを足したが openapi を更新し忘れた / openapi に書いたが実装が別 path にある」
という典型的ドリフトであり, 検出機構が無いまま放置されている。

## ゴール / 非ゴール

- ゴール:
  - `openapi.yaml` の全 (path, method) と, サーバ実装が公開する全 (path, method) の
    **集合が完全一致する**ことを vitest で静的に検証する。
  - 任意のルータにハンドラを追加 / 削除, または `openapi.yaml` に endpoint を追加 / 削除した際,
    対称の更新が無ければ vitest が必ず落ちる状態にする。
  - `x-internal: true`（テスト専用など, クライアントから呼ばれない内部エンドポイントの目印）の
    規約を本 spec で明文化する。検出ロジックは `x-internal` の付いた endpoint も
    実装側に存在することを要求する（内部 endpoint も「実装とスキーマの一致」対象）。
  - 既存の実ドリフト（背景に列挙した 5 件）を, 検出機構の導入と同時に解消し, テストを green にする。
    解消は **openapi.yaml を実装の現実に合わせるドリフト解消**であり, 新たなアーキテクチャ決定を伴わない（後述「ドリフト解消の方向と扱い」を参照）。
- 非ゴール:
  - request / response スキーマのフィールド一致検証（型・必須・enum の突き合わせ）。本 BL の対象外（Phase 2）。
  - `ErrorCode` enum と実装の照合。Phase 2 で別途扱える。
  - クライアント（web / android）が openapi の全 endpoint を呼んでいるかの検証。
  - openapi の意味的妥当性（説明文・examples）の検証。

## 用語と検出対象の定義

### 「サーバが公開するエンドポイント」の定義

検出対象は, 本番起動・テスト起動を問わず `createApp(deps)` が登録し得る全 HTTP ルートとする。

- `server/src/app.ts` の `app.route(prefix, xxxRouter(deps))` によりマウントされる各ルータの
  `router.get|post|put|patch|delete(relativePath, ...)`。完全 path は `prefix + relativePath`。
- `server/src/app.ts` 直下のインライン `app.get|post|...(absolutePath, ...)`
  （`/healthz`, `/api/v1/test/clock`, `/api/v1/test/clock/set`, `/api/v1/test/clock/advance`）。
- 条件付きマウント（`if (deps.routineRepository)` の `routines`,
  `if (deps.testClock)` の `test/clock/*`）も**公開され得る**ものとして検出対象に含める。

### path の正規化規則

openapi 側と実装側を同一空間で比較するため, 次の正規化を行ってから集合比較する。

| 項目 | 実装側 | openapi 側 | 正規化後 |
| --- | --- | --- | --- |
| ベース path | `/api/v1` がマウント prefix に含まれる | `servers[].url` 末尾が `/api/v1`（path には含まれない） | 比較キーから `/api/v1` を除いた path（例: `/tasks/{id}`） |
| path パラメータ | `:id` 形式（hono） | `{id}` 形式（OpenAPI） | `{id}` に統一 |
| method | `get`/`post`/... | `get`/`post`/... | 小文字 |
| 末尾スラッシュ | ルータ相対 `/` はマウント prefix そのもの | なし | 末尾スラッシュを除去（例: `/tasks/` → `/tasks`） |
| `/api/v1` 配下でない path | `/healthz` のみ | `/healthz` は openapi に記載する | `/healthz` をそのまま比較キーにする |

### `x-internal` 規約（本 spec で確定）

- `x-internal: true` は openapi の operation（path 配下の method）に付与する拡張プロパティとする。
- 意味: 「サーバ実装には存在するが, クライアント（web / android）は呼んではならない内部 endpoint」。
- 検出ロジックは `x-internal` の有無に関わらず, 当該 (path, method) が実装側に存在することを要求する。
  すなわち `x-internal` は集合一致検証の**例外にはしない**（内部 endpoint も実装と一致させる）。
- `x-internal: true` の現行付与対象は `test/clock` / `test/clock/set` / `test/clock/advance` の 3 件。
- `/healthz` も `x-internal: true` を付けて openapi に追記する（運用監視用・クライアント非対象）。

## ドリフト解消の方向と扱い（ADR 非設置）

既存ドリフト 5 件の解消は **openapi.yaml を実装の現実へ寄せる**方向で行い, 実装ハンドラ（`server/src/`）は無改修とする。
これは新たなアーキテクチャ決定ではなく, 単なる**ドリフト解消（openapi を実装に追従させる作業）**であるため, ADR は新設しない。判断根拠は以下のとおり。

- 復元（restore）は実装上すでに `POST /trash/{id}/restore` の 1 本に一本化されている。
- openapi の `POST /tasks/{id}/restore`・`POST /projects/{id}/restore`・`POST /routines/{id}/restore` の 3 path は
  **実装ハンドラが存在しない記載（願望）**であり, これらを削除する行為は「設計の変更」ではなく「実装に存在しないものをスキーマから消す」ドリフト解消に過ぎない。
- `GET /healthz` は実装に存在するが openapi に記載が無い。これを `x-internal: true` 付きで追記するのも同様にドリフト解消である。

したがって本 feature は spec / plan / tasks の範囲内でドリフト解消を完結させ, `docs/developer/adr/` への新規 ADR は作成しない。

### 将来 feature（BL-119 / BL-120）との整合

BL-119 / BL-120 で Project / Routine の soft delete とゴミ箱経由復元を別途実装する予定だが,
それらの復元も `POST /trash/{id}/restore` 経由に統一される。
したがって per-entity の restore path（`/tasks|projects|routines/{id}/restore`）を openapi から削除しても将来の整合は崩れない。むしろ復元経路が `/trash` に統一されることで整合する。

## 要件

- 機能要件:
  - FR-1: `openapi.yaml` をパースし, `paths` 配下の全 (path, method) を列挙する。
  - FR-2: サーバ実装ソース（`server/src/routers/*.ts` および `server/src/app.ts`）から
    全 (path, method) を抽出し, マウント prefix を合成して完全 path を復元する。
  - FR-3: 上記 §「path の正規化規則」に従い両集合を正規化する。
  - FR-4: 「openapi だけにある」集合と「実装だけにある」集合をそれぞれ算出し,
    両方が空であることを assert する。差分があるときは, どちらの集合にどの (path, method) が
    含まれるかをテスト失敗メッセージで明示する。
  - FR-5: 既存の実ドリフト 5 件を, テストが green になるよう解消する。
    解消の方向（どちらを正本に寄せるか）は plan.md で確定する。
  - FR-6: `x-internal: true` の規約を openapi.yaml 冒頭または
    `architecture/api/overview.md` に明文化する。
- 非機能要件:
  - NFR-1: 検出はネットワーク・サーバ起動を伴わない**静的解析**で完結する（ソース読取のみ）。
  - NFR-2: 追加する本番依存は無し。YAML パーサは devDependency として追加する。
  - NFR-3: server / web / domain の本体ロジックには触れない（テスト追加 + openapi / healthz 整合のみ）。
  - NFR-4: テストはリポジトリルートからの `npx vitest run` で実行される既存 node プロジェクト
    （`include: __tests__/**/*.test.ts`）に属する。

## 受け入れ基準

> 書き方は [`../../quality/acceptance-criteria.md`](../../quality/acceptance-criteria.md) に従う。

```
シナリオ: AC-1 整合状態では検出テストが green
  Given openapi.yaml の全 (path, method) とサーバ実装の全 (path, method) が一致している
  When  ルートの node プロジェクトで openapi ドリフト検出テストを実行する
  Then  「openapi だけにある」集合が空であり, かつ「実装だけにある」集合も空であることが assert され, テストが pass する
```

```
シナリオ: AC-2 実装にハンドラを足して openapi 未更新だと落ちる
  Given いずれかのルータに新規 router.get|post|...(path) を追加し, openapi.yaml に対応 path/method を追記していない
  When  検出テストを実行する
  Then  当該 (path, method) が「実装だけにある」集合に含まれ, テストが fail する
```

```
シナリオ: AC-3 openapi に endpoint を足して実装未追加だと落ちる
  Given openapi.yaml に新規 path/method を追記し, サーバ実装に対応ハンドラを追加していない
  When  検出テストを実行する
  Then  当該 (path, method) が「openapi だけにある」集合に含まれ, テストが fail する
```

```
シナリオ: AC-4 path パラメータ形式の差を吸収する
  Given openapi が /tasks/{id}, 実装が router.patch("/:id") を /api/v1/tasks にマウントしている
  When  検出テストを実行する
  Then  両者は同一 (path, method) と判定され, 偽陽性のドリフトを報告しない
```

```
シナリオ: AC-5 ベース path /api/v1 の有無を吸収する
  Given 実装は /api/v1 prefix 配下にマウントされ, openapi の servers.url 末尾が /api/v1 で path 自体には含まれない
  When  検出テストを実行する
  Then  /api/v1 の有無に起因する偽陽性のドリフトを報告しない
```

```
シナリオ: AC-6 内部エンドポイントも一致検証の対象になる
  Given openapi に x-internal: true の付いた endpoint がある
  When  検出テストを実行する
  Then  x-internal の有無に関わらず, 当該 (path, method) は実装側にも存在することが要求され, 不在なら fail する
```

```
シナリオ: AC-7 条件付きマウントの endpoint も検出対象になる
  Given routines（routineRepository 注入時）/ test/clock（testClock 注入時）が条件付きでマウントされる
  When  検出テストを実行する
  Then  これら条件付き endpoint も openapi と一致検証され, 不一致なら fail する
```

```
シナリオ: AC-8 導入時点で既存の実ドリフトが解消されている
  Given 本 feature の実装を取り込んだ状態
  When  検出テストを実行する
  Then  /healthz・各 restore 系を含む既存ドリフト 5 件が解消され, テストが green である
```

## 未決事項 / 確認待ち

> すべて plan.md（決定 D-1〜D-6）で確定済み。未決事項は残っていない。

- 未決-1（解決済み / D-1）: 実装側 path 抽出は **正規表現**で行う。対象は
  `router.<method>("<literal>")` / `app.<method>("<literal>")` の文字列リテラル引数。動的 path は現状存在しない。
- 未決-2（解決済み / D-2）: マウント prefix → ルータの対応はテスト内に**明示的な対応表**として保持し,
  `app.ts` のマウント記述と相互検証して保守漏れを検出する。
- 未決-3（解決済み / D-4）: 既存ドリフト 5 件は **openapi を実装に寄せる**方向で解消する。
  - `GET /healthz`: openapi に `x-internal: true` で追記する。
  - `POST /trash/{id}/restore`: openapi に追記する。
  - openapi の `/tasks/{id}/restore`・`/projects/{id}/restore`・`/routines/{id}/restore` を削除し, 復元を `/trash` に一本化する。
  - これらはドリフト解消であり **ADR は新設しない**（上記「ドリフト解消の方向と扱い」を参照）。本体ハンドラは無改修。
- 未決-4（解決済み / D-5）: テストは `__tests__/structure/openapi-drift.test.ts` に配置する。
- 未決-5（解決済み / D-6）: YAML パーサは `js-yaml`（+ `@types/js-yaml`）を devDependency に追加する。
