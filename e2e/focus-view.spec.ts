/**
 * 「現在のタスク」独立ビュー E2E (BL-037 / focus-view).
 *
 * 仕様参照:
 *   docs/developer/features/focus-view/spec.md §「受け入れ基準」.
 *   docs/developer/features/focus-view/plan.md §「E2E (Playwright)」.
 *
 * 本ファイルは TDD の "red" を作るための E2E.
 *   - 現状 `/focus` は `FocusViewPlaceholder` が割り当てられているだけで, 「削除」「完了」
 *     ボタンも無く, タスク名の大表示も行われない. よって以下のテストは全て失敗する.
 *   - implementer が web/src/ui/focus-view/focus-view.tsx を新設して main.tsx の Route element
 *     を差し替えることで green 化する.
 *
 * 注意:
 *   - 既存テストとの分離のため, タスク名は `Date.now()` suffix を含めて衝突しないようにする.
 *   - サーバ初期状態には既存テストの残骸が含まれうるため, 「次のタスク自動繰上げ」確認は
 *     「focus 対象が必ず本テスト由来のタスクに切り替わる」一義的な assertion ではなく,
 *     「サイドバーから /today に戻った際にゴミ箱送りされている」「ゴミ箱に入っている」
 *     方向 (= 確実に検証できる側) を主に確認する.
 */
import { type Page, expect, test } from "@playwright/test";

const API_BASE = "http://localhost:3000";
const AUTH_HEADER = { Authorization: "Bearer dev-token" };

/**
 * AppShell のハンバーガーメニューから「現在のタスク」リンクで /focus に遷移する.
 * BL-049 でサイドバーはハンバーガーボタン開閉式のオーバーレイメニューに変わったため,
 * リンクを click する前にハンバーガーボタンを押してメニュー (`role="dialog"`) を
 * 開く必要がある (閉状態の menu は viewport 外に隠れている).
 */
async function gotoFocusViaSidebar(page: Page): Promise<void> {
  await page.goto("/today");
  await page.getByRole("button", { name: "メニューを開く" }).click();
  const menu = page.getByRole("dialog", { name: "ナビゲーションメニュー" });
  await expect(menu).toBeVisible();
  await menu.getByRole("link", { name: "現在のタスク" }).click();
  await expect(page).toHaveURL(/\/focus$/);
}

/** focus-view のランドマーク (REQ-1 で <section aria-label="現在のタスク"> を期待). */
function focusRegion(page: Page) {
  return page.getByRole("region", { name: "現在のタスク" });
}

test.describe("focus-view (/focus) のシナリオ", () => {
  test("シナリオ K (REQ-1): 今日のタスクを起票すると, /focus でそのタスク名が大表示される", async ({
    page,
    request,
  }) => {
    // API 直叩きで今日のタスクを 1 件作成 (priority=highest にして並び先頭に来ることを保証).
    const taskName = `FOCUSビュー表示 ${Date.now()}`;
    const taskId = crypto.randomUUID();
    await request.post(`${API_BASE}/api/v1/tasks`, {
      headers: { ...AUTH_HEADER, "Idempotency-Key": crypto.randomUUID() },
      data: { id: taskId, name: taskName, priority: "highest" },
    });
    // 起票したタスクを明示的に「現在のタスク」として設定する.
    // (他テストが残した既存 task が並び先頭になっていると nextTaskId 経由のフォールバックが
    //  本テスト由来の task を選ばないため.)
    const focusGet = await request.get(`${API_BASE}/api/v1/focus`, {
      headers: AUTH_HEADER,
    });
    const focusBody = (await focusGet.json()) as {
      focus: { version: number };
    };
    await request.put(`${API_BASE}/api/v1/focus`, {
      headers: {
        ...AUTH_HEADER,
        "Idempotency-Key": crypto.randomUUID(),
        "If-Match": String(focusBody.focus.version),
      },
      data: { taskId },
    });

    await gotoFocusViaSidebar(page);

    // 見出し <h1>現在のタスク</h1> が描画されている (placeholder と新実装で共通の文言).
    await expect(page.getByRole("heading", { name: "現在のタスク", level: 1 })).toBeVisible();

    // BL-070 (inline-edit-all-cards) 追従: タスク名は <input value={name}> として描画される.
    // 「現在のタスク」ランドマーク内にタスク名 input が表示されている (= 大表示の枠の中).
    await expect(focusRegion(page).getByLabel(`${taskName} の名前`)).toHaveValue(taskName);

    // 下部に「削除」「完了」の 2 ボタンが置かれている (REQ-4).
    await expect(focusRegion(page).getByRole("button", { name: "完了" })).toBeVisible();
    await expect(focusRegion(page).getByRole("button", { name: "削除" })).toBeVisible();
  });

  test("シナリオ L (REQ-5): /focus で「完了」を押すと completionCount が +1 されゴミ箱に入る", async ({
    page,
    request,
  }) => {
    // 今日のタスクを 2 件 (current + next) 用意して current 側を完了させる.
    const currentName = `FOCUS完了 ${Date.now()}`;
    const nextName = `FOCUS次 ${Date.now() + 1}`;
    const currentId = crypto.randomUUID();
    const nextId = crypto.randomUUID();
    await request.post(`${API_BASE}/api/v1/tasks`, {
      headers: { ...AUTH_HEADER, "Idempotency-Key": crypto.randomUUID() },
      data: { id: currentId, name: currentName, priority: "highest" },
    });
    await request.post(`${API_BASE}/api/v1/tasks`, {
      headers: { ...AUTH_HEADER, "Idempotency-Key": crypto.randomUUID() },
      data: { id: nextId, name: nextName, priority: "normal" },
    });
    // current を明示 focus に.
    const focusGet = await request.get(`${API_BASE}/api/v1/focus`, {
      headers: AUTH_HEADER,
    });
    const focusBody = (await focusGet.json()) as { focus: { version: number } };
    await request.put(`${API_BASE}/api/v1/focus`, {
      headers: {
        ...AUTH_HEADER,
        "Idempotency-Key": crypto.randomUUID(),
        "If-Match": String(focusBody.focus.version),
      },
      data: { taskId: currentId },
    });

    // 完了前の counter を控える.
    const counterBefore = await request.get(`${API_BASE}/api/v1/counter`, {
      headers: AUTH_HEADER,
    });
    const counterBeforeBody = (await counterBefore.json()) as {
      counter: { completedCount: number };
    };
    const before = counterBeforeBody.counter.completedCount;

    await gotoFocusViaSidebar(page);

    // BL-070 追従: current タスク名は input value に表示される.
    await expect(focusRegion(page).getByLabel(`${currentName} の名前`)).toHaveValue(currentName);

    // 「完了」を押す.
    await focusRegion(page).getByRole("button", { name: "完了" }).click();

    // BL-070 追従: current タスク名が focus 枠から消える (= 同じ aria-label の input が存在しない).
    await expect(focusRegion(page).getByLabel(`${currentName} の名前`)).toHaveCount(0);

    // 注: ファイル冒頭コメントの方針に従い「次のタスクが繰り上がる」具体的タスク名
    // までは assert しない. 既存テストの残骸タスクが priority=highest で残っていると
    // nextTaskId フォールバックが本テスト由来でない task を指しうるため.
    // 確実に検証できる「サーバ側のゴミ箱反映」「counter +1」のみを下で確認する.
    void nextName;

    // サーバ side: completionCount が +1 されている.
    await expect
      .poll(async () => {
        const r = await request.get(`${API_BASE}/api/v1/counter`, {
          headers: AUTH_HEADER,
        });
        const b = (await r.json()) as { counter: { completedCount: number } };
        return b.counter.completedCount;
      })
      .toBe(before + 1);

    // サーバ side: current task が trashed (= completed) 扱いになっている.
    const trashed = await request.get(`${API_BASE}/api/v1/tasks?trashed=true`, {
      headers: AUTH_HEADER,
    });
    const trashedBody = (await trashed.json()) as {
      tasks: Array<{ id: string; trashedReason: string }>;
    };
    const completedEntry = trashedBody.tasks.find((t) => t.id === currentId);
    expect(completedEntry).toBeDefined();
    expect(completedEntry?.trashedReason).toBe("completed");
  });

  test("シナリオ M (REQ-6): /focus で「削除」を押すと counter は変わらずゴミ箱に入る", async ({
    page,
    request,
  }) => {
    const currentName = `FOCUS削除 ${Date.now()}`;
    const nextName = `FOCUS削除次 ${Date.now() + 1}`;
    const currentId = crypto.randomUUID();
    const nextId = crypto.randomUUID();
    await request.post(`${API_BASE}/api/v1/tasks`, {
      headers: { ...AUTH_HEADER, "Idempotency-Key": crypto.randomUUID() },
      data: { id: currentId, name: currentName, priority: "highest" },
    });
    await request.post(`${API_BASE}/api/v1/tasks`, {
      headers: { ...AUTH_HEADER, "Idempotency-Key": crypto.randomUUID() },
      data: { id: nextId, name: nextName, priority: "normal" },
    });
    // current を明示 focus に.
    const focusGet = await request.get(`${API_BASE}/api/v1/focus`, {
      headers: AUTH_HEADER,
    });
    const focusBody = (await focusGet.json()) as { focus: { version: number } };
    await request.put(`${API_BASE}/api/v1/focus`, {
      headers: {
        ...AUTH_HEADER,
        "Idempotency-Key": crypto.randomUUID(),
        "If-Match": String(focusBody.focus.version),
      },
      data: { taskId: currentId },
    });

    // 削除前の counter.
    const counterBefore = await request.get(`${API_BASE}/api/v1/counter`, {
      headers: AUTH_HEADER,
    });
    const counterBeforeBody = (await counterBefore.json()) as {
      counter: { completedCount: number };
    };
    const before = counterBeforeBody.counter.completedCount;

    await gotoFocusViaSidebar(page);

    // BL-070 追従: current が input value として大表示されている.
    await expect(focusRegion(page).getByLabel(`${currentName} の名前`)).toHaveValue(currentName);

    // 「削除」を押す.
    await focusRegion(page).getByRole("button", { name: "削除" }).click();

    // BL-070 追従: current が focus 枠から消える.
    await expect(focusRegion(page).getByLabel(`${currentName} の名前`)).toHaveCount(0);

    // 注: ファイル冒頭コメントの方針に従い「次のタスクが繰り上がる」具体的タスク名
    // までは assert しない. 既存テストの残骸タスクが priority=highest で残っていると
    // nextTaskId フォールバックが本テスト由来でない task を指しうるため.
    // 確実に検証できる「サーバ側のゴミ箱反映」「counter 据置」のみを下で確認する.
    void nextName;

    // サーバ side: completionCount は加算されない (BL-012).
    // 削除が反映されるまで少し待ってから counter を 1 回読む (poll で安定性を上げる).
    await expect
      .poll(async () => {
        const r = await request.get(`${API_BASE}/api/v1/counter`, {
          headers: AUTH_HEADER,
        });
        const b = (await r.json()) as { counter: { completedCount: number } };
        return b.counter.completedCount;
      })
      .toBe(before);

    // サーバ side: current task が trashedReason = "deleted" 扱い.
    const trashed = await request.get(`${API_BASE}/api/v1/tasks?trashed=true`, {
      headers: AUTH_HEADER,
    });
    const trashedBody = (await trashed.json()) as {
      tasks: Array<{ id: string; trashedReason: string }>;
    };
    const deletedEntry = trashedBody.tasks.find((t) => t.id === currentId);
    expect(deletedEntry).toBeDefined();
    expect(deletedEntry?.trashedReason).toBe("deleted");
  });
});
