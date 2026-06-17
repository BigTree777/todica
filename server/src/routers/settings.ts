import { validateDayBoundaryTime } from "@todica/domain/settings";
import { Hono } from "hono";
import type { AppDeps } from "../app.js";
import { saveAndReturn } from "./_shared.js";

export function settingsRouter(deps: AppDeps): Hono {
  const router = new Hono();
  // ---------- GET /api/v1/settings (BL-009 / FR-041 / FR-042) ----------
  // spec.md §「Settings の初期状態」: 認証必須 / 読取専用.
  // settingsRepository.get() の戻り値をそのまま 200 OK で返す.
  router.get("/", async (c) => {
    const settings = await deps.settingsRepository.get();
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

    // dayBoundaryTime 形式バリデーション (domain/settings の純関数).
    if (!validateDayBoundaryTime(dayBoundaryTime)) {
      return saveAndReturn(c, deps, 400, {
        code: "INVALID_DAY_BOUNDARY_TIME",
        message: "dayBoundaryTime must be in HH:MM format (00:00 - 23:59)",
      });
    }

    // If-Match 検証.
    const ifMatchHeader = c.req.header("If-Match") ?? c.req.header("if-match");
    if (!ifMatchHeader) {
      return saveAndReturn(c, deps, 400, {
        code: "MISSING_IF_MATCH",
        message: "If-Match header is required",
      });
    }
    const ifMatch = Number.parseInt(ifMatchHeader, 10);
    if (!Number.isFinite(ifMatch)) {
      return saveAndReturn(c, deps, 400, {
        code: "MISSING_IF_MATCH",
        message: "If-Match header must be a numeric version",
      });
    }

    // 楽観ロック.
    const current = await deps.settingsRepository.get();
    if (current.version !== ifMatch) {
      return saveAndReturn(c, deps, 412, { settings: current });
    }

    const updated = {
      ...current,
      dayBoundaryTime,
      version: current.version + 1,
      updatedAt: deps.clock.now(),
    };
    await deps.settingsRepository.update(updated);
    return saveAndReturn(c, deps, 200, { settings: updated });
  });

  return router;
}
