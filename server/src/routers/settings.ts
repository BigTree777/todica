import { Hono } from "hono";
import { getSettings, updateDayBoundaryTime } from "../app/settings-usecases.js";
import type { AppDeps } from "../app.js";
import { saveAndReturn } from "./_shared.js";

export function settingsRouter(deps: AppDeps): Hono {
  const router = new Hono();
  // ---------- GET /api/v1/settings (BL-009 / FR-041 / FR-042) ----------
  // spec.md §「Settings の初期状態」: 認証必須 / 読取専用.
  router.get("/", async (c) => {
    const settings = await getSettings(deps);
    return c.json({ settings }, 200);
  });

  // ---------- PATCH /api/v1/settings (BL-009 / FR-041 / FR-042) ----------
  // spec.md §「境界時刻の更新」: Idempotency-Key 必須 / If-Match で楽観ロック.
  router.patch("/", async (c) => {
    // body バリデーション.
    let body: Record<string, unknown>;
    try {
      body = (await c.req.json()) as Record<string, unknown>;
    } catch {
      return saveAndReturn(c, deps, 400, {
        code: "INVALID_REQUEST_BODY",
        message: "request body must be valid JSON",
      });
    }

    if (!("dayBoundaryTime" in body)) {
      return saveAndReturn(c, deps, 400, {
        code: "INVALID_REQUEST_BODY",
        message: "dayBoundaryTime is required",
      });
    }

    const dayBoundaryTime = body.dayBoundaryTime;
    if (typeof dayBoundaryTime !== "string") {
      return saveAndReturn(c, deps, 400, {
        code: "INVALID_REQUEST_BODY",
        message: "dayBoundaryTime must be a string",
      });
    }

    // If-Match のパース (存在 / 数値検証はユースケースが現挙動の順序で行う).
    const ifMatchHeader = c.req.header("If-Match") ?? c.req.header("if-match");
    const ifMatchPresent = ifMatchHeader !== undefined;
    const parsedIfMatch =
      ifMatchHeader !== undefined ? Number.parseInt(ifMatchHeader, 10) : Number.NaN;
    const ifMatch = Number.isFinite(parsedIfMatch) ? parsedIfMatch : undefined;

    const result = await updateDayBoundaryTime(deps, { dayBoundaryTime, ifMatch, ifMatchPresent });
    if (result.kind === "invalid") {
      return saveAndReturn(c, deps, 400, { code: result.code, message: result.message });
    }
    if (result.kind === "conflict") {
      return saveAndReturn(c, deps, 412, { settings: result.current });
    }
    if (result.kind === "notFound") {
      return saveAndReturn(c, deps, 404, { code: result.code, message: result.message });
    }
    return saveAndReturn(c, deps, 200, { settings: result.value });
  });

  return router;
}
