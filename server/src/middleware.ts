import type { MiddlewareHandler } from "hono";
import type { AppDeps } from "./app.js";
import { errorJson } from "./routers/_shared.js";

const WRITE_METHODS = new Set(["POST", "PATCH", "PUT", "DELETE"]);

export function authMiddleware(deps: AppDeps): MiddlewareHandler {
  return async (c, next) => {
    if (!c.req.path.startsWith("/api/")) {
      await next();
      return;
    }
    if (c.req.path === "/api/v1/login" || c.req.path === "/api/v1/auth-state") {
      await next();
      return;
    }
    if (c.req.path === "/api/v1/password" && (await deps.passwordRepository.getHash()) === null) {
      await next();
      return;
    }
    const header = c.req.header("Authorization") ?? c.req.header("authorization");
    if (!header) {
      return errorJson(c, 401, "UNAUTHORIZED", "Authorization header missing");
    }
    const match = /^Bearer\s+(.+)$/i.exec(header);
    if (!match) {
      return errorJson(c, 401, "UNAUTHORIZED", "Invalid Bearer token");
    }
    const token = match[1] as string;
    const nowMs = new Date(deps.clock.now()).getTime();
    const session = await deps.sessionRepository.findValidByToken(token, nowMs);
    if (!session) {
      return errorJson(c, 401, "UNAUTHORIZED", "Invalid Bearer token");
    }
    await next();
  };
}

export function idempotencyMiddleware(deps: AppDeps): MiddlewareHandler {
  return async (c, next) => {
    if (!WRITE_METHODS.has(c.req.method) || !c.req.path.startsWith("/api/")) {
      await next();
      return;
    }
    if (c.req.path.startsWith("/api/v1/test/")) {
      await next();
      return;
    }
    if (
      c.req.path === "/api/v1/login" ||
      c.req.path === "/api/v1/logout" ||
      c.req.path === "/api/v1/password"
    ) {
      await next();
      return;
    }
    const key = c.req.header("Idempotency-Key") ?? c.req.header("idempotency-key");
    if (!key) {
      return errorJson(c, 400, "MISSING_IDEMPOTENCY_KEY", "Idempotency-Key header is required");
    }
    const saved = await deps.idempotencyStore.get(key);
    if (saved) {
      if (saved.status === 204) {
        return c.body(null, 204);
      }
      return c.json(saved.body, saved.status as 200 | 201 | 400 | 401 | 404 | 412);
    }
    c.set("idempotencyKey", key);
    await next();
  };
}
