import { Hono } from "hono";
import type { AppDeps } from "../app.js";

export function counterRouter(deps: AppDeps): Hono {
  const router = new Hono();
  // ---------- GET /api/v1/counter (BL-008 / FR-040) ----------
  // spec.md §「Counter の初期状態」: 認証必須 / 読取専用 (If-Match / Idempotency-Key 不要).
  // counter-repository.get() の戻り値をそのまま 200 OK で返す.
  router.get("/", async (c) => {
    const counter = await deps.counterRepository.get();
    return c.json({ counter }, 200);
  });

  return router;
}
