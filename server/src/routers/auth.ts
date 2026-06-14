import { randomBytes } from "node:crypto";
import bcrypt from "bcrypt";
import { Hono } from "hono";
import type { AppDeps } from "../app.js";
import { errorJson } from "./_shared.js";

export function authRouter(deps: AppDeps): Hono {
  const router = new Hono();
  // ---------- GET /api/v1/auth-state ----------
  router.get("/auth-state", async (c) => {
    try {
      return c.json({ initialized: (await deps.passwordRepository.getHash()) !== null }, 200);
    } catch {
      return errorJson(c, 500, "INTERNAL_ERROR", "failed to read authentication state");
    }
  });

  // ---------- POST /api/v1/login ----------
  // plan.md §「処理フロー — ログイン」/ D-2 / D-6 / D-14:
  //   1. body = { password: string }. 不正なら 400.
  //   2. DB の現在ハッシュと照合し, 不一致なら 401 INVALID_PASSWORD.
  //   3. token = randomBytes(32).toString("hex"). expiresAt = clock.now() + 30 日.
  //   4. sessionRepository.create({ token, expiresAt, createdAt }).
  //   5. 200 OK { token, expiresAt }.
  const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
  router.post("/login", async (c) => {
    const passwordHash = await deps.passwordRepository.getHash();
    if (passwordHash === null) {
      return errorJson(c, 412, "INITIAL_SETUP_REQUIRED", "initial password setup is required");
    }

    let body: Record<string, unknown>;
    try {
      body = (await c.req.json()) as Record<string, unknown>;
    } catch {
      return errorJson(c, 400, "INVALID_REQUEST_BODY", "request body must be valid JSON");
    }
    const password = body.password;
    if (typeof password !== "string" || password.length === 0) {
      return errorJson(c, 400, "INVALID_REQUEST_BODY", "password must be a non-empty string");
    }
    let match: boolean;
    try {
      match = await bcrypt.compare(password, passwordHash);
    } catch {
      return errorJson(c, 500, "INTERNAL_ERROR", "password verification failed");
    }
    if (!match) {
      return errorJson(c, 401, "INVALID_PASSWORD", "password is incorrect");
    }
    const token = randomBytes(32).toString("hex");
    const nowMs = new Date(deps.clock.now()).getTime();
    const expiresAt = nowMs + THIRTY_DAYS_MS;
    await deps.sessionRepository.create({ token, expiresAt, createdAt: nowMs });
    return c.json({ token, expiresAt }, 200);
  });

  router.post("/password", async (c) => {
    let currentHash: string | null;
    try {
      currentHash = await deps.passwordRepository.getHash();
    } catch {
      return errorJson(c, 500, "INTERNAL_ERROR", "password change failed");
    }

    let body: Record<string, unknown>;
    try {
      body = (await c.req.json()) as Record<string, unknown>;
    } catch {
      return errorJson(c, 400, "INVALID_REQUEST_BODY", "request body must be valid JSON");
    }

    const currentPassword = body.currentPassword;
    const newPassword = body.newPassword;
    if (typeof newPassword !== "string" || newPassword.length === 0) {
      return errorJson(c, 400, "INVALID_REQUEST_BODY", "newPassword must be a non-empty string");
    }

    if (
      currentHash !== null &&
      (typeof currentPassword !== "string" || currentPassword.length === 0)
    ) {
      return errorJson(
        c,
        400,
        "INVALID_REQUEST_BODY",
        "currentPassword and newPassword must be non-empty strings",
      );
    }

    try {
      if (currentHash === null) {
        const nowMs = new Date(deps.clock.now()).getTime();
        const newHash = bcrypt.hashSync(newPassword, 12);
        await deps.passwordRepository.setHash(newHash, nowMs);

        const token = randomBytes(32).toString("hex");
        const expiresAt = nowMs + THIRTY_DAYS_MS;
        await deps.sessionRepository.create({ token, expiresAt, createdAt: nowMs });
        return c.json({ token, expiresAt }, 200);
      }
      if (!(await bcrypt.compare(currentPassword as string, currentHash))) {
        return errorJson(c, 401, "INVALID_PASSWORD", "password is incorrect");
      }

      // 個人運用前提のため、200ms 以内のブロッキングを許容して同期 hash を使う.
      const newHash = bcrypt.hashSync(newPassword, 12);
      await deps.passwordRepository.setHash(newHash, new Date(deps.clock.now()).getTime());
      await deps.sessionRepository.deleteAll();
      return c.json({}, 200);
    } catch {
      return errorJson(c, 500, "INTERNAL_ERROR", "password change failed");
    }
  });

  // ---------- POST /api/v1/logout ----------
  // plan.md §「処理フロー — ログアウト」: 有効な session でないと到達しない (authMiddleware が 401).
  // 通過時は Authorization から token を抽出し sessions から DELETE して 204 を返す.
  router.post("/logout", async (c) => {
    const header = c.req.header("Authorization") ?? c.req.header("authorization");
    if (header) {
      const match = /^Bearer\s+(.+)$/i.exec(header);
      if (match) {
        await deps.sessionRepository.deleteByToken(match[1] as string);
      }
    }
    return c.body(null, 204);
  });
  return router;
}
