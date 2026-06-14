# 仕様: 完了済 feature ドキュメントから旧認証経路参照を除去

- 状態: ドラフト
- 関連: [`../../planning/backlog.md`](../../planning/backlog.md) BL-083
- 関連先行 feature:
  - [`../app-login/spec.md`](../app-login/spec.md) (固定トークン `VITE_AUTH_TOKEN` の廃止 / sessions テーブル + opaque token 導入)
  - [`../password-change/spec.md`](../password-change/spec.md) (パスワード DB 永続化 / `APP_PASSWORD_HASH` env を初期 seed に縮退)
  - [`../initial-password-setup/spec.md`](../initial-password-setup/spec.md) (`APP_PASSWORD_HASH` env と `password-seed.ts` の完全廃止 / `auth-state` 経由の初回設定)

## 背景 / 課題

現状の認証フローは sessions テーブル + opaque token と `/api/v1/login` / `/api/v1/password` / `/api/v1/auth-state` の 3 本に統合されている. パスワードは DB 永続化され, env による初期 seed (`APP_PASSWORD_HASH`) も廃止済みで, 初回起動は `GET /auth-state` → `InitialSetupView` 経由でブラウザから初期化する.

一方, 完了済 feature の `plan.md` / `spec.md` / `tasks.md` には旧来の認証経路 (`AUTH_TOKEN` / `VITE_AUTH_TOKEN` の固定トークン Bearer, `APP_PASSWORD_HASH` env による初期 seed) を「現状の挙動」「現行の方針」として記述している箇所が残っている. 具体的には次のヒットがある (`grep -rn "VITE_AUTH_TOKEN\|APP_PASSWORD_HASH\|AUTH_TOKEN" docs/developer/features docs/user docs/developer/setup docs/developer/architecture`):

- `android-server-mode/{spec,plan,tasks}.md`: 「Web は `VITE_AUTH_TOKEN` を従来通り使用する」「SetupView で認証トークンを入力して Preferences に保存する」と記述. 現状の Android サーバモードは `LoginView` 経由で opaque token を取得しており, 固定トークン入力 UI は存在しない.
- `web-client-foundation/plan.md`: 「環境変数 (`VITE_API_BASE_URL`・`VITE_AUTH_TOKEN`) の読み取りも `main.tsx` に集約する」と記述. 現状の `main.tsx` は `VITE_AUTH_TOKEN` を読まない.
- `password-change/{spec,plan,tasks}.md`: 「`APP_PASSWORD_HASH` env を初期 seed に縮退させる」を現在状態として記述. 後続の `initial-password-setup` で env 自体が完全廃止されたため, この記述は「縮退した中間状態」を語る歴史的文脈になっている.
- `server-foundation/{spec,plan,tasks}.md`: `AUTH_TOKEN` env を必須化する仕様として記述. 現在は env は読まれない.
- `task-crud/tasks.md`: `TODICA_AUTH_TOKEN` env を Bearer ミドルウェアに使う計画記述. 採用されなかった env 名.
- `authed-fetch-repositories/{spec,plan,tasks}.md`: テスト内のローカル定数として `AUTH_TOKEN` を使った msw 検証手順を記述. env を指すものではない.
- `e2e-login-spec/{spec,plan}.md`: 「`playwright.config.ts` の `webServer` が `APP_PASSWORD_HASH` を渡す前提」と記述. 現状の `playwright.config.ts` は env を渡していない.
- `settings-view-dead-path-cleanup/{spec,plan}.md`: 「`AUTH_TOKEN` / `VITE_AUTH_TOKEN` env まわりは BL-074 / BL-076 のスコープ」と境界注釈として記述. 当時のスコープ境界を語る歴史的文脈.
- `app-login/{spec,plan,tasks}.md` および `initial-password-setup/{spec,plan,tasks}.md`: 旧経路を **廃止対象として名指しする feature 自身**. 廃止 feature の記述は除去せず保持する.
- `oss-release-prep/{plan,tasks}.md`: OSS リリース準備時点の `AUTH_TOKEN` 関連記述. 当時の OSS 化作業の記録.
- `docs/developer/oss/secret-scan-report.md`: OSS リリース前 secret scan の時点記録 (`AUTH_TOKEN` は env として参照されているだけで値はコードに含まれていない旨の監査結果).

これらの記述があると, 新たに feature ドキュメントを参照する読み手は「現状そう動いている」と誤解する. リリース前の現時点で timeless な記述に揃え, 廃止前の状態を残す必要がある記述は `tasks.md` 末尾の「経緯」節に隔離することで, ドキュメントの一貫性を回復する.

## ゴール / 非ゴール

### ゴール

- **完了済 feature の `spec.md` / `plan.md` を timeless に書き換える**. 「現状の挙動」「現行の方針」として旧認証経路を語っている記述を, 現行の sessions + opaque token + `/api/v1/login` / `/password` / `/auth-state` フローに揃える.
- **歴史的文脈として残す価値のある記述は `tasks.md` 末尾の「経緯」見出し以下に隔離する**. 隔離した記述は本 BL の grep 検証から除外する.
- **共有ドキュメント (`docs/user` / `docs/developer/setup` / `docs/developer/architecture`) の env 表を最新版に揃える**. 現時点ではこの 3 ディレクトリ配下に旧トークン参照は無いが, 検証 grep でゼロ件を assert する.
- **廃止 feature 自身の記述 (`app-login` / `initial-password-setup`) は除去せず保持する**. これらの feature は旧経路を「廃止対象」として名指しするのが必然であり, 改変するとその feature の意義が読み取れなくなる.
- **コード本体には touch しない**. 編集対象は `docs/developer/features/<name>/{spec,plan,tasks}.md` のみ.
- **automated test を 1 本追加する**. リポジトリの自動テスト (vitest) で「対象 4 ディレクトリ配下の `spec.md` / `plan.md` に旧トークン参照が無い (`tasks.md` の `## 経緯` 以下は除外)」を assert する.

### 非ゴール

- 廃止 feature (`app-login` / `initial-password-setup`) の記述変更.
- `backlog.md` / 個別 BL の手元説明 (BL-082 のスコープ).
- コード本体 / `.env.example` / マイグレーション SQL の変更 (本 BL は仕様 / ドキュメント整備のみ).
- ADR の追加 (本 BL は記述の整合性回復であり, 新たな設計判断は伴わない).
- backlog.md 本文中の `AUTH_TOKEN` / `VITE_AUTH_TOKEN` / `APP_PASSWORD_HASH` 言及 (backlog の status / 履歴記述は除去せず保持する).

## 要件

### 機能要件

- **FR-DOC-1: 「現在状態」を語る記述を timeless に書き換える**.
  - `android-server-mode/{spec,plan,tasks}.md`, `web-client-foundation/plan.md`, `server-foundation/{spec,plan,tasks}.md`, `password-change/{spec,plan,tasks}.md`, `e2e-login-spec/{spec,plan}.md`, `task-crud/tasks.md` の該当箇所を, 現行 auth フロー (sessions + opaque token + `/api/v1/login` / `/password` / `/auth-state`) と無矛盾な記述に書き換える.
  - 書き換えの粒度は「該当行ないし最小段落の文言変更」. 文書構造 (見出し / セクション順) は維持する.
- **FR-DOC-2: 歴史的文脈は `tasks.md` 末尾の「経緯」節に隔離する**.
  - 各 feature の `tasks.md` の末尾 (既存セクションの後ろ) に `## 経緯` 見出しを追加し, 「過去のこの feature 時点では `VITE_AUTH_TOKEN` / `APP_PASSWORD_HASH` を前提としていた」旨を必要に応じて記述する.
  - 「経緯」節は本 BL の grep 検証 (AC-1) から除外する.
- **FR-DOC-3: 廃止 feature の記述は変更しない**.
  - `app-login/`, `initial-password-setup/` 以下の `spec.md` / `plan.md` / `tasks.md` は本 BL の編集対象から除外する. これらは「旧経路を廃止する」feature 自身のため, 旧トークン参照を残すのが妥当.
- **FR-DOC-4: 監査記録は変更しない**.
  - `docs/developer/oss/secret-scan-report.md` および `oss-release-prep/{plan,tasks}.md` は OSS リリース準備時点の監査記録 / 準備記録として保持する. これらは grep 検証範囲 (`docs/developer/features` / `docs/user` / `docs/developer/setup` / `docs/developer/architecture` の 4 箇所) のうち, `oss-release-prep` のみが該当. 内容は変更せず, ただし読み手の誤解を避けるため `tasks.md` 末尾の「経緯」節への隔離もしくは記述の timeless 化を選択する (どちらを採るかは plan.md で決定).
- **FR-DOC-5: テストによる検証**.
  - `__tests__/docs/no-legacy-auth-refs.test.ts` (相当) を 1 本追加し, `docs/developer/features/*/spec.md` および `docs/developer/features/*/plan.md` に `VITE_AUTH_TOKEN` / `APP_PASSWORD_HASH` / `AUTH_TOKEN` が含まれないことを assert する.
  - 除外対象: `app-login/` / `initial-password-setup/` 配下のすべて. `tasks.md` の `## 経緯` 見出し以下.
  - `docs/user` / `docs/developer/setup` / `docs/developer/architecture` の 3 ディレクトリは全ファイルを対象とし, 同 3 トークンが含まれないことを assert する.

### 非機能要件

- **NFR-DOC-1: 文書構造の保存**. 既存の見出し階層 / セクション順 / 採番 (FR-PWD-1 等) は維持する. 書き換えは段落単位の文言調整に留め, 章立てを再構成しない.
- **NFR-DOC-2: 既存テスト互換**. 既存 1726+ 件のサーバ / Web / E2E テストは本 BL の変更で影響を受けない (ドキュメントのみの変更のため). 新規追加テスト 1 本も既存テスト群と干渉しない.
- **NFR-DOC-3: 内部リンクの維持**. ドキュメント間の相対リンク (`[`../app-login/spec.md`](../app-login/spec.md)` 等) は壊さない.

## 受け入れ基準

> 書き方は [`../../quality/acceptance-criteria.md`](../../quality/acceptance-criteria.md) に従う. Gherkin の Given/When/Then で表現する.

### AC-1: 対象 4 ディレクトリの spec.md / plan.md に旧トークン参照が残らない (FR-DOC-1 / FR-DOC-5)

```
シナリオ: grep で旧トークン参照が 0 件であることを確認できる
  Given 本 BL の対象 4 ディレクトリ (docs/developer/features, docs/user,
        docs/developer/setup, docs/developer/architecture) を走査する
  And   除外対象として app-login/ と initial-password-setup/ 配下を指定する
  And   tasks.md の "## 経緯" 見出し以下も除外する
  When  対象範囲で "VITE_AUTH_TOKEN" / "APP_PASSWORD_HASH" / "AUTH_TOKEN" の
        いずれかを含む行を grep する
  Then  ヒット件数は 0 である
```

### AC-2: android-server-mode の認証記述が現行フローと一致する (FR-DOC-1)

```
シナリオ: android-server-mode/spec.md および plan.md が opaque token 認証を前提として記述される
  Given android-server-mode/spec.md および plan.md を開く
  When  認証経路に関する記述 (FR-AND-004, AC-AND-003, AC-AND-005, D-002, D-003,
        D-004 等) を確認する
  Then  認証トークンは LoginView 経由で /api/v1/login から取得される opaque token であると読める
  And   SetupView は「サーバ URL のみ」の入力で完了する (認証トークン入力欄なし) と読める
  And   tasks.md の同等記述も上記と無矛盾である
```

### AC-3: web-client-foundation/plan.md の env 集約記述が現行と一致する (FR-DOC-1)

```
シナリオ: web-client-foundation/plan.md の D-001 セクションが現行の env 集約を反映する
  Given web-client-foundation/plan.md を開く
  When  L36 周辺の「main.tsx に env 読み取りを集約する」記述を確認する
  Then  集約対象として VITE_API_BASE_URL のみが挙げられている (VITE_AUTH_TOKEN への言及がない)
```

### AC-4: 廃止 feature (app-login / initial-password-setup) の記述は変更されていない (FR-DOC-3)

```
シナリオ: 廃止 feature 自身の記述は本 BL の対象外であることが守られている
  Given git diff main..HEAD を確認する
  When  docs/developer/features/app-login/ または
        docs/developer/features/initial-password-setup/ 配下の差分を見る
  Then  差分は存在しない
```

### AC-5: 自動テストで grep 検証が CI に組み込まれる (FR-DOC-5)

```
シナリオ: 旧トークン参照の混入を CI で検出できる
  Given __tests__/docs/no-legacy-auth-refs.test.ts (相当) が追加されている
  When  vitest を実行する
  Then  該当テストが green である
  And   試しに対象 spec.md に "VITE_AUTH_TOKEN" を追記すると red になる (= 検出が機能している)
```

### AC-6: 「経緯」節は grep 検証から除外されている (FR-DOC-2)

```
シナリオ: tasks.md 末尾の "## 経緯" 以下の記述はテストの assert 対象から除外される
  Given 対象 feature の tasks.md 末尾に "## 経緯" 見出しがあり, その下に
        "VITE_AUTH_TOKEN" を含む歴史的記述が書かれている
  When  __tests__/docs/no-legacy-auth-refs.test.ts を実行する
  Then  テストは green である (= "## 経緯" 以下は除外されている)
```

## 未決事項 / 確認待ち

- **U-1: `oss-release-prep/{plan,tasks}.md` の扱い**. 第一候補は「OSS リリース準備時点の作業記録としてそのまま保持し, `tasks.md` 末尾に `## 経緯` 見出しを追加して文脈を補足する」. 代替案として「現行 deploy-guide.md の状態に合わせて `AUTH_TOKEN` 言及を `app-login` / `initial-password-setup` への参照に書き換える」がある. 第一候補を採る場合は AC-1 のヒットを `## 経緯` 隔離で 0 にできる.
- **U-2: `secret-scan-report.md` の扱い**. これは検証 4 ディレクトリ (`docs/developer/oss/` は範囲外) に含まれないため AC-1 のヒットには影響しない. 第一候補は「監査時点の記録として変更しない」. ただし関連性が高いため計画書 (plan.md) で言及する.
- **U-3: `authed-fetch-repositories` の `AUTH_TOKEN` 言及**. これはテスト内のローカル定数 (`const AUTH_TOKEN = "..."` 形式) 名を指しており, env を指していない. 第一候補は「変数名は env 名ではないので timeless 書き換えは不要. ただし読み手の混同を避けるため定数名を `TEST_TOKEN` 等に変えるよう書き換える (記述上の変更)」. 代替案として「定数名はテストコード側の問題でありドキュメントの記述変更だけでは追従できないため `## 経緯` 隔離で扱う」がある.
- **U-4: 「経緯」節の文体**. 第一候補は「箇条書きで `- 過去には ... を前提としていた. <FQDN な廃止 feature へのリンク> で廃止済み.` の形式」. 代替案として「散文で 1〜2 段落」がある. 第一候補のほうが test-designer がパース / assert しやすい.
- **U-5: `__tests__/docs/no-legacy-auth-refs.test.ts` の配置**. 第一候補は `__tests__/docs/` 配下 (リポジトリルート). 代替案として `web/__tests__/docs/` (web ワークスペース) もあるが, 対象がリポジトリ全体の `docs/` であることを考えるとルート配下が自然.
