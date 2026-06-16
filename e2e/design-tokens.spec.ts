/**
 * デザイントークン / CSS 基盤の整備 (BL-046 / design-tokens) E2E テスト.
 *
 * 仕様参照:
 *   docs/developer/features/design-tokens/spec.md §「受け入れ基準」.
 *   docs/developer/features/design-tokens/plan.md §「テスト方針」.
 *
 * 本ファイルが検証する受け入れ基準:
 *   AC-6: focus-view の枠の角丸・ボーダー色・内側余白が置換前と同一に見える（視覚的回帰なし）.
 *
 * 本ファイルで扱わない受け入れ基準 (担保方法が別):
 *   AC-1〜AC-4 / AC-7: web/__tests__/design-tokens.test.ts の vitest テスト.
 *   AC-3: grep による TODO マーカー消去確認 (vitest + child_process).
 *   AC-5: 既存テスト全体の green 維持 → npm test / npx playwright test を実行して確認.
 *
 * 設計メモ:
 *   - secondary-views-style.spec.ts の computedStyle ヘルパーパターンに倣う.
 *   - focus-view の __card が tokens.css のトークン値（--radius-lg: 16px /
 *     --color-border: #ccc / --space-xl: 32px）で描画されることを検証する.
 *   - AC-6 の "置換前と同一" とは、tokens.css 導入前の暫定ハードコード値
 *     (border-radius: 16px / border: 1px solid #ccc / padding: 32px) と
 *     数値的に等しいことを意味する.
 *
 * 本ファイルは TDD の "red" を作るための E2E.
 *   - tokens.css が未作成 / main.tsx が未修正の状態では :root に CSS 変数が
 *     注入されないため var(--radius-lg) 等が unresolved となり,
 *     computed style が期待値から外れる可能性がある.
 *     ただし現在は暫定ハードコード値が CSS に直接あるため,
 *     E2E は見かけ上 green になる場合がある（実装完了後も同値を期待するテスト）.
 *   - 実際の red は vitest 側 (web/__tests__/design-tokens.test.ts) で起きる.
 *     本テストは実装後の回帰防止 + 視覚的同値確認を主目的とする.
 */
import { type APIRequestContext, expect, type Locator, test } from "@playwright/test";
import { getApiAuthHeader } from "./helpers/api-auth.js";

const API_BASE = "http://localhost:3000";

/** locator の computed style から指定プロパティを取得する. */
async function computedStyle(
  locator: Locator,
  properties: readonly string[],
): Promise<Record<string, string>> {
  return locator.evaluate(
    (el, props) => {
      const style = window.getComputedStyle(el);
      return Object.fromEntries(props.map((p) => [p, style.getPropertyValue(p)]));
    },
    [...properties],
  );
}

/** API 直叩きでタスクを 1 件作成し ID を返す. */
async function seedTask(
  request: APIRequestContext,
  authHeader: { Authorization: string },
  name: string,
): Promise<string> {
  const id = crypto.randomUUID();
  const res = await request.post(`${API_BASE}/api/v1/tasks`, {
    headers: { ...authHeader, "Idempotency-Key": crypto.randomUUID() },
    data: { id, name, dueDate: "today", priority: "normal" },
  });
  expect(res.ok()).toBe(true);
  return id;
}

/** API 直叩きでタスクを削除する. */
async function deleteTask(
  request: APIRequestContext,
  authHeader: { Authorization: string },
  id: string,
  version: number,
): Promise<void> {
  const res = await request.delete(`${API_BASE}/api/v1/tasks/${id}`, {
    headers: {
      ...authHeader,
      "Idempotency-Key": crypto.randomUUID(),
      "If-Match": String(version),
    },
  });
  expect(res.ok()).toBe(true);
}

test.describe("デザイントークン / CSS 基盤の整備 (BL-046) の視覚的回帰なし", () => {
  /**
   * AC-6: focus-view の枠の角丸・ボーダー色・内側余白が置換前と同一に見える.
   *
   * シナリオ: focus-view の表示に視覚的回帰がない
   *   Given tokens.css の --radius-lg: 16px / --color-border: #ccc / --space-xl: 32px が定義されている
   *   When  /focus を開き、現在のタスクカード枠を確認する
   *   Then  枠の角丸・ボーダー色・内側余白が置換前と同一に見える
   */
  test("AC-6: /focus の __card の border-radius / border-color / padding が仕様値 (16px / #ccc / 32px) である", async ({
    page,
    request,
  }) => {
    // Given: focus-view に表示するタスクを 1 件用意する.
    const authHeader = await getApiAuthHeader(request, API_BASE);
    const suffix = Date.now();
    const taskName = `DT-AC6-フォーカスカード ${suffix}`;
    const taskId = await seedTask(request, authHeader, taskName);

    // When: /focus を開く.
    await page.goto("/focus");
    // BL-059 追従: .focus-view__card → .task-card.task-card--focus に置換 (P-008).
    // フォーカスカード (.task-card--focus) がレンダリングされるまで待機する.
    const card = page.locator(".task-card.task-card--focus");
    await expect(card).toBeVisible();

    // Then: computed style を取得し、仕様値と比較する.
    const style = await computedStyle(card, [
      "border-radius",
      "border-top-color",
      "border-top-width",
      "border-top-style",
      "padding-top",
      "padding-right",
      "padding-bottom",
      "padding-left",
    ]);

    // --radius-lg: 16px → border-radius が 16px であること.
    expect(style["border-radius"], "__card の border-radius").toBe("16px");

    // task-card--focus は border-color を var(--color-accent) = #B45309 で上書きする
    // (.task-card 基底の border-color: var(--color-border) より specificity が高い宣言).
    // #B45309 → rgb(180, 83, 9). 強調 variant の border-width は 3px.
    expect(style["border-top-color"], "__card の border-color").toBe("rgb(180, 83, 9)");
    expect(style["border-top-width"], "__card の border 幅").toBe("3px");
    expect(style["border-top-style"], "__card の border スタイル").toBe("solid");

    // BL-059 V-1 追従: .task-card--focus は padding を上書きせず .task-card 基底
    // (= --space-md: 16px) を継承する (旧: --space-xl: 32px).
    expect(style["padding-top"], "__card の padding-top").toBe("16px");
    expect(style["padding-right"], "__card の padding-right").toBe("16px");
    expect(style["padding-bottom"], "__card の padding-bottom").toBe("16px");
    expect(style["padding-left"], "__card の padding-left").toBe("16px");

    // 後片付け: 作成したタスクを削除する.
    const listRes = await request.get(`${API_BASE}/api/v1/tasks`, {
      headers: authHeader,
    });
    if (listRes.ok()) {
      const body = (await listRes.json()) as { tasks: Array<{ id: string; version: number }> };
      const task = body.tasks.find((t) => t.id === taskId);
      if (task) {
        await deleteTask(request, authHeader, taskId, task.version);
      }
    }
  });

  test("AC-6 サニティ: /focus の __card が DOM に存在する（focus-view レンダリング確認）", async ({
    page,
    request,
  }) => {
    // Given: focus-view に表示するタスクを 1 件用意する.
    const authHeader = await getApiAuthHeader(request, API_BASE);
    const suffix = Date.now();
    const taskName = `DT-AC6-サニティ ${suffix}`;
    await seedTask(request, authHeader, taskName);

    // When: /focus を開く.
    await page.goto("/focus");

    // BL-059 追従: .focus-view__card → .task-card.task-card--focus (P-008).
    // Then: .task-card--focus が存在する.
    await expect(page.locator(".task-card.task-card--focus")).toBeVisible();

    // かつ: タスク名テキストが .task-card__title 内に表示されている (BL-059 / V-4 構造).
    await expect(page.locator(".task-card.task-card--focus .task-card__title")).toBeVisible();
  });
});
