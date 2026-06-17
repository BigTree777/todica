/**
 * 「現在に設定」操作の導線再設計 E2E (BL-043 / set-focus-gesture).
 *
 * 仕様参照:
 *   docs/developer/features/set-focus-gesture/spec.md §「受け入れ基準」AC-1〜AC-9.
 *   docs/developer/features/set-focus-gesture/plan.md §「テスト方針」.
 *
 * 本ファイルは TDD の "red" を作るための E2E.
 *   - 現状の today-view (BL-042 後) にはカード上の「現在のタスクにする」button が
 *     存在しないため, ボタン操作を含むテストは全て失敗する.
 *   - implementer が web/src/ui/today-view/today-view.tsx に setFocusMutation /
 *     handleSetFocus と一覧カードの button を再導入することで green 化する.
 *   - AC-7 (tomorrow ビューに button が無い) と AC-8 前半 (解除 UI が無い) は
 *     「存在しないこと」の検証であるため現状でも通過しうるが, 実装後の回帰ガード
 *     として必要 (誤って tomorrow 側や解除 UI を追加した場合に red になる).
 *
 * AC-4 (リロード後の復元) は e2e/state-restoration.spec.ts の skip 解除で扱う.
 * AC-10 (axe / WCAG 2.1 AA) は既存 e2e/a11y.spec.ts が /today, /tomorrow, /focus を
 * スキャン済みのため本ファイルでは追加しない (実装後も a11y.spec.ts green 維持で担保).
 *
 * セットアップは focus-view.spec.ts / state-restoration.spec.ts の慣行に従い
 * API 直叩きで行う. タスク名は `Date.now()` suffix で他テストと衝突させない.
 * FocusSelection はサーバ全体で単一 (singleton) のため, 各テスト冒頭で
 * 明示 focus を解除して前提状態 (currentTaskId = null) を作る.
 */
import { type APIRequestContext, expect, type Page, test } from "@playwright/test";
import { getApiAuthHeader } from "./helpers/api-auth.js";

const API_BASE = "http://localhost:3000";

/** API 直叩きでタスクを 1 件作成し, その id を返す. */
async function createTask(
  request: APIRequestContext,
  authHeader: { Authorization: string },
  params: {
    name: string;
    priority?: "highest" | "normal" | "later";
    dueDate?: "today" | "tomorrow";
  },
): Promise<string> {
  const id = crypto.randomUUID();
  const res = await request.post(`${API_BASE}/api/v1/tasks`, {
    headers: { ...authHeader, "Idempotency-Key": crypto.randomUUID() },
    data: {
      id,
      name: params.name,
      ...(params.priority ? { priority: params.priority } : {}),
      ...(params.dueDate ? { dueDate: params.dueDate } : {}),
    },
  });
  expect(res.status()).toBe(201);
  return id;
}

/** GET /api/v1/focus で FocusSelection の現状を取得する. */
async function getFocus(
  request: APIRequestContext,
  authHeader: { Authorization: string },
): Promise<{ currentTaskId: string | null; version: number }> {
  const res = await request.get(`${API_BASE}/api/v1/focus`, {
    headers: authHeader,
  });
  expect(res.status()).toBe(200);
  const body = (await res.json()) as {
    focus: { currentTaskId: string | null; version: number };
  };
  return body.focus;
}

/** PUT /api/v1/focus { taskId } を API 直叩きで実行する (セットアップ用). */
async function putFocus(
  request: APIRequestContext,
  authHeader: { Authorization: string },
  taskId: string | null,
): Promise<void> {
  const focus = await getFocus(request, authHeader);
  const res = await request.put(`${API_BASE}/api/v1/focus`, {
    headers: {
      ...authHeader,
      "Idempotency-Key": crypto.randomUUID(),
      "If-Match": String(focus.version),
    },
    data: { taskId },
  });
  expect(res.status()).toBe(200);
}

/**
 * 今日のタスクを API 直叩きで全削除し, 盤面を空にする (AC-5 専用セットアップ).
 *
 * フルスイート実行では先行テストの残骸タスクが /today に大量に蓄積し,
 * Tab 巡回で B カードへ到達するまでの手数が上限 (MAX_TABS) を超えてしまう.
 * 盤面を空にすることで「強調 = A / 一覧 = B のみ」となり Tab 手数が
 * 決定論的に小さく収まる. workers = 1 (直列実行) のため他テストと競合しない
 * (後続テストは自前でタスクを作る. 残骸への依存は無い).
 */
async function clearTodayTasks(
  request: APIRequestContext,
  authHeader: { Authorization: string },
): Promise<void> {
  const res = await request.get(`${API_BASE}/api/v1/tasks?trashed=false`, {
    headers: authHeader,
  });
  expect(res.status()).toBe(200);
  const body = (await res.json()) as {
    tasks: Array<{ id: string; dueDate: string; version: number }>;
  };
  for (const task of body.tasks.filter((t) => t.dueDate === "today")) {
    const del = await request.delete(`${API_BASE}/api/v1/tasks/${task.id}`, {
      headers: {
        ...authHeader,
        "Idempotency-Key": crypto.randomUUID(),
        "If-Match": String(task.version),
      },
    });
    expect(del.status()).toBe(204);
  }
}

/** 明示 focus を解除して currentTaskId = null の前提状態を作る. */
async function resetFocus(
  request: APIRequestContext,
  authHeader: { Authorization: string },
): Promise<void> {
  const focus = await getFocus(request, authHeader);
  if (focus.currentTaskId === null) return;
  await putFocus(request, authHeader, null);
}

/**
 * /today を開き, focus query の初回ロード完了 (GET /api/v1/focus 200) まで待つ.
 * spec REQ-2: FocusSelection 未ロード中の作動は no-op のため,
 * ロード完了前にクリックすると PUT が飛ばず flaky になるのを防ぐ.
 */
async function gotoToday(page: Page): Promise<void> {
  const focusLoaded = page.waitForResponse(
    (res) =>
      res.url().includes("/api/v1/focus") &&
      res.request().method() === "GET" &&
      res.status() === 200,
  );
  await page.goto("/today");
  await focusLoaded;
}

/** 今日ビューのタスク一覧 (<ul aria-label="タスク一覧">). */
function taskList(page: Page) {
  return page.getByRole("list", { name: "タスク一覧" });
}

/** タスク一覧内の, 指定タスク名を含むカード (listitem). */
function listRow(page: Page, taskName: string) {
  // BL-070 追従: name は <input aria-label="{name} の名前"> の value に入る.
  // hasText では matches しないため, 該当 aria-label の input を持つ listitem でフィルタする.
  return taskList(page)
    .getByRole("listitem")
    .filter({ has: page.getByLabel(`${taskName} の名前`) });
}

/** 強調セクション (<section aria-label="現在のタスク">). /focus でも同名 region. */
function focusedRegion(page: Page) {
  return page.getByRole("region", { name: "現在のタスク" });
}

test.describe("set-focus-gesture (BL-043) のシナリオ", () => {
  test("AC-1: 一覧の各カードに「現在のタスクにする」button があり, 強調セクションには無い", async ({
    page,
    request,
  }) => {
    const authHeader = await getApiAuthHeader(request, API_BASE);
    await resetFocus(request, authHeader);
    const stamp = Date.now();
    const headName = `AC1強調 ${stamp}`;
    const nameB = `AC1一覧B ${stamp + 1}`;
    const nameC = `AC1一覧C ${stamp + 2}`;
    // 強調対象候補 (highest) 1 件 + 一覧側 (later) 2 件.
    await createTask(request, authHeader, { name: headName, priority: "highest" });
    await createTask(request, authHeader, { name: nameB, priority: "later" });
    await createTask(request, authHeader, { name: nameC, priority: "later" });

    await gotoToday(page);
    await expect(listRow(page, nameB)).toBeVisible();
    await expect(listRow(page, nameC)).toBeVisible();

    // 各カードに「現在のタスクにする」button が 1 個ずつ存在する
    // (一覧全体で listitem 数 == button 数, かつ本テスト由来カードで各 1 個).
    const itemCount = await taskList(page).getByRole("listitem").count();
    expect(itemCount).toBeGreaterThanOrEqual(2);
    await expect(taskList(page).getByRole("button", { name: "現在のタスクにする" })).toHaveCount(
      itemCount,
    );
    await expect(
      listRow(page, nameB).getByRole("button", { name: "現在のタスクにする" }),
    ).toHaveCount(1);
    await expect(
      listRow(page, nameC).getByRole("button", { name: "現在のタスクにする" }),
    ).toHaveCount(1);

    // BL-042 の 3 アクションボタン (削除 / 明日にする / 完了) は従来どおり存在する.
    await expect(listRow(page, nameB).getByRole("button", { name: "削除" })).toBeVisible();
    await expect(listRow(page, nameB).getByRole("button", { name: "明日にする" })).toBeVisible();
    await expect(listRow(page, nameB).getByRole("button", { name: "完了" })).toBeVisible();

    // 強調セクション内には「現在のタスクにする」button が存在しない (spec REQ-1).
    await expect(focusedRegion(page)).toBeVisible();
    await expect(
      focusedRegion(page).getByRole("button", { name: "現在のタスクにする" }),
    ).toHaveCount(0);
  });

  test("AC-2: クリックで PUT /api/v1/focus が呼ばれ, 強調セクションに対象タスクが反映される", async ({
    page,
    request,
  }) => {
    const authHeader = await getApiAuthHeader(request, API_BASE);
    await resetFocus(request, authHeader);
    const stamp = Date.now();
    const nameA = `AC2タスクA ${stamp}`;
    const nameB = `AC2タスクB ${stamp + 1}`;
    // A は強調対象候補 (highest), B は一覧側 (later で並び先頭にならない).
    await createTask(request, authHeader, { name: nameA, priority: "highest" });
    const idB = await createTask(request, authHeader, { name: nameB, priority: "later" });

    // クライアントがロードする FocusSelection.version を控えておく (If-Match 検証用).
    const focusBefore = await getFocus(request, authHeader);
    expect(focusBefore.currentTaskId).toBeNull();

    await gotoToday(page);
    await expect(listRow(page, nameB)).toBeVisible();

    // PUT /api/v1/focus { taskId: B.id } が送信される (If-Match = FocusSelection.version).
    const putRequestPromise = page.waitForRequest(
      (req) => req.url().includes("/api/v1/focus") && req.method() === "PUT",
    );
    await listRow(page, nameB).getByRole("button", { name: "現在のタスクにする" }).click();
    const putRequest = await putRequestPromise;
    expect(putRequest.postDataJSON()).toEqual({ taskId: idB });
    expect(putRequest.headers()["if-match"]).toBe(String(focusBefore.version));

    // 再フェッチ後, 強調セクションに B が表示される.
    await expect(focusedRegion(page).getByLabel(`${nameB} の名前`)).toBeVisible();
    // B は一覧から消える (D-008 重複表示禁止).
    await expect(listRow(page, nameB)).toHaveCount(0);
    // A は一覧側に表示される (元の強調対象は一覧に戻る).
    await expect(listRow(page, nameA)).toBeVisible();

    // サーバ正本: GET /api/v1/focus の currentTaskId が B.id になっている.
    await expect.poll(async () => (await getFocus(request, authHeader)).currentTaskId).toBe(idB);
  });

  test("AC-3: 設定した focus が focus-view (/focus) に反映され, focus-view は 2 ボタンのまま", async ({
    page,
    request,
  }) => {
    const authHeader = await getApiAuthHeader(request, API_BASE);
    await resetFocus(request, authHeader);
    const stamp = Date.now();
    const nameA = `AC3タスクA ${stamp}`;
    const nameB = `AC3タスクB ${stamp + 1}`;
    await createTask(request, authHeader, { name: nameA, priority: "highest" });
    await createTask(request, authHeader, { name: nameB, priority: "later" });

    await gotoToday(page);
    await expect(listRow(page, nameB)).toBeVisible();
    await listRow(page, nameB).getByRole("button", { name: "現在のタスクにする" }).click();
    await expect(focusedRegion(page).getByLabel(`${nameB} の名前`)).toBeVisible();

    // BL-049 でサイドバーはハンバーガー開閉式のオーバーレイメニューに変わったため,
    // メニューを開いてから「現在のタスク」リンクを click する.
    await page.getByRole("button", { name: "メニューを開く" }).click();
    const navMenu = page.getByRole("dialog", { name: "ナビゲーションメニュー" });
    await expect(navMenu).toBeVisible();
    await navMenu.getByRole("link", { name: "現在のタスク" }).click();
    await expect(page).toHaveURL(/\/focus$/);

    // focus-view に B が大表示される.
    await expect(focusedRegion(page).getByLabel(`${nameB} の名前`)).toBeVisible();

    // focus-view のアクションは「削除」「完了」の 2 ボタンのまま (BL-037 無改修 / spec REQ-6).
    await expect(focusedRegion(page).getByRole("button", { name: "削除" })).toBeVisible();
    await expect(focusedRegion(page).getByRole("button", { name: "完了" })).toBeVisible();
    await expect(page.getByRole("button", { name: "現在のタスクにする" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "現在解除" })).toHaveCount(0);
  });

  test("AC-5: キーボードのみ (Tab + Enter) で focus 設定が完結する", async ({ page, request }) => {
    const authHeader = await getApiAuthHeader(request, API_BASE);
    // 残骸タスクを掃除して Tab 手数を決定論的に小さく保つ (clearTodayTasks の docstring 参照).
    await clearTodayTasks(request, authHeader);
    await resetFocus(request, authHeader);
    const stamp = Date.now();
    const nameA = `AC5タスクA ${stamp}`;
    const nameB = `AC5タスクB ${stamp + 1}`;
    // E2E サーバは TEST_NOW の FakeClock (凍結時計) で動くため, 同一テスト内で
    // 作るタスクの createdAt は完全同値になり, 並び順 (priority → createdAt → id) の
    // tie-break がランダム UUID の id に落ちる. A・B を同 priority にすると
    // 「どちらが並び先頭 = 暗黙の現在のタスクか」が非決定的になり flaky.
    // → B を normal にすれば highest の A (または既存 highest タスク) が必ず
    //   並び先頭になり, B は決定論的に一覧側に来る.
    await createTask(request, authHeader, { name: nameA, priority: "highest" });
    const idB = await createTask(request, authHeader, { name: nameB, priority: "normal" });

    await gotoToday(page);
    await expect(listRow(page, nameB)).toBeVisible();

    // マウスを使わず Tab のみで B カードの「現在のタスクにする」button へ到達する.
    // (ネイティブ <button> なら Tab 到達可能なはず. 到達確認は activeElement で行う.
    //  locator の auto-wait を使うと red フェーズで毎回 30 秒待つため evaluate で判定する.)
    const MAX_TABS = 300;
    let reached = false;
    for (let i = 0; i < MAX_TABS; i++) {
      await page.keyboard.press("Tab");
      reached = await page.evaluate((targetName) => {
        const el = document.activeElement as HTMLElement | null;
        if (!el || el.tagName !== "BUTTON") return false;
        // BL-114 追従: button は Lucide アイコン + aria-label に置換されたため
        // accessibleName は aria-label 属性から取る.
        const accName = (el.getAttribute("aria-label") ?? el.textContent ?? "").trim();
        if (accName !== "現在のタスクにする") return false;
        // B のカード (listitem) 内の button であること.
        // BL-070 追従: name は input value に入るため textContent で判定できない.
        // closest li 内の input.value を観察する.
        const li = el.closest("li");
        if (!li) return false;
        const nameInput = li.querySelector('input[type="text"]') as HTMLInputElement | null;
        return nameInput?.value.includes(targetName) ?? false;
      }, nameB);
      if (reached) break;
    }
    expect(
      reached,
      `Tab を ${MAX_TABS} 回押しても B カードの「現在のタスクにする」button に到達できなかった`,
    ).toBe(true);

    // Enter で作動し PUT /api/v1/focus { taskId: B.id } が送信される.
    const putRequestPromise = page.waitForRequest(
      (req) => req.url().includes("/api/v1/focus") && req.method() === "PUT",
    );
    await page.keyboard.press("Enter");
    const putRequest = await putRequestPromise;
    expect(putRequest.postDataJSON()).toEqual({ taskId: idB });

    // 強調セクションに B が表示される.
    await expect(focusedRegion(page).getByLabel(`${nameB} の名前`)).toBeVisible();
  });

  test("AC-6: routine 由来タスクも focus に昇格できる", async ({ page, request }) => {
    const authHeader = await getApiAuthHeader(request, API_BASE);
    // テスト用 FakeClock (BL-030) で 24h 進めて日次リセットを発火させ,
    // origin="routine" のタスクを自動生成する (boundary-time.spec.ts のパターン).
    const ONE_DAY_MS = 24 * 60 * 60 * 1000;
    const clockRes = await request.get(`${API_BASE}/api/v1/test/clock`, {
      headers: authHeader,
    });
    const { now: nowIso } = (await clockRes.json()) as { now: string };
    const tomorrowDayOfWeek = new Date(new Date(nowIso).getTime() + ONE_DAY_MS).getUTCDay();

    const routineName = `AC6ルーティン ${Date.now()}`;
    const routineRes = await request.post(`${API_BASE}/api/v1/routines`, {
      headers: { ...authHeader, "Idempotency-Key": crypto.randomUUID() },
      data: {
        id: crypto.randomUUID(),
        name: routineName,
        daysOfWeek: [tomorrowDayOfWeek],
        // later にして暗黙フォールバック (並び先頭) に選ばれないようにする = 一覧側に来る.
        defaultPriority: "later",
      },
    });
    expect(routineRes.status()).toBe(201);

    // 強調対象候補のダミー (highest) を用意してから 24h 進め, /today でリセット発火.
    await createTask(request, authHeader, {
      name: `AC6ダミー ${Date.now()}`,
      priority: "highest",
    });
    const advanceRes = await request.post(`${API_BASE}/api/v1/test/clock/advance`, {
      headers: authHeader,
      data: { ms: ONE_DAY_MS },
    });
    expect(advanceRes.status()).toBe(200);
    const todayRes = await request.get(`${API_BASE}/api/v1/today`, {
      headers: authHeader,
    });
    expect(todayRes.status()).toBe(200);

    // 生成されたタスク R が origin="routine" であることをサーバ側で確認.
    const tasksRes = await request.get(`${API_BASE}/api/v1/tasks?trashed=false`, {
      headers: authHeader,
    });
    const tasksBody = (await tasksRes.json()) as {
      tasks: Array<{ id: string; name: string; dueDate: string; origin: string }>;
    };
    const routineTask = tasksBody.tasks.find(
      (t) => t.name === routineName && t.dueDate === "today",
    );
    expect(routineTask).toBeDefined();
    expect(routineTask?.origin).toBe("routine");

    await resetFocus(request, authHeader);
    await gotoToday(page);
    await expect(listRow(page, routineName)).toBeVisible();

    // R のカードの「現在のタスクにする」をクリック → 強調セクションに R が表示される.
    await listRow(page, routineName).getByRole("button", { name: "現在のタスクにする" }).click();
    await expect(focusedRegion(page).getByLabel(`${routineName} の名前`)).toBeVisible();

    // サーバ正本でも R が currentTaskId になっている.
    await expect
      .poll(async () => (await getFocus(request, authHeader)).currentTaskId)
      .toBe(routineTask?.id);
  });

  test("AC-7: tomorrow ビューには「現在のタスクにする」button が存在しない", async ({
    page,
    request,
  }) => {
    const authHeader = await getApiAuthHeader(request, API_BASE);
    const taskName = `AC7明日タスク ${Date.now()}`;
    await createTask(request, authHeader, { name: taskName, dueDate: "tomorrow" });

    await page.goto("/tomorrow");
    // BL-051 で旧 <section aria-label="明日のタスク"> ランドマークは <main> に統合された.
    // tomorrow-view の listitem を取るには role=main にスコープすればよい.
    // BL-070 追従: name は input value のため hasText では matches しない. aria-label 一致で filter.
    const row = page
      .getByRole("main")
      .getByRole("listitem")
      .filter({
        has: page.getByLabel(`${taskName} の名前`),
      });
    await expect(row).toBeVisible();

    // 画面全体に「現在のタスクにする」button が存在しない (spec REQ-5).
    await expect(page.getByRole("button", { name: "現在のタスクにする" })).toHaveCount(0);

    // カードのアクションは「削除 / 今日にする / 完了」のまま (BL-042 無改修).
    await expect(row.getByRole("button", { name: "削除" })).toBeVisible();
    await expect(row.getByRole("button", { name: "今日にする" })).toBeVisible();
    await expect(row.getByRole("button", { name: "完了" })).toBeVisible();
  });

  test("AC-8: 解除 UI は存在せず, 明示 focus 中タスクの完了で自動解除される", async ({
    page,
    request,
  }) => {
    const authHeader = await getApiAuthHeader(request, API_BASE);
    await resetFocus(request, authHeader);
    const stamp = Date.now();
    const nameA = `AC8タスクA ${stamp}`;
    const nameB = `AC8タスクB ${stamp + 1}`;
    await createTask(request, authHeader, { name: nameA, priority: "highest" });
    const idB = await createTask(request, authHeader, { name: nameB, priority: "later" });

    // B を UI から明示 focus に設定する.
    await gotoToday(page);
    await expect(listRow(page, nameB)).toBeVisible();
    await listRow(page, nameB).getByRole("button", { name: "現在のタスクにする" }).click();
    await expect(focusedRegion(page).getByLabel(`${nameB} の名前`)).toBeVisible();

    // /today に「現在解除」「現在に設定」(旧ラベル) の button は存在しない (spec REQ-4).
    await expect(page.getByRole("button", { name: "現在解除" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "現在に設定" })).toHaveCount(0);

    // /focus にも存在しない.
    await page.goto("/focus");
    await expect(focusedRegion(page).getByLabel(`${nameB} の名前`)).toBeVisible();
    await expect(page.getByRole("button", { name: "現在解除" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "現在に設定" })).toHaveCount(0);

    // /today に戻り, 強調セクションの B を「完了」する.
    await gotoToday(page);
    await expect(focusedRegion(page).getByLabel(`${nameB} の名前`)).toBeVisible();
    await focusedRegion(page).getByRole("button", { name: "完了" }).click();

    // サーバ側で FocusSelection.currentTaskId が null に自動解除される (FR-013).
    await expect.poll(async () => (await getFocus(request, authHeader)).currentTaskId).toBeNull();

    // 再フェッチ後, B は強調セクションから消え, 暗黙フォールバックにより
    // 並び先頭のタスクが強調セクションに表示される (他テストの残骸タスクが
    // 先頭になりうるため, 特定タスク名までは assert しない. focus-view.spec.ts の方針).
    await expect(focusedRegion(page).getByLabel(`${nameB} の名前`)).toHaveCount(0);
    await expect(focusedRegion(page)).toBeVisible();
    void idB;
  });

  test("AC-9: 412 失敗時は「通信に失敗しました」バナーが表示され, 再試行で成功する", async ({
    page,
    request,
  }) => {
    const authHeader = await getApiAuthHeader(request, API_BASE);
    await resetFocus(request, authHeader);
    const stamp = Date.now();
    const nameA = `AC9タスクA ${stamp}`;
    const nameB = `AC9タスクB ${stamp + 1}`;
    await createTask(request, authHeader, { name: nameA, priority: "highest" });
    const idB = await createTask(request, authHeader, { name: nameB, priority: "later" });

    // クライアントに FocusSelection (version v) をロードさせる.
    await gotoToday(page);
    await expect(listRow(page, nameB)).toBeVisible();

    // サーバ側で version を進めて, クライアントのキャッシュを stale にする
    // (多タブで focus が更新された状況の再現. 次の PUT は本物の 412 を返す).
    await putFocus(request, authHeader, null);

    // 失敗後の ["focus"] 再フェッチ (spec REQ-7 / plan D-005) を待ち受ける.
    const refetchPromise = page.waitForResponse(
      (res) =>
        res.url().includes("/api/v1/focus") &&
        res.request().method() === "GET" &&
        res.status() === 200,
    );
    const put412Promise = page.waitForResponse(
      (res) =>
        res.url().includes("/api/v1/focus") &&
        res.request().method() === "PUT" &&
        res.status() === 412,
    );

    await listRow(page, nameB).getByRole("button", { name: "現在のタスクにする" }).click();
    await put412Promise;

    // 「通信に失敗しました」のエラーバナーが表示される (BL-034).
    await expect(page.getByRole("alert", { name: "通信エラー通知" })).toBeVisible();
    await expect(page.getByText("通信に失敗しました")).toBeVisible();

    // 失敗時にも ["focus"] が再フェッチされ, 最新 version がロードされる.
    await refetchPromise;

    // 最新 version で再度「現在のタスクにする」を実行すると成功する.
    await listRow(page, nameB).getByRole("button", { name: "現在のタスクにする" }).click();
    await expect(focusedRegion(page).getByLabel(`${nameB} の名前`)).toBeVisible();
    await expect.poll(async () => (await getFocus(request, authHeader)).currentTaskId).toBe(idB);
  });
});
