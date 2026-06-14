# 設計・実装計画: 完了済 feature ドキュメントから旧認証経路参照を除去

> [`spec.md`](spec.md) の要件をどう実現するかに落とす. 抽象アーキテクチャは [`../../architecture/overview.md`](../../architecture/overview.md), 認証の現行モデルは [`../app-login/spec.md`](../app-login/spec.md) / [`../password-change/spec.md`](../password-change/spec.md) / [`../initial-password-setup/spec.md`](../initial-password-setup/spec.md) を参照.

## 方針概要

- **ファイル単位で「現状記述」と「歴史的記述」を仕分けし, それぞれ別経路で処理する**.
  - 現状記述として残す価値がある (= timeless に書き換えると素直): **書き換える**.
  - 歴史的文脈に価値がある (= 当時の経緯を残すと feature の意義が読める): **`tasks.md` 末尾の `## 経緯` 節に隔離する**.
- **編集は段落単位の文言調整に留め, 文書構造 / 採番を温存する**. これにより既存リンク (`#fr-pwd-1` 等のフラグメント) が壊れない.
- **検証は `vitest` の単体テスト 1 本で行う**. `docs/` ツリーを read-only に走査し, 旧トークン参照のヒットを 0 件と assert する. 除外条件 (廃止 feature 配下 / `## 経緯` 以下) も同テストに表現する.
- **コード本体は無改修**. 編集対象は `docs/developer/features/<name>/{spec,plan,tasks}.md` および新規テスト 1 本のみ.

## 既存実装の調査結果

| ファイル | 現状 | 本実装での扱い |
| --- | --- | --- |
| `android-server-mode/spec.md` | FR-AND-004 / AC-AND-003 / AC-AND-005 / 非ゴール L35 が「認証トークン入力 + Preferences 保存」を語る | 書き換え (SetupView は サーバ URL のみ / 認証は LoginView 経由の opaque token / Preferences には URL のみ保存) |
| `android-server-mode/plan.md` | L47 et al. が `VITE_AUTH_TOKEN` を Web 現状として記述 / D-002〜D-005 で `authToken` を Preferences 保存 | 書き換え (Web は `LoginView` → opaque token を `WebAuthStorage` に保存 / Android は `Preferences` を `authStorage` 実装に流用 / SetupView は URL のみ) |
| `android-server-mode/tasks.md` | L54 で `VITE_AUTH_TOKEN` を Web 現状とした手順 | 書き換え + `## 経緯` 節追加 |
| `web-client-foundation/plan.md` | L36 で `VITE_AUTH_TOKEN` を main.tsx 集約対象として記述 | 書き換え (`VITE_API_BASE_URL` のみ集約) |
| `server-foundation/{spec,plan,tasks}.md` | `AUTH_TOKEN` env を必須化する仕様 (FR-002 / NFR-002 / 全 AC) | `## 経緯` 節に隔離 (本 feature は「サーバ最小構成」を語る BL-002. 認証経路は後続 BL-074 で完全置換されたため, BL-002 時点の固定 token 必須仕様は歴史的記述). 本文中の `AUTH_TOKEN` 言及行を削るのは構造を壊す → 別案として「先頭に `> 注意: 本 feature 完了後, BL-074 (app-login) で AUTH_TOKEN env は廃止された. 現状の認証は ... を参照.` のリード文を追加 + 本文中の `AUTH_TOKEN` 言及はリード文に内包する形で残す」を採用 |
| `password-change/{spec,plan,tasks}.md` | `APP_PASSWORD_HASH` env を「初期 seed に縮退」と記述 | `## 経緯` 節に隔離 + spec.md 冒頭にリード文追加 (「本 feature 完了後, BL-080 (`initial-password-setup`) で env は完全廃止された」) |
| `e2e-login-spec/{spec,plan}.md` | `playwright.config.ts` の `webServer` が `APP_PASSWORD_HASH` を渡す前提 | 書き換え (現状の `playwright.config.ts` は env を渡さず, 初回起動を `auth-state` 経由で行う). 該当箇所が短いため `## 経緯` 隔離より直接書き換えが素直 |
| `task-crud/tasks.md` | L28 で `TODICA_AUTH_TOKEN` を Bearer ミドルウェアに使う計画 | 書き換え (削除 or 現行 sessions 認証ミドルウェアへの参照に置換). 該当行は 1 行のみ |
| `settings-view-dead-path-cleanup/{spec,plan}.md` | 「`AUTH_TOKEN` / `VITE_AUTH_TOKEN` は BL-074 / BL-076 のスコープ」と境界注釈 | 書き換え (BL-074 / BL-076 への参照リンクに置換 + 旧トークン名は除去) |
| `authed-fetch-repositories/{spec,plan,tasks}.md` | テスト内のローカル定数 `AUTH_TOKEN` を `Authorization: Bearer ${AUTH_TOKEN}` 検証に使用 | 書き換え (定数名を `TEST_TOKEN` 等に置換した記述に変更. `Authorization: Bearer ${AUTH_TOKEN}` という env を指さない文字列も含む点に注意し, ドキュメント内の表現を統一する) |
| `oss-release-prep/{plan,tasks}.md` | OSS リリース準備時点の `AUTH_TOKEN` env 言及 | `## 経緯` 節に隔離 (OSS リリース時点の作業記録としてそのまま残す) |
| `app-login/{spec,plan,tasks}.md` | 旧経路を「廃止対象」として名指し | **編集対象外** (廃止 feature 自身) |
| `initial-password-setup/{spec,plan,tasks}.md` | `APP_PASSWORD_HASH` env を「完全廃止対象」として名指し | **編集対象外** (廃止 feature 自身) |
| `docs/developer/oss/secret-scan-report.md` | OSS リリース前 secret scan の監査記録 | **編集対象外** (検証 4 ディレクトリの範囲外 / 監査時点の記録として保持) |

### 廃止 feature を編集対象から外す根拠

`app-login` / `initial-password-setup` の `spec.md` / `plan.md` / `tasks.md` は「旧認証経路を廃止する」ことを feature 自身の主題としている. ここから旧トークン名を除去すると, 「何を廃止したのか」という feature の存在意義そのものが読み取れなくなる. これらは「過去の状態を語る歴史的文書」として保存するのが正しい. 本 BL のテスト (`__tests__/docs/no-legacy-auth-refs.test.ts`) もこの 2 feature 配下を除外条件に含める.

## 影響範囲

| 領域 | 変更内容 |
| --- | --- |
| `docs/developer/features/android-server-mode/` | `spec.md` / `plan.md` / `tasks.md` を書き換え + `tasks.md` 末尾に `## 経緯` 節追加 |
| `docs/developer/features/web-client-foundation/` | `plan.md` L36 周辺を書き換え |
| `docs/developer/features/server-foundation/` | `spec.md` / `plan.md` / `tasks.md` 冒頭にリード文追加 + `## 経緯` 節追加 (本文中の旧トークン言及はリード文配下に内包) |
| `docs/developer/features/password-change/` | `spec.md` / `plan.md` / `tasks.md` 冒頭にリード文追加 + `## 経緯` 節追加 |
| `docs/developer/features/e2e-login-spec/` | `spec.md` / `plan.md` の該当段落を書き換え |
| `docs/developer/features/task-crud/` | `tasks.md` L28 周辺を書き換え |
| `docs/developer/features/settings-view-dead-path-cleanup/` | `spec.md` / `plan.md` の境界注釈を書き換え |
| `docs/developer/features/authed-fetch-repositories/` | `spec.md` / `plan.md` / `tasks.md` のテスト内定数表現を書き換え |
| `docs/developer/features/oss-release-prep/` | `tasks.md` 末尾に `## 経緯` 節追加 + `plan.md` 該当箇所を `## 経緯` に隔離 |
| `__tests__/docs/no-legacy-auth-refs.test.ts` (新規) | vitest で `docs/` 配下の旧トークン参照を 0 件と assert |
| サーバ / Web 本体 | 変更なし |
| `.env.example` / マイグレーション SQL / API 定義 | 変更なし |

## 設計詳細

### D-1: 「書き換え」と「経緯隔離」の使い分け

| ケース | 採用する手段 | 理由 |
| --- | --- | --- |
| 該当箇所が 1〜3 行で文脈なく置換できる (例: `web-client-foundation/plan.md` L36) | **書き換え** | 文書構造に影響なく, 読み手の誤解を即座に解消できる |
| 該当箇所が文書全体の主題に関わる (例: `server-foundation` 全体 / `password-change` 全体) | **冒頭リード文 + 経緯節**. 本文は温存 | 文書を全面書き換えると当時の設計判断が読めなくなる. リード文で読み手に「現状ではないこと」を知らせれば誤解は防げる |
| 該当箇所がテスト内のローカル定数名 (例: `authed-fetch-repositories`) | **書き換え** | env を指していないため timeless 書き換えが容易 |
| 該当 feature が「旧経路を廃止する」ことそのものを主題とする (例: `app-login` / `initial-password-setup`) | **編集しない** | 廃止対象の名指しが feature の必然 |

### D-2: 「経緯」節のフォーマット

各 `tasks.md` の末尾 (`## 仕上げ` の後ろ) に以下を追加する:

```markdown
## 経緯

> このセクションは本 feature 完了後の変更を記録するために残されている. 本 BL の grep 検証 (`__tests__/docs/no-legacy-auth-refs.test.ts`) はこの見出し以下を除外する.

- 過去には `<旧トークン名>` を前提として記述していた箇所がある. 現行の認証フローは [`../app-login/spec.md`](../app-login/spec.md) / [`../password-change/spec.md`](../password-change/spec.md) / [`../initial-password-setup/spec.md`](../initial-password-setup/spec.md) で完全置換された.
```

- 見出しは厳密に `## 経緯` (半角スペース 1 個). テスト側で `/^## 経緯\s*$/` の正規表現で検出する.
- リード文の `> ...` は読者向けの注記であり, テストの除外判定に使う唯一のマーカーは見出しのみ.
- 個別 feature 固有の補足が必要な場合は箇条書きで追記する.

### D-3: 冒頭リード文のフォーマット

`server-foundation` / `password-change` のように, 本文中の旧トークン言及を残す場合は spec.md / plan.md / tasks.md の **タイトル直後** (1 つ目の `##` 見出しの前) に次のリード文を挿入する:

```markdown
> **注意 (timeless 化のためのリード文)**: 本 feature の本文中に登場する `<旧トークン名>` は, 本 feature 完了時点の構成であり, **現行の Todica の認証経路ではない**. 現行は [`../app-login/spec.md`](../app-login/spec.md) (sessions テーブル + opaque token) / [`../initial-password-setup/spec.md`](../initial-password-setup/spec.md) (env 完全廃止) を参照. 本文の旧トークン記述は当時の設計判断を残すために温存している.
```

- このリード文は **grep ヒットを含まない** ように書く (= `VITE_AUTH_TOKEN` 等を文字列リテラルで書かない. 上記サンプルは `<旧トークン名>` のように記号で置換する).
- 実際の挿入時には, リード文の中に旧トークン名を一切含めないことで, リード文自体が AC-1 のヒット対象にならないようにする.
- リード文の後ろの本文 (旧トークン言及を含む) は, **`## 経緯` 節に移動するか, またはリード文の警告対象範囲として残すか** をファイル毎に判定する (D-1 の方針表に従う).

### D-4: ファイル毎の編集方針 (詳細)

#### D-4a: `android-server-mode/`

**現状の問題**: BL-019 (Android サーバモード) は完了後も BL-074 / BL-080 で認証経路が完全置換されたが, 本 feature の `spec.md` / `plan.md` / `tasks.md` は「Web は `VITE_AUTH_TOKEN` を従来通り使用」「SetupView で認証トークンを入力して Preferences に保存」を Android 側の現状仕様として記述している.

**現行の実装**: Web / Android とも `LoginView` でパスワードを入力 → `/api/v1/login` で opaque token を取得 → `auth-storage` 抽象 (Web: localStorage, Android: Capacitor Preferences) に保存. SetupView は **サーバ URL のみ** を入力する.

**編集方針**:

- `spec.md` FR-AND-004: 「サーバ URL と認証トークンの入力を促す SetupView」→ 「サーバ URL の入力を促す SetupView. 認証は SetupView 完了後に LoginView へ遷移して /api/v1/login 経由で行う」に書き換え.
- `spec.md` AC-AND-003: 「`認証トークン`入力欄と」を削除. 入力欄はサーバ URL のみとする.
- `spec.md` AC-AND-005: 「サーバ URL と認証トークンを変更できる」→ 「サーバ URL を変更できる. 認証トークンの再発行はログアウト → 再ログイン経由で行う」.
- `spec.md` 非ゴール L35: 旧トークン名を除去し, 「認証方式の変更は BL-074 (`../app-login/spec.md`) で完全置換された」と timeless 表現.
- `plan.md` D-002 / D-003 / D-004 / D-005: `authToken` の Preferences 保存 / 設定変更 UI を「opaque token を `authStorage` 経由で永続化する. SetupView は URL のみで完了し, 続けて LoginView を表示する」に書き換え.
- `tasks.md` L54: 「`VITE_AUTH_TOKEN` を使用する (従来通り)」→ 「現行の `authStorage` から opaque token を読み取る (Web / Android 共通経路)」に書き換え.
- `tasks.md` 末尾に `## 経緯` 節を追加し, 「BL-019 完了時点では Web を `VITE_AUTH_TOKEN` 前提で書いていた. 後続 BL-074 で固定トークン経路は廃止された」旨を `tasks.md` 内に隔離.

#### D-4b: `web-client-foundation/plan.md`

L36 の「環境変数 (`VITE_API_BASE_URL`・`VITE_AUTH_TOKEN`) の読み取り」→ 「環境変数 (`VITE_API_BASE_URL`) の読み取り」に書き換え. 認証 token は実行時に `auth-storage` から取得する旨を 1 文追記.

#### D-4c: `server-foundation/`

BL-002 は「サーバ最小構成」を語る初期 feature で, `AUTH_TOKEN` env による固定 Bearer 認証を必須仕様としていた. 本 feature の構造を維持するため:

- `spec.md` / `plan.md` / `tasks.md` 各冒頭に **D-3 のリード文** を追加.
- 本文中の `AUTH_TOKEN` 言及は **削除せず温存** (当時の設計判断として価値があるため).
- ただし AC-1 は本文中のヒットを 0 にすることを要求するため, この方針は AC-1 と矛盾する → **解決策**: 本文の `AUTH_TOKEN` 言及を `tasks.md` 末尾の `## 経緯` 節に移動し, `spec.md` / `plan.md` の AC-1 ヒットを 0 にする.
- `spec.md` / `plan.md` 本文には「初期の認証経路は固定トークン Bearer だった (詳細は `tasks.md` の `## 経緯` 節を参照)」と要約のみ残し, env 名は記載しない.

#### D-4d: `password-change/`

BL-079 (password-change) は「`APP_PASSWORD_HASH` env を初期 seed に縮退」を方針として語る. 後続 BL-080 (initial-password-setup) で env は完全廃止された:

- `spec.md` / `plan.md` / `tasks.md` 各冒頭にリード文を追加.
- 本文の `APP_PASSWORD_HASH` 言及 (受け入れ基準 AC-8 / AC-9 を含む) を `tasks.md` 末尾の `## 経緯` 節に移動.
- AC-8 / AC-9 は機能要件 (FR-PWD-2: 初期 seed) と対応するため, FR-PWD-2 自体も `## 経緯` に移動する. これにより `spec.md` 本文には現行 (BL-080 後) の挙動に矛盾しない要件のみが残る.
- `## 経緯` 節 (移動先) には「当時 FR-PWD-2 / AC-8 / AC-9 として記述されていた `APP_PASSWORD_HASH` env 初期 seed は, 後続 BL-080 で完全廃止された. 現行の初回設定経路は [`../initial-password-setup/spec.md`](../initial-password-setup/spec.md) を参照」と注記する.

#### D-4e: `e2e-login-spec/`

`spec.md` / `plan.md` の `playwright.config.ts` 関連記述を「`playwright.config.ts` の `webServer` 設定を流用する」(env 名を書かない) に書き換え.

#### D-4f: `task-crud/tasks.md`

L28 の `TODICA_AUTH_TOKEN` 言及を「Bearer 認証ミドルウェア (現行は sessions テーブル lookup 経由. 詳細は [`../app-login/plan.md`](../app-login/plan.md))」に書き換え.

#### D-4g: `settings-view-dead-path-cleanup/`

`spec.md` L40 / `plan.md` L132 の「`AUTH_TOKEN` / `VITE_AUTH_TOKEN` 環境変数まわり」→ 「サーバ / Web 双方の認証経路 (BL-074 / BL-076 のスコープ)」に書き換え.

#### D-4h: `authed-fetch-repositories/`

`spec.md` / `plan.md` / `tasks.md` のテスト内ローカル定数 `AUTH_TOKEN` を `TEST_TOKEN` (または `SEED_TOKEN`) に置換した記述に変更. `Authorization: Bearer ${AUTH_TOKEN}` のような文字列も同じ定数名に揃える. これにより grep ヒットは 0 になる.

#### D-4i: `oss-release-prep/`

`plan.md` L91 / `tasks.md` L52 の `AUTH_TOKEN` env 関連記述を `tasks.md` 末尾の `## 経緯` 節に移動し, 本文には「サーバ起動方法はリリース時点の deploy-guide.md を参照」のように残す. または直接書き換えても可 (該当箇所が短いため).

### D-5: `__tests__/docs/no-legacy-auth-refs.test.ts` の設計

#### ファイル配置

`__tests__/docs/no-legacy-auth-refs.test.ts` (リポジトリルートの `__tests__/docs/` 配下).

#### 検出ロジック (擬似コード)

```typescript
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = join(__dirname, "..", "..");
const TARGET_DIRS = [
  "docs/developer/features",
  "docs/user",
  "docs/developer/setup",
  "docs/developer/architecture",
];
const EXCLUDED_FEATURES = ["app-login", "initial-password-setup"];
const FORBIDDEN_TOKENS = ["VITE_AUTH_TOKEN", "APP_PASSWORD_HASH", "AUTH_TOKEN"];

function walkMarkdown(dir: string): string[] {
  // 再帰的に *.md / *.yaml を列挙 (architecture には openapi.yaml が含まれるため)
}

function isExcludedPath(path: string): boolean {
  // EXCLUDED_FEATURES のいずれかを含むパスは除外
  return EXCLUDED_FEATURES.some((name) =>
    path.includes(`features/${name}/`),
  );
}

function stripLegacySection(content: string): string {
  // "## 経緯" 見出し以下を切り落とす. ただし tasks.md 限定とする
  // (spec.md / plan.md には "## 経緯" は置かない方針のため)
  const idx = content.search(/^## 経緯\s*$/m);
  return idx === -1 ? content : content.slice(0, idx);
}

describe("docs に旧認証経路の参照が残らない", () => {
  for (const dir of TARGET_DIRS) {
    for (const file of walkMarkdown(join(ROOT, dir))) {
      if (isExcludedPath(file)) continue;
      const raw = readFileSync(file, "utf-8");
      const isTasks = file.endsWith("/tasks.md");
      const content = isTasks ? stripLegacySection(raw) : raw;
      for (const token of FORBIDDEN_TOKENS) {
        it(`${relative(ROOT, file)} に "${token}" が含まれない`, () => {
          expect(content).not.toContain(token);
        });
      }
    }
  }
});
```

#### テスト粒度の判断

`it()` をファイル × トークンの直積で生やすことで, どのファイル / どのトークンが原因か pinpoint できる. ファイル数が膨大 (60+ feature × 3 file = 180+) になるため, 実装段階で「1 つの `it()` でファイル全件を回す + 失敗時に違反箇所を `expect.fail(filename + token)` で報告する」形へ集約してもよい (test-designer の裁量).

#### 範囲 拡張の余地

将来的に他の禁則トークン (例えば `seedPasswordIfEmpty` 等) を追加する場合, `FORBIDDEN_TOKENS` 配列に足すだけで拡張できる. 本 BL では 3 トークンのみを対象とする.

### D-6: 内部リンク維持の手当て

`server-foundation` / `password-change` で本文を `## 経緯` 節に移動する際, 元のフラグメント (`#fr-pwd-2` 等) を他の feature から参照しているケースがあれば壊れる. 確認手順:

```
grep -rn "fr-pwd-2\|ac-8\|ac-9" docs/developer/
```

を実行し, クロスリンクの有無を確認する. 該当があれば移動先 (`## 経緯` 内のアンカー) に追従させるか, 移動を諦めてリード文 + 本文温存に切り替える.

## 処理フロー (作業者視点)

1. 本 plan で挙げた各 feature について D-4 の編集方針に従って書き換える.
2. `tasks.md` 末尾に `## 経緯` 節を必要に応じて追加する.
3. `__tests__/docs/no-legacy-auth-refs.test.ts` を新規作成する.
4. ローカルで `npx vitest run __tests__/docs/` を実行し, 全 it が green であることを確認する.
5. 仕上げに `grep -rn "VITE_AUTH_TOKEN\|APP_PASSWORD_HASH\|AUTH_TOKEN=" docs/developer/features docs/user docs/developer/setup docs/developer/architecture` を実行し, ヒットが `## 経緯` 配下のみであることを目視確認する.
6. `docs/developer/oss/secret-scan-report.md` は変更しない (検証 4 ディレクトリの範囲外).

## 重要な決定

- **D-D-1: 廃止 feature 自身は編集しない**. `app-login` / `initial-password-setup` は旧経路を廃止する feature 自身であり, 旧トークン名の言及がその feature の意義を語る. テストの除外条件に含める.
- **D-D-2: `## 経緯` 見出しを除外マーカーとする**. 単一の見出し文字列を decision boundary にすることで, テストの実装をシンプルに保つ.
- **D-D-3: 「書き換え」と「経緯隔離」を混在させる**. すべて書き換えに統一すると当時の設計判断が読めなくなる feature がある (`server-foundation` / `password-change`). すべて経緯隔離に統一すると本文が空になる feature がある (`web-client-foundation` の 1 行のみのケース). ファイル毎に D-1 の方針で使い分ける.
- **D-D-4: `secret-scan-report.md` は変更しない**. 検証 4 ディレクトリの範囲外であり, 監査時点の記録として保持するのが自然 (spec の U-2 で第一候補として明示).
- **D-D-5: ADR は作らない**. 本 BL は「記述の整合性回復」であり, 新たな設計判断は伴わない (ドキュメント管理ルールに関する判断は project.md のスコープであり, project.md は触らない).

## リスク / 代替案

- **リスク R-1: クロスリンクの破壊**. `password-change` の AC-8 / AC-9 を `## 経緯` に移動するとフラグメントリンクが壊れる可能性. → 緩和策: D-6 の grep でクロスリンクの有無を事前確認し, 該当があれば移動先のアンカーを明示する.
- **リスク R-2: 「経緯」節への記述漏れで構造が崩れる**. `## 経緯` 節を追加するときに見出しレベルや前後の空行を間違えると, テストの正規表現 `/^## 経緯\s*$/m` が引っかからない. → 緩和策: D-2 のフォーマットを厳密に守る. test-designer 段階でフォーマット違反を検出するテストを 1 件追加する選択肢もある.
- **リスク R-3: テストが過剰反応する**. たとえばリード文に `VITE_AUTH_TOKEN` を文字列リテラルで書くと検出されてしまう. → 緩和策: リード文では `<旧トークン名>` のような記号で書き, 旧トークン名を文字列リテラルとして含めない (D-3).
- **代替案 A-1: 全ファイル一括書き換え**. 文書構造ごと現行モデルに揃える. メリット: 読みやすい. デメリット: 当時の設計判断が読めなくなる + 編集量が膨大 + フラグメントリンク破壊のリスク. → 採用しない.
- **代替案 A-2: ドキュメント側を温存し検証 grep を緩める**. 旧トークン名を許容する例外リストを保守する. メリット: 編集量ゼロ. デメリット: 新規読み手が現行 / 旧来を区別できないままになる. → 採用しない (本 BL の目的を満たさない).

## テスト方針

> 全体方針は [`../../quality/test-catalog.md`](../../quality/test-catalog.md). 本 feature ではドキュメントのみの変更のため, 既存テスト群への影響はない. 新規追加するテストは 1 本のみ.

### 単体テスト (vitest)

- **`__tests__/docs/no-legacy-auth-refs.test.ts`** (新規):
  - AC-1: 対象 4 ディレクトリの spec.md / plan.md / tasks.md に `VITE_AUTH_TOKEN` / `APP_PASSWORD_HASH` / `AUTH_TOKEN` が含まれない.
  - AC-6: tasks.md の `## 経緯` 見出し以下は assert 対象から除外される.
  - 除外条件: `features/app-login/` および `features/initial-password-setup/` 配下のすべて.

### 手動確認

- AC-2: `android-server-mode/spec.md` / `plan.md` を目視で読み, opaque token 認証への記述に統一されていることを確認する.
- AC-3: `web-client-foundation/plan.md` L36 周辺を目視で読み, `VITE_API_BASE_URL` のみが集約対象であることを確認する.
- AC-4: `git diff main..HEAD docs/developer/features/app-login/ docs/developer/features/initial-password-setup/` で差分が無いことを確認する.

### 既存テスト

- ドキュメントのみの変更のため, サーバ / Web / E2E の既存テスト群は変更も影響もない. ただし PR 段階で `npm test` 全件 green を確認する.

## スコープ境界

- `docs/developer/features/<name>/{spec,plan,tasks}.md` のみ編集する.
- コード本体 / `.env.example` / マイグレーション SQL / API 定義 (`openapi.yaml`) / アーキテクチャ図は変更しない.
- `docs/developer/oss/secret-scan-report.md` は変更しない.
- `backlog.md` 本文中の旧トークン言及は変更しない (BL-082 のスコープで対応済 / 残っている記述は status / 履歴記述として保持).
- `docs/developer/project.md` は触らない (リポジトリ規約).

## 未決事項 / 確認待ち

- 仕様 (spec.md) の未決事項 U-1 〜 U-5 を参照. plan.md 側では第一候補に基づいて作業範囲を確定している.
- `password-change/spec.md` の FR-PWD-2 / AC-8 / AC-9 を `## 経緯` に移動する際, フラグメントリンクのクロスチェック (D-6) を事前に実施する.
