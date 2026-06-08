/**
 * 結合テスト: 境界時刻の設定 API (BL-009 / FR-041 / FR-042 / NFR-012).
 *
 * 受け入れ基準の出典: docs/developer/features/settings-day-boundary/spec.md
 * 各 describe / it のタイトルに Gherkin シナリオ名を含めて trace 可能とする.
 *
 * 注意: 本ファイルは TDD の "red" を作るためのテスト.
 *       createApp() の GET/PATCH /api/v1/settings は未実装のため,
 *       このファイル内のテストはすべて失敗する想定.
 *       implementer がエンドポイントを実装することで green 化する.
 *
 * スコープ:
 *   - GET /api/v1/settings 正常系 / 認証
 *   - PATCH /api/v1/settings 正常系 / 境界値 / バリデーション異常系
 *   - 楽観ロック (If-Match / 412)
 *   - 冪等性 (Idempotency-Key 再送)
 *   - PATCH 後の GET で更新値が返ること
 */
import { beforeEach, describe, expect, it } from "vitest";
import type { Hono } from "hono";
import {
  authHeaders,
  buildTestApp,
  TEST_INITIAL_TIME,
} from "../helpers/build-test-app.js";
import type { InMemorySettingsRepository } from "../helpers/in-memory-repositories.js";

let app: Hono;
let settingsRepo: InMemorySettingsRepository;

beforeEach(() => {
  const built = buildTestApp();
  app = built.app;
  settingsRepo = built.settingsRepository;
});

// ============================================================
// GET /api/v1/settings (spec.md §「Settings の初期状態」)
// ============================================================

describe("GET /api/v1/settings", () => {
  it("シナリオ: 認証なしの GET /api/v1/settings は 401", async () => {
    // spec.md §「Settings の初期状態」§「認証なしの GET は 401」.
    const res = await app.request("/api/v1/settings", {
      method: "GET",
      headers: { "Content-Type": "application/json" },
    });
    expect(res.status).toBe(401);
  });

  it("シナリオ: 初回アクセス時の Settings は dayBoundaryTime = \"04:00\" で存在する", async () => {
    // spec.md §「Settings の初期状態」第 1 ケース.
    // Given サーバを起動した直後で Settings を一度も更新していない
    // When  GET /api/v1/settings を認証付きで呼ぶ
    // Then  200 OK で { settings: { id: "singleton", dayBoundaryTime: "04:00", version: 1, updatedAt: <ISO 8601> } } が返る
    const res = await app.request("/api/v1/settings", {
      method: "GET",
      headers: authHeaders(),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      settings: {
        id: string;
        dayBoundaryTime: string;
        version: number;
        updatedAt: string;
      };
    };
    expect(body.settings.id).toBe("singleton");
    expect(body.settings.dayBoundaryTime).toBe("04:00");
    expect(body.settings.version).toBe(1);
    expect(typeof body.settings.updatedAt).toBe("string");
  });
});

// ============================================================
// PATCH /api/v1/settings — 正常系 / 境界値 (spec.md §「境界時刻の更新」)
// ============================================================

describe("PATCH /api/v1/settings — 正常系", () => {
  it("シナリオ: dayBoundaryTime を有効な値 \"03:30\" に更新できる", async () => {
    // spec.md §「境界時刻の更新」第 1 ケース.
    // Given Settings が { dayBoundaryTime: "04:00", version: 1 } で存在する
    // When  PATCH /api/v1/settings に { dayBoundaryTime: "03:30" } を Idempotency-Key と If-Match: 1 で送る
    // Then  200 OK で { settings: { id: "singleton", dayBoundaryTime: "03:30", version: 2, updatedAt: <更新後の ISO 8601> } } が返る
    const res = await app.request("/api/v1/settings", {
      method: "PATCH",
      headers: authHeaders({
        "If-Match": "1",
        "Idempotency-Key": "settings-patch-03-30",
      }),
      body: JSON.stringify({ dayBoundaryTime: "03:30" }),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      settings: {
        id: string;
        dayBoundaryTime: string;
        version: number;
        updatedAt: string;
      };
    };
    expect(body.settings.dayBoundaryTime).toBe("03:30");
    expect(body.settings.version).toBe(2);
    expect(body.settings.id).toBe("singleton");
    expect(typeof body.settings.updatedAt).toBe("string");
  });

  it("シナリオ: dayBoundaryTime に \"00:00\" を設定できる (境界値: 最小)", async () => {
    // spec.md §「境界時刻の更新」§「dayBoundaryTime に \"00:00\" を設定できる」.
    // Given Settings が { version: 1 } で存在する
    // When  PATCH /api/v1/settings に { dayBoundaryTime: "00:00" } を送る
    // Then  200 OK で { settings: { dayBoundaryTime: "00:00", version: 2, ... } } が返る
    const res = await app.request("/api/v1/settings", {
      method: "PATCH",
      headers: authHeaders({
        "If-Match": "1",
        "Idempotency-Key": "settings-patch-00-00",
      }),
      body: JSON.stringify({ dayBoundaryTime: "00:00" }),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { settings: { dayBoundaryTime: string; version: number } };
    expect(body.settings.dayBoundaryTime).toBe("00:00");
    expect(body.settings.version).toBe(2);
  });

  it("シナリオ: dayBoundaryTime に \"23:59\" を設定できる (境界値: 最大)", async () => {
    // spec.md §「境界時刻の更新」§「dayBoundaryTime に \"23:59\" を設定できる」.
    // Given Settings が { version: 1 } で存在する
    // When  PATCH /api/v1/settings に { dayBoundaryTime: "23:59" } を送る
    // Then  200 OK で { settings: { dayBoundaryTime: "23:59", version: 2, ... } } が返る
    const res = await app.request("/api/v1/settings", {
      method: "PATCH",
      headers: authHeaders({
        "If-Match": "1",
        "Idempotency-Key": "settings-patch-23-59",
      }),
      body: JSON.stringify({ dayBoundaryTime: "23:59" }),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { settings: { dayBoundaryTime: string; version: number } };
    expect(body.settings.dayBoundaryTime).toBe("23:59");
    expect(body.settings.version).toBe(2);
  });
});

// ============================================================
// PATCH /api/v1/settings — バリデーション異常系 (spec.md §「バリデーション」)
// ============================================================

describe("PATCH /api/v1/settings — バリデーション", () => {
  it("シナリオ: HH:MM 形式に合わない \"4:00\" (1 桁の時) は 400 INVALID_DAY_BOUNDARY_TIME", async () => {
    // spec.md §「バリデーション」§「HH:MM 形式に合わない文字列は拒否される」.
    // When  PATCH /api/v1/settings に { dayBoundaryTime: "4:00" } を送る
    // Then  400 INVALID_DAY_BOUNDARY_TIME が返る
    const res = await app.request("/api/v1/settings", {
      method: "PATCH",
      headers: authHeaders({
        "If-Match": "1",
        "Idempotency-Key": "settings-patch-invalid-1digit",
      }),
      body: JSON.stringify({ dayBoundaryTime: "4:00" }),
    });

    expect(res.status).toBe(400);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe("INVALID_DAY_BOUNDARY_TIME");
  });

  it("シナリオ: 時が 24 以上の \"24:00\" は 400 INVALID_DAY_BOUNDARY_TIME", async () => {
    // spec.md §「バリデーション」§「時が 24 以上の値は拒否される」.
    // When  PATCH /api/v1/settings に { dayBoundaryTime: "24:00" } を送る
    // Then  400 INVALID_DAY_BOUNDARY_TIME が返る
    const res = await app.request("/api/v1/settings", {
      method: "PATCH",
      headers: authHeaders({
        "If-Match": "1",
        "Idempotency-Key": "settings-patch-invalid-24-00",
      }),
      body: JSON.stringify({ dayBoundaryTime: "24:00" }),
    });

    expect(res.status).toBe(400);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe("INVALID_DAY_BOUNDARY_TIME");
  });

  it("シナリオ: 分が 60 以上の \"12:60\" は 400 INVALID_DAY_BOUNDARY_TIME", async () => {
    // spec.md §「バリデーション」§「分が 60 以上の値は拒否される」.
    // When  PATCH /api/v1/settings に { dayBoundaryTime: "12:60" } を送る
    // Then  400 INVALID_DAY_BOUNDARY_TIME が返る
    const res = await app.request("/api/v1/settings", {
      method: "PATCH",
      headers: authHeaders({
        "If-Match": "1",
        "Idempotency-Key": "settings-patch-invalid-12-60",
      }),
      body: JSON.stringify({ dayBoundaryTime: "12:60" }),
    });

    expect(res.status).toBe(400);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe("INVALID_DAY_BOUNDARY_TIME");
  });

  it("シナリオ: dayBoundaryTime フィールドを省略した空ボディ {} は 400 INVALID_REQUEST_BODY", async () => {
    // spec.md §「バリデーション」§「dayBoundaryTime フィールドを省略した PATCH は拒否される」.
    // When  PATCH /api/v1/settings に {} を送る (空オブジェクト)
    // Then  400 INVALID_REQUEST_BODY が返る
    const res = await app.request("/api/v1/settings", {
      method: "PATCH",
      headers: authHeaders({
        "If-Match": "1",
        "Idempotency-Key": "settings-patch-empty-body",
      }),
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(400);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe("INVALID_REQUEST_BODY");
  });

  it("シナリオ: 認証なしの PATCH /api/v1/settings は 401", async () => {
    // spec.md §「バリデーション」§「認証なしの PATCH は 401」.
    // Given Authorization ヘッダを付けない
    // When  PATCH /api/v1/settings に { dayBoundaryTime: "05:00" } を送る
    // Then  401 UNAUTHORIZED が返る
    const res = await app.request("/api/v1/settings", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "If-Match": "1",
        "Idempotency-Key": "settings-patch-no-auth",
      },
      body: JSON.stringify({ dayBoundaryTime: "05:00" }),
    });

    expect(res.status).toBe(401);
  });
});

// ============================================================
// 楽観ロック (If-Match) (spec.md §「楽観ロック (If-Match)」)
// ============================================================

describe("PATCH /api/v1/settings — 楽観ロック", () => {
  it("シナリオ: version 不一致 (If-Match: 2、実際は 1) の PATCH は 412 を返し、レスポンスボディに { settings } を含む", async () => {
    // spec.md §「楽観ロック (If-Match)」§「version 不一致の PATCH は 412 を返す」.
    // Given Settings が { dayBoundaryTime: "04:00", version: 1 } で存在する
    // When  PATCH /api/v1/settings に { dayBoundaryTime: "05:00" } を If-Match: 2 で送る (実際の version は 1)
    // Then  412 Precondition Failed が返る
    // And   Settings の dayBoundaryTime は "04:00" のまま変わらない
    // And   レスポンスボディに { settings } が含まれる (D-004)
    const res = await app.request("/api/v1/settings", {
      method: "PATCH",
      headers: authHeaders({
        "If-Match": "2",
        "Idempotency-Key": "settings-patch-version-mismatch",
      }),
      body: JSON.stringify({ dayBoundaryTime: "05:00" }),
    });

    expect(res.status).toBe(412);

    // レスポンスボディに現在の settings が含まれる (D-004).
    const body = (await res.json()) as { settings?: { dayBoundaryTime: string; version: number } };
    expect(body.settings).toBeDefined();
    expect(body.settings?.dayBoundaryTime).toBe("04:00");
    expect(body.settings?.version).toBe(1);

    // リポジトリ側も変わっていない.
    expect(settingsRepo.current().dayBoundaryTime).toBe("04:00");
    expect(settingsRepo.current().version).toBe(1);
  });
});

// ============================================================
// If-Match ヘッダ省略 (spec.md §「楽観ロック (If-Match)」)
// ============================================================

describe("PATCH /api/v1/settings — If-Match ヘッダ省略", () => {
  it("シナリオ: If-Match ヘッダなしの PATCH /api/v1/settings は 400 MISSING_IF_MATCH", async () => {
    // spec.md §「楽観ロック (If-Match)」: If-Match ヘッダを省略した PATCH は拒否される.
    // Given Settings が { dayBoundaryTime: "04:00", version: 1 } で存在する
    // When  PATCH /api/v1/settings に If-Match ヘッダなしで { dayBoundaryTime: "05:00" } を送る
    // Then  400 MISSING_IF_MATCH が返る
    const res = await app.request("/api/v1/settings", {
      method: "PATCH",
      headers: authHeaders({
        "Idempotency-Key": "settings-patch-no-if-match",
        // If-Match を意図的に省略
      }),
      body: JSON.stringify({ dayBoundaryTime: "05:00" }),
    });

    expect(res.status).toBe(400);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe("MISSING_IF_MATCH");
  });
});

// ============================================================
// 冪等性 (Idempotency-Key) (spec.md §「冪等性 (Idempotency-Key)」)
// ============================================================

describe("PATCH /api/v1/settings — 冪等性", () => {
  it("シナリオ: 同じ Idempotency-Key で PATCH を 2 回送っても設定値は 1 回分だけ変わる", async () => {
    // spec.md §「冪等性 (Idempotency-Key)」§「同じ Idempotency-Key で PATCH を 2 回送っても設定値は 1 回分だけ変わる」.
    // Given Settings が { dayBoundaryTime: "04:00", version: 1 } で存在する
    // When  PATCH /api/v1/settings に { dayBoundaryTime: "05:00" } を Idempotency-Key: "k1", If-Match: 1 で送る
    // And   まったく同じヘッダ・ボディで再送する
    // Then  2 回目も 200 OK が返り, レスポンスボディは 1 回目と同じ
    // And   GET /api/v1/settings は { dayBoundaryTime: "05:00", version: 2 } を返す (= version は 2 に留まる)
    const headers = authHeaders({
      "If-Match": "1",
      "Idempotency-Key": "settings-idem-k1",
    });
    const body = JSON.stringify({ dayBoundaryTime: "05:00" });

    const res1 = await app.request("/api/v1/settings", {
      method: "PATCH",
      headers,
      body,
    });
    expect(res1.status).toBe(200);
    const body1 = await res1.json();

    const res2 = await app.request("/api/v1/settings", {
      method: "PATCH",
      headers,
      body,
    });
    expect(res2.status).toBe(200);
    const body2 = await res2.json();

    // 2 回目のレスポンスは 1 回目と同じ.
    expect(body2).toEqual(body1);

    // GET で確認: version は 2 に留まる (3 に進まない).
    const getRes = await app.request("/api/v1/settings", {
      method: "GET",
      headers: authHeaders(),
    });
    expect(getRes.status).toBe(200);
    const getBody = (await getRes.json()) as {
      settings: { dayBoundaryTime: string; version: number };
    };
    expect(getBody.settings.dayBoundaryTime).toBe("05:00");
    expect(getBody.settings.version).toBe(2);
  });
});

// ============================================================
// PATCH 後の GET で更新値が返る
// ============================================================

describe("PATCH 後の GET で更新値が返る", () => {
  it("シナリオ: PATCH で dayBoundaryTime を更新後、GET では更新後の値 (version: 2) が返る", async () => {
    // spec.md §「境界時刻の更新」: PATCH 成功後に GET で正本値が確認できること.
    // Given Settings が { dayBoundaryTime: "04:00", version: 1 } で存在する
    // When  PATCH /api/v1/settings に { dayBoundaryTime: "06:00" } を送る (成功)
    // And   GET /api/v1/settings を呼ぶ
    // Then  { dayBoundaryTime: "06:00", version: 2 } が返る
    const patchRes = await app.request("/api/v1/settings", {
      method: "PATCH",
      headers: authHeaders({
        "If-Match": "1",
        "Idempotency-Key": "settings-patch-then-get",
      }),
      body: JSON.stringify({ dayBoundaryTime: "06:00" }),
    });
    expect(patchRes.status).toBe(200);

    const getRes = await app.request("/api/v1/settings", {
      method: "GET",
      headers: authHeaders(),
    });
    expect(getRes.status).toBe(200);
    const body = (await getRes.json()) as {
      settings: { dayBoundaryTime: string; version: number };
    };
    expect(body.settings.dayBoundaryTime).toBe("06:00");
    expect(body.settings.version).toBe(2);
  });
});
