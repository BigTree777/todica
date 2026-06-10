/**
 * 「＋プロジェクトの追加」ボタンを今日ビューに配置 E2E (BL-044 / inline-project-create).
 *
 * 仕様参照:
 *   docs/developer/features/inline-project-create/spec.md §「受け入れ基準」AC-1〜AC-11.
 *   docs/developer/features/inline-project-create/plan.md §「テスト方針」.
 *   (AC-12 の axe スキャンは e2e/a11y.spec.ts に追加した. 本ファイルでは扱わない)
 *
 * 本ファイルは TDD の "red" を作るための E2E.
 *   - 現状の today-view には「＋プロジェクトの追加」button と <ProjectCreateDialog />
 *     が存在しないため, ボタン操作を含むテストは全て失敗する.
 *   - implementer が web/src/ui/project-create-dialog/ を新規実装し today-view の
 *     ヘッダ領域に組み込むことで green 化する.
 *   - AC-1 後半 (/tomorrow・/focus にボタンが無い) は「存在しないこと」の検証で
 *     あるため現状でも通過しうるが, 実装後の回帰ガードとして自覚的に書いている
 *     (誤って tomorrow / focus 側にボタンを追加した場合に red になる).
 *   - AC-10 の ProjectsView 無改修確認も同様に現状 pass しうる回帰ガード.
 *
 * セットアップは set-focus-gesture.spec.ts の慣行に従い API 直叩きで行う.
 * プロジェクト名 / タスク名は `Date.now()` suffix で他テストと衝突させない.
 * E2E サーバは TEST_NOW の FakeClock (凍結時計) で動くため, createdAt 同値の
 * tie-break に依存する並び順 assert は行わない (BL-043 の教訓). AC-4 では
 * priority 差 (highest のダミー vs normal の新規タスク) で「新規タスクが
 * 一覧側に来る」ことを決定論的に保証する.
 */
import { type APIRequestContext, type Page, expect, test } from "@playwright/test";

const API_BASE = "http://localhost:3000";
const AUTH_HEADER = { Authorization: "Bearer dev-token" };

interface ProjectDto {
  id: string;
  name: string;
  version: number;
}

/** GET /api/v1/projects でプロジェクト一覧 (サーバ正本) を取得する. */
async function listProjects(request: APIRequestContext): Promise<ProjectDto[]> {
  const res = await request.get(`${API_BASE}/api/v1/projects`, {
    headers: AUTH_HEADER,
  });
  expect(res.status()).toBe(200);
  const body = (await res.json()) as { projects: ProjectDto[] };
  return body.projects;
}

/** API 直叩きでプロジェクトを 1 件作成する (セットアップ用). */
async function createProjectViaApi(request: APIRequestContext, name: string): Promise<ProjectDto> {
  const res = await request.post(`${API_BASE}/api/v1/projects`, {
    headers: { ...AUTH_HEADER, "Idempotency-Key": crypto.randomUUID() },
    data: { id: crypto.randomUUID(), name },
  });
  expect(res.status()).toBe(201);
  const body = (await res.json()) as { project: ProjectDto };
  return body.project;
}

/**
 * 全プロジェクトを API 直叩きで削除し, 「プロジェクト 0 件」の前提状態を作る
 * (AC-3 / AC-5 / AC-10 / AC-11 のセットアップ).
 *
 * フルスイート実行では先行テストの残骸プロジェクトが蓄積し, トグル巡回の
 * 手数が非決定的になるため盤面を空にする. プロジェクト削除でタスク側は
 * projectId が null になるだけで消えない (カスケード null. projects.spec.ts で
 * 検証済み) ため, 他テストの残骸タスクには影響しない. workers = 1 (直列実行)
 * のため並行競合も無い.
 */
async function clearProjects(request: APIRequestContext): Promise<void> {
  const projects = await listProjects(request);
  for (const project of projects) {
    const res = await request.delete(`${API_BASE}/api/v1/projects/${project.id}`, {
      headers: {
        ...AUTH_HEADER,
        "Idempotency-Key": crypto.randomUUID(),
        "If-Match": String(project.version),
      },
    });
    expect(res.status()).toBe(204);
  }
}

/** API 直叩きでタスクを 1 件作成する (AC-4 のダミー強調タスク用). */
async function createTaskViaApi(
  request: APIRequestContext,
  params: { name: string; priority?: "highest" | "normal" | "later" },
): Promise<string> {
  const id = crypto.randomUUID();
  const res = await request.post(`${API_BASE}/api/v1/tasks`, {
    headers: { ...AUTH_HEADER, "Idempotency-Key": crypto.randomUUID() },
    data: {
      id,
      name: params.name,
      ...(params.priority ? { priority: params.priority } : {}),
    },
  });
  expect(res.status()).toBe(201);
  return id;
}

/** 今日ビューヘッダ領域の「＋プロジェクトの追加」button (spec REQ-1). */
function addProjectButton(page: Page) {
  return page.getByRole("button", { name: "＋プロジェクトの追加" });
}

/** プロジェクト追加モーダル (アクセシブルネーム「プロジェクトの追加」. spec REQ-2). */
function createDialog(page: Page) {
  return page.getByRole("dialog", { name: "プロジェクトの追加" });
}

/** モーダル内の「プロジェクト名」入力 (spec REQ-3). */
function dialogNameInput(page: Page) {
  return createDialog(page).getByLabel("プロジェクト名");
}

/** モーダル内の「追加」(submit) button. 起票フォームの「追加」と取り違えない. */
function dialogSubmitButton(page: Page) {
  return createDialog(page).getByRole("button", { name: "追加" });
}

/**
 * 起票フォーム scope 内のプロジェクトトグルボタン (BL-041 <ProjectToggle />).
 * project-toggle.spec.ts と同じ流儀. today / tomorrow 両方のフォーム名に合う.
 */
function projectToggleButton(page: Page) {
  return page
    .getByRole("form", { name: /タスク起票フォーム|起票フォーム/ })
    .getByRole("button", { name: /プロジェクト/ });
}

/** 今日ビューのタスク一覧 (<ul aria-label="タスク一覧">) 内の指定タスク名のカード. */
function listRow(page: Page, taskName: string) {
  return page
    .getByRole("list", { name: "タスク一覧" })
    .getByRole("listitem")
    .filter({ hasText: taskName });
}

/**
 * POST /api/v1/projects の発生回数を数えるトラッカー (AC-6 / AC-7 の
 * 「POST が飛ばない」検証用. リスナーはテスト終了とともに破棄される).
 */
function trackProjectPosts(page: Page): { count: () => number } {
  let n = 0;
  page.on("request", (req) => {
    if (req.url().includes("/api/v1/projects") && req.method() === "POST") n += 1;
  });
  return { count: () => n };
}

/** /today を開き, 起票フォームの描画完了まで待つ. */
async function gotoToday(page: Page): Promise<void> {
  await page.goto("/today");
  await expect(page.getByRole("form", { name: "タスク起票フォーム" })).toBeVisible();
}

/**
 * モーダルを開いて名称を入力し「追加」で作成する. 作成された Project を
 * POST レスポンスから返し, モーダルが閉じたことまで確認する (spec REQ-4).
 */
async function createProjectViaModal(page: Page, name: string): Promise<ProjectDto> {
  await addProjectButton(page).click();
  await expect(createDialog(page)).toBeVisible();
  await dialogNameInput(page).fill(name);
  const responsePromise = page.waitForResponse(
    (res) => res.url().includes("/api/v1/projects") && res.request().method() === "POST",
  );
  await dialogSubmitButton(page).click();
  const response = await responsePromise;
  expect(response.status()).toBe(201);
  const body = (await response.json()) as { project: ProjectDto };
  await expect(createDialog(page)).not.toBeVisible();
  return body.project;
}

/**
 * プロジェクトトグルを最大 maxClicks 回クリックし, 表示されたラベルを全て集める
 * (AC-5 / AC-10 の巡回経路検証用. クリックはサーバ送信を伴わない).
 */
async function collectToggleLabels(page: Page, maxClicks: number): Promise<string[]> {
  const toggle = projectToggleButton(page);
  const labels: string[] = [];
  for (let i = 0; i < maxClicks; i++) {
    labels.push(((await toggle.textContent()) ?? "").trim());
    await toggle.click();
  }
  return labels;
}

test.describe("inline-project-create (BL-044) のシナリオ", () => {
  test("AC-1: /today に「＋プロジェクトの追加」button が 1 個あり, /tomorrow・/focus には無い", async ({
    page,
  }) => {
    await gotoToday(page);
    await expect(page.getByRole("heading", { name: "今日" })).toBeVisible();

    // ヘッダ領域にアクセシブルネーム「＋プロジェクトの追加」の button が 1 個 (spec REQ-1).
    await expect(addProjectButton(page)).toHaveCount(1);
    // この時点で dialog は表示されていない (ConflictDialog は閉時 null 描画, 新規モーダルも閉).
    await expect(page.getByRole("dialog")).toHaveCount(0);

    // /tomorrow には存在しない (spec REQ-1 / UX の決定. 回帰ガード).
    await page.goto("/tomorrow");
    await expect(page.getByRole("heading", { name: "明日のタスク" })).toBeVisible();
    await expect(addProjectButton(page)).toHaveCount(0);

    // /focus にも存在しない (回帰ガード).
    await page.goto("/focus");
    await expect(page.getByRole("heading", { name: "現在のタスク" })).toBeVisible();
    await expect(addProjectButton(page)).toHaveCount(0);
  });

  test("AC-2: クリックでモーダルが開き, 名称入力に初期フォーカス, URL は /today のまま", async ({
    page,
  }) => {
    await gotoToday(page);
    await addProjectButton(page).click();

    // アクセシブルネーム「プロジェクトの追加」のモーダルが表示される (spec REQ-2).
    const dialog = createDialog(page);
    await expect(dialog).toBeVisible();

    // ラベル「プロジェクト名」のテキスト入力 + 「追加」「キャンセル」button (spec REQ-3).
    await expect(dialog.getByLabel("プロジェクト名")).toBeVisible();
    await expect(dialog.getByRole("button", { name: "追加" })).toBeVisible();
    await expect(dialog.getByRole("button", { name: "キャンセル" })).toBeVisible();

    // 開いた直後, フォーカスは名称入力にある (spec REQ-2).
    await expect(dialog.getByLabel("プロジェクト名")).toBeFocused();

    // 画面遷移は発生しない (URL 不変).
    await expect(page).toHaveURL(/\/today$/);
  });

  test("AC-3: 作成で POST (Idempotency-Key 付き) → モーダル閉鎖 → トグルに自動選択反映", async ({
    page,
    request,
  }) => {
    // プロジェクト 0 件の前提状態を作る.
    await clearProjects(request);
    const projectName = `仕事 ${Date.now()}`;

    await gotoToday(page);
    // 起票フォームのトグルは「（未分類）」を表示している.
    await expect(projectToggleButton(page)).toContainText("（未分類）");

    await addProjectButton(page).click();
    await expect(createDialog(page)).toBeVisible();
    await dialogNameInput(page).fill(projectName);

    // POST /api/v1/projects が { name } を含む body + Idempotency-Key 付きで呼ばれる.
    const requestPromise = page.waitForRequest(
      (req) => req.url().includes("/api/v1/projects") && req.method() === "POST",
    );
    await dialogSubmitButton(page).click();
    const postRequest = await requestPromise;
    expect(postRequest.postDataJSON()).toMatchObject({ name: projectName });
    expect(postRequest.headers()["idempotency-key"]).toBeTruthy();

    // モーダルが閉じる.
    await expect(createDialog(page)).not.toBeVisible();

    // 起票フォームのトグルのボタン表面に新規プロジェクト名 (自動選択. spec REQ-4).
    await expect(projectToggleButton(page)).toContainText(projectName);

    // サーバ正本 (GET /api/v1/projects) に反映されている.
    const projects = await listProjects(request);
    expect(projects.some((p) => p.name === projectName)).toBe(true);
  });

  test("AC-4: 追加直後の起票で新規プロジェクトの projectId が送信され, トグルはリセットされる", async ({
    page,
    request,
  }) => {
    await clearProjects(request);
    const stamp = Date.now();
    const projectName = `仕事 ${stamp}`;
    const taskName = `インライン追加テスト ${stamp}`;

    // 新規タスク (normal) が暗黙 focus (強調セクション) に吸われず一覧側に来るよう,
    // highest のダミーを先に置く (FakeClock 下の tie-break 回避. ファイル冒頭コメント参照).
    await createTaskViaApi(request, { name: `AC4ダミー ${stamp}`, priority: "highest" });

    await gotoToday(page);
    const project = await createProjectViaModal(page, projectName);
    await expect(projectToggleButton(page)).toContainText(projectName);

    // タスク名を入力し, 起票フォームの「追加」を押す.
    await page.getByLabel("タスク名").fill(taskName);
    const taskRequestPromise = page.waitForRequest(
      (req) => req.url().includes("/api/v1/tasks") && req.method() === "POST",
    );
    await page
      .getByRole("form", { name: "タスク起票フォーム" })
      .getByRole("button", { name: "追加" })
      .click();

    // POST /api/v1/tasks の body に新規プロジェクトの id が projectId として含まれる.
    const taskRequest = await taskRequestPromise;
    expect(taskRequest.postDataJSON()).toMatchObject({ projectId: project.id });

    // 起票後, トグルは「（未分類）」に戻る (BL-041 AC-10 互換).
    await expect(projectToggleButton(page)).toContainText("（未分類）");

    // 一覧にタスクカードが追加される. カード副情報へのプロジェクト名表示は
    // 検証しない (spec U-7: today-view カードは本 BL で触らない).
    await expect(listRow(page, taskName)).toBeVisible();
  });

  test("AC-5: 自動選択後もトグル巡回に既存 + 新規 + （未分類）が全て含まれる", async ({
    page,
    request,
  }) => {
    await clearProjects(request);
    const stamp = Date.now();
    const existingName = `個人 ${stamp}`;
    const newName = `仕事 ${stamp}`;
    await createProjectViaApi(request, existingName);

    await gotoToday(page);
    await createProjectViaModal(page, newName);
    await expect(projectToggleButton(page)).toContainText(newName);

    // プロジェクト 2 件 + 未分類 = 3 ポジションの巡回. 8 クリックで必ず 1 周以上する.
    const labels = await collectToggleLabels(page, 8);
    expect(labels.some((t) => t.includes(existingName))).toBe(true);
    expect(labels.some((t) => t.includes(newName))).toBe(true);
    expect(labels.some((t) => t.includes("（未分類）"))).toBe(true);
  });

  test("AC-6: キャンセル / Escape で閉じると POST が飛ばず, フォーカス復帰し, 入力は破棄される", async ({
    page,
  }) => {
    await gotoToday(page);
    const posts = trackProjectPosts(page);

    // 名称を入力して「キャンセル」.
    await addProjectButton(page).click();
    await expect(createDialog(page)).toBeVisible();
    await dialogNameInput(page).fill("破棄されるプロジェクト");
    await createDialog(page).getByRole("button", { name: "キャンセル" }).click();

    // モーダルが閉じ, POST は飛ばず, フォーカスは開いたボタンに戻る (spec REQ-5 / REQ-2).
    await expect(createDialog(page)).not.toBeVisible();
    expect(posts.count()).toBe(0);
    await expect(addProjectButton(page)).toBeFocused();

    // 再オープン時, 名称入力は空 (spec REQ-5: 閉鎖時に入力状態を破棄).
    await addProjectButton(page).click();
    await expect(createDialog(page)).toBeVisible();
    await expect(dialogNameInput(page)).toHaveValue("");

    // 名称を入力して Escape (<dialog> ネイティブの cancel).
    await dialogNameInput(page).fill("破棄されるプロジェクト2");
    await page.keyboard.press("Escape");
    await expect(createDialog(page)).not.toBeVisible();
    expect(posts.count()).toBe(0);
  });

  test("AC-7: 空名称では POST が飛ばず, モーダルは開いたまま (required 抑止)", async ({ page }) => {
    await gotoToday(page);
    const posts = trackProjectPosts(page);

    await addProjectButton(page).click();
    await expect(createDialog(page)).toBeVisible();

    // 空のまま「追加」→ required によりクライアント側で送信抑止 (spec REQ-6).
    await dialogSubmitButton(page).click();
    await expect(createDialog(page)).toBeVisible();
    expect(posts.count()).toBe(0);
  });

  test("AC-8: 失敗時はエラーバナー + 入力保持で, 正常化後に再試行が成功する", async ({ page }) => {
    const projectName = `再試行プロジェクト ${Date.now()}`;
    await gotoToday(page);

    // POST /api/v1/projects にサーバ失敗 (500) を注入する (GET は素通し).
    await page.route("**/api/v1/projects", async (route) => {
      if (route.request().method() === "POST") {
        await route.fulfill({
          status: 500,
          contentType: "application/json",
          body: JSON.stringify({ error: { code: "INTERNAL", message: "injected failure" } }),
        });
        return;
      }
      await route.fallback();
    });

    await addProjectButton(page).click();
    await expect(createDialog(page)).toBeVisible();
    await dialogNameInput(page).fill(projectName);
    await dialogSubmitButton(page).click();

    // 「通信に失敗しました」のエラーバナーが表示される (BL-034 / spec REQ-7).
    await expect(page.getByRole("alert", { name: "通信エラー通知" })).toBeVisible();
    await expect(page.getByText("通信に失敗しました")).toBeVisible();

    // モーダルは開いたままで, 入力した名称が保持されている (再試行可能).
    await expect(createDialog(page)).toBeVisible();
    await expect(dialogNameInput(page)).toHaveValue(projectName);

    // サーバを正常応答に戻して再度「追加」→ 作成成功.
    await page.unroute("**/api/v1/projects");
    const responsePromise = page.waitForResponse(
      (res) => res.url().includes("/api/v1/projects") && res.request().method() === "POST",
    );
    await dialogSubmitButton(page).click();
    expect((await responsePromise).status()).toBe(201);

    // モーダルが閉じ, トグルに反映される.
    await expect(createDialog(page)).not.toBeVisible();
    await expect(projectToggleButton(page)).toContainText(projectName);
  });

  test("AC-9: 同名プロジェクトを作成でき, 一覧に 2 件含まれる (BL-016 同名許容と整合)", async ({
    page,
    request,
  }) => {
    const dupName = `同名 ${Date.now()}`;
    await createProjectViaApi(request, dupName);

    await gotoToday(page);
    await createProjectViaModal(page, dupName);

    // サーバ正本の一覧に同名が 2 件含まれる (重複チェックは行わない).
    const projects = await listProjects(request);
    expect(projects.filter((p) => p.name === dupName)).toHaveLength(2);
  });

  test("AC-10: 作成したプロジェクトは /tomorrow のトグルと /projects の一覧にも反映される", async ({
    page,
    request,
  }) => {
    await clearProjects(request);
    const crossName = `横断確認 ${Date.now()}`;

    await gotoToday(page);
    await createProjectViaModal(page, crossName);

    // /tomorrow の起票フォームのトグル巡回に含まれる (["projects"] キャッシュ共有).
    await page.goto("/tomorrow");
    await expect(page.getByRole("form", { name: "明日のタスク起票フォーム" })).toBeVisible();
    const labels = await collectToggleLabels(page, 4);
    expect(labels.some((t) => t.includes(crossName))).toBe(true);

    // /projects の一覧 (name 昇順) にも表示される.
    await page.goto("/projects");
    await expect(page.getByText(crossName, { exact: true })).toBeVisible();

    // ProjectsView は無改修: 作成フォーム / 名称変更 / 削除が従来どおり存在する
    // (spec REQ-9. 現状でも pass する回帰ガード).
    const createForm = page.getByRole("form", { name: "プロジェクト作成フォーム" });
    await expect(createForm).toBeVisible();
    await expect(createForm.getByLabel("プロジェクト名")).toBeVisible();
    await expect(createForm.getByRole("button", { name: "追加" })).toBeVisible();
    const row = page.getByRole("listitem").filter({ hasText: crossName });
    await expect(row.getByRole("button", { name: "名称変更" })).toBeVisible();
    await expect(row.getByRole("button", { name: "削除" })).toBeVisible();
  });

  test("AC-11: キーボードのみ (Tab + Enter) で追加からトグル反映まで完結する", async ({
    page,
    request,
  }) => {
    await clearProjects(request);
    const kbName = `キーボード追加 ${Date.now()}`;

    await gotoToday(page);

    // マウスを使わず Tab のみで「＋プロジェクトの追加」button に到達する.
    // (locator の auto-wait を使うと red フェーズで毎回 30 秒待つため evaluate で判定する.
    //  set-focus-gesture.spec.ts AC-5 と同じパターン.)
    const MAX_TABS = 100;
    let reached = false;
    for (let i = 0; i < MAX_TABS; i++) {
      await page.keyboard.press("Tab");
      reached = await page.evaluate(() => {
        const el = document.activeElement as HTMLElement | null;
        if (!el || el.tagName !== "BUTTON") return false;
        return (el.textContent ?? "").trim() === "＋プロジェクトの追加";
      });
      if (reached) break;
    }
    expect(
      reached,
      `Tab を ${MAX_TABS} 回押しても「＋プロジェクトの追加」button に到達できなかった`,
    ).toBe(true);

    // Enter でモーダルが開き, 名称入力にフォーカスがある.
    await page.keyboard.press("Enter");
    await expect(createDialog(page)).toBeVisible();
    await expect(dialogNameInput(page)).toBeFocused();

    // 名称を打鍵し Enter で送信する (form の submit. spec REQ-3).
    await page.keyboard.type(kbName);
    const responsePromise = page.waitForResponse(
      (res) => res.url().includes("/api/v1/projects") && res.request().method() === "POST",
    );
    await page.keyboard.press("Enter");
    expect((await responsePromise).status()).toBe(201);

    // モーダルが閉じ, トグルのボタン表面に新規プロジェクト名が表示される.
    await expect(createDialog(page)).not.toBeVisible();
    await expect(projectToggleButton(page)).toContainText(kbName);
  });
});
