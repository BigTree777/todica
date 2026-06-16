/**
 * today ヘッダの「＋プロジェクトの追加」ボタン撤去 E2E (BL-050 / remove-inline-project-create).
 *
 * 仕様参照:
 *   docs/developer/features/remove-inline-project-create/spec.md
 *   §「受け入れ基準」AC-1 / AC-2 / AC-3 / AC-4 / AC-5.
 *
 * 本ファイルは TDD の "red" を作るための E2E.
 *   - 現状の today-view にはヘッダ領域に「＋プロジェクトの追加」 button が存在し,
 *     ProjectCreateDialog がマウントされている.
 *   - 本 BL の test-designer フェーズで「ボタンが無いこと」「クリックしても dialog が
 *     出ないこと」を assert するので, 実装前は AC-1 / AC-2 / AC-9 相当の test が
 *     必ず fail する (= red).
 *   - implementer が today-view.tsx から button JSX / state / Dialog マウント /
 *     import 文の 4 箇所を削除すると green 化する.
 *
 * 既存 E2E (e2e/inline-project-create.spec.ts) は BL-044 で追加されたものだが,
 * 本 BL の spec U-1 / D-003 で「ファイル全体削除」を確定しており,
 * 実装フェーズで implementer が削除する. 本ファイルはその役割の置き換えではなく
 * 「撤去ゴール」を直接検証するための新規 E2E である.
 *
 * セットアップは inline-project-create.spec.ts の慣行に従い API 直叩きで行う.
 * プロジェクト名 / タスク名は `Date.now()` suffix で他テストと衝突させない.
 */
import { type APIRequestContext, expect, type Page, test } from "@playwright/test";

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

/** 全プロジェクトを API 直叩きで削除し, 「プロジェクト 0 件」の前提状態を作る. */
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

/**
 * 起票フォーム scope 内のプロジェクト選択 `<select>` (BL-065 / project-toggle-removal).
 *
 * 旧 BL-041 トグル button (`getByRole("button", { name: /プロジェクト/ })`) は撤去された.
 * 新 UI は visually-hidden `<label>プロジェクト</label>` + `<select>` のため
 * `getByLabel("プロジェクト")` で取得する. `<option>` ラベルは「プロジェクトなし」+ 各 project.name.
 */
function projectSelect(page: Page) {
  return page
    .getByRole("form", { name: /タスク起票フォーム|起票フォーム/ })
    .getByLabel("プロジェクト");
}

/** /today を開き, 起票フォームの描画完了まで待つ. */
async function gotoToday(page: Page): Promise<void> {
  await page.goto("/today");
  await expect(page.getByRole("form", { name: "タスク起票フォーム" })).toBeVisible();
}

/** ハンバーガーメニューを開いて「プロジェクト」リンクを押す → /projects 遷移. */
async function openProjectsViaHamburger(page: Page): Promise<void> {
  await page.getByRole("button", { name: "メニューを開く" }).click();
  await expect(page.getByRole("dialog", { name: "ナビゲーションメニュー" })).toBeVisible();
  await page.getByRole("link", { name: "プロジェクト" }).click();
  await expect(page).toHaveURL(/\/projects$/);
  await expect(page.getByRole("heading", { name: "プロジェクト" })).toBeVisible();
}

test.describe("remove-inline-project-create (BL-050) のシナリオ", () => {
  test("AC-1: /today に「＋プロジェクトの追加」 button が存在しない (count = 0)", async ({
    page,
  }) => {
    // spec.md AC-1:
    //   Given /today を開いた
    //   When  画面全体を観察する
    //   Then  アクセシブルネーム「＋プロジェクトの追加」の button が DOM 上に存在しない
    //
    // 現状: today-view ヘッダに当該 button が存在するため count=1 → fail (red).
    await gotoToday(page);
    await expect(page.getByRole("heading", { name: "今日" })).toBeVisible();

    await expect(page.getByRole("button", { name: "＋プロジェクトの追加" })).toHaveCount(0);
  });

  test("AC-1: today ヘッダの直接の子要素は h1 「今日」 と カウンタ <span> の 2 要素のみで, 順序は h1 → カウンタ", async ({
    page,
  }) => {
    // spec.md AC-1 (後段):
    //   ヘッダ (<header>) 内には <h1>今日</h1> と aria-label="今日の完了タスク数" の
    //   <span> の 2 要素のみが含まれる (順序: h1 → カウンタ).
    //
    // 現状: ヘッダ内には h1 / カウンタ <span> / button の 3 要素が存在するため
    // 子要素数の比較で fail (red).
    await gotoToday(page);
    await expect(page.getByRole("heading", { name: "今日" })).toBeVisible();

    const headerInfo = await page.evaluate(() => {
      const header = document.querySelector("header");
      if (!header) return null;
      return {
        childCount: header.children.length,
        firstTag: header.children[0]?.tagName ?? null,
        firstText: header.children[0]?.textContent ?? null,
        secondTag: header.children[1]?.tagName ?? null,
        secondAriaLabel: header.children[1]?.getAttribute("aria-label") ?? null,
        buttonCount: header.querySelectorAll("button").length,
      };
    });

    expect(headerInfo).not.toBeNull();
    expect(headerInfo!.childCount).toBe(2);
    expect(headerInfo!.firstTag).toBe("H1");
    expect(headerInfo!.firstText).toBe("今日");
    expect(headerInfo!.secondTag).toBe("SPAN");
    expect(headerInfo!.secondAriaLabel).toBe("今日の完了タスク数");
    expect(headerInfo!.buttonCount).toBe(0);
  });

  test("AC-2: today ヘッダ内のどの button をクリックしても 「プロジェクトの追加」 モーダルが開かず, URL は /today のまま", async ({
    page,
  }) => {
    // spec.md AC-2:
    //   Given /today を開いた
    //   When  ヘッダ内のすべての button をクリックする (現状想定では存在しない)
    //   Then  role="dialog" の要素 (アクセシブルネーム「プロジェクトの追加」) は表示されない
    //    かつ URL は /today のままである
    //
    // 現状: ヘッダ内には「＋プロジェクトの追加」 button が存在し,
    // クリックすると dialog が開く → fail (red).
    await gotoToday(page);
    await expect(page.getByRole("heading", { name: "今日" })).toBeVisible();

    // ヘッダ内に存在する button をすべて取得してクリックする.
    const headerButtonCount = await page.evaluate(
      () => document.querySelector("header")?.querySelectorAll("button").length ?? 0,
    );
    for (let i = 0; i < headerButtonCount; i++) {
      // 毎回最初の button をクリック (state により increment しないため i=0 でよい).
      await page.locator("header button").nth(i).click({ trial: false });
    }

    // 「プロジェクトの追加」モーダルは表示されない.
    await expect(page.getByRole("dialog", { name: "プロジェクトの追加" })).toHaveCount(0);

    // URL は /today のまま.
    await expect(page).toHaveURL(/\/today$/);
  });

  test("AC-3: ハンバーガー → /projects 経路でプロジェクトを作成できる (POST に Idempotency-Key 付き)", async ({
    page,
    request,
  }) => {
    // spec.md AC-3:
    //   Given /today を開いた かつ プロジェクトが 0 件登録されている
    //   When  ハンバーガーボタン (☰) を押してメニューを開き「プロジェクト」リンクを押す
    //   Then  /projects 画面が表示される
    //   When  「プロジェクト名」入力に「仕事」と入力し「追加」ボタンを押す
    //   Then  POST /api/v1/projects が body { name: "仕事" } と Idempotency-Key ヘッダ付きで
    //         呼ばれる かつ /projects の一覧に「仕事」が表示される
    //
    // 既存の hamburger-nav (BL-049) と project-crud (BL-016) の実装が green な前提で
    // 動作するため, 本 BL の実装変更とは独立して成立する (= 実装前から green になりうる).
    // ここでは「BL-050 が /projects 起点の経路を維持していること」を新規回帰ガードとして固定する.
    await clearProjects(request);
    const stamp = Date.now();
    const projectName = `仕事 ${stamp}`;

    await gotoToday(page);
    await openProjectsViaHamburger(page);

    // 作成フォームに入力して送信.
    const createForm = page.getByRole("form", { name: "プロジェクト作成フォーム" });
    await createForm.getByLabel("プロジェクト名").fill(projectName);

    const requestPromise = page.waitForRequest(
      (req) => req.url().includes("/api/v1/projects") && req.method() === "POST",
    );
    await createForm.getByRole("button", { name: "追加" }).click();

    const postRequest = await requestPromise;
    expect(postRequest.postDataJSON()).toMatchObject({ name: projectName });
    expect(postRequest.headers()["idempotency-key"]).toBeTruthy();

    // BL-070 追従: プロジェクト名は <input value={name}> に入る.
    await expect(page.locator(`.project-card input[value="${projectName}"]`)).toBeVisible();

    // サーバ正本にも反映.
    const projects = await listProjects(request);
    expect(projects.some((p) => p.name === projectName)).toBe(true);
  });

  test("AC-4: /projects で追加したプロジェクトは /today の <select> の option 群に「プロジェクトなし」とともに現れる", async ({
    page,
    request,
  }) => {
    // spec.md AC-4 (BL-065 / project-toggle-removal 追従):
    //   Given /projects から「個人」プロジェクトを 1 件作成した
    //   When  ハンバーガーメニューで /today に戻り起票フォームの <select> の option を列挙する
    //   Then  option 一覧に「個人」「プロジェクトなし」が含まれる
    //
    // 既存の ["projects"] キャッシュ共有 (BL-016) を BL-050 が壊さないことの回帰ガード.
    // 旧 BL-041 トグル巡回経路から BL-065 の <select> + <option> 一覧経路へ書き換えた.
    await clearProjects(request);
    const stamp = Date.now();
    const projectName = `個人 ${stamp}`;

    // /projects から作成.
    await page.goto("/projects");
    await expect(page.getByRole("heading", { name: "プロジェクト" })).toBeVisible();
    const createForm = page.getByRole("form", { name: "プロジェクト作成フォーム" });
    await createForm.getByLabel("プロジェクト名").fill(projectName);
    await createForm.getByRole("button", { name: "追加" }).click();
    // BL-070 追従: プロジェクト名は <input value={name}> に入る.
    await expect(page.locator(`.project-card input[value="${projectName}"]`)).toBeVisible();

    // ハンバーガー → /today に戻る.
    await page.getByRole("button", { name: "メニューを開く" }).click();
    await expect(page.getByRole("dialog", { name: "ナビゲーションメニュー" })).toBeVisible();
    await page.getByRole("link", { name: "今日のタスク" }).click();
    await expect(page).toHaveURL(/\/today$/);
    await expect(page.getByRole("form", { name: "タスク起票フォーム" })).toBeVisible();

    // <select> の option ラベルを列挙し「個人」と「プロジェクトなし」が含まれることを確認.
    const select = projectSelect(page);
    const optionLabels = await select.locator("option").allTextContents();
    expect(optionLabels.some((t) => t.trim().includes(projectName))).toBe(true);
    expect(optionLabels.some((t) => t.trim() === "プロジェクトなし")).toBe(true);
  });

  test("AC-9 (E2E 補強): /today に project-create-dialog の DOM ノードがマウントされていない", async ({
    page,
  }) => {
    // spec.md AC-9 (静的なソース grep 検証は単体 meta test 側で行う):
    //   today-view.tsx 上の ProjectCreateDialog マウントが消えていることを,
    //   E2E ランタイム側からは「DOM 上に project-create-dialog の root ノードが
    //   存在しないこと」で検証する.
    //
    // 現状: today-view.tsx は <ProjectCreateDialog open={false} ... /> を
    //   マウントしており, 当該 root 要素が DOM に存在しうる → fail (red).
    // 実装後: マウント JSX 削除で DOM に存在しなくなる → green.
    await gotoToday(page);
    await expect(page.getByRole("heading", { name: "今日" })).toBeVisible();

    // project-create-dialog の root 要素 (= .project-create-dialog) が存在しない.
    // (ProjectCreateDialog は open=true 時のみ可視化される実装だが,
    //  マウント JSX 自体が残っていると <dialog> ノードが render tree に存在する.)
    await expect(page.locator(".project-create-dialog")).toHaveCount(0);
  });
});
