/**
 * `POST /api/v1/login` / `POST /api/v1/logout` クライアント (BL-074 / plan §「Web モジュール」).
 *
 * - login: 200 → `{ token, expiresAt }`, 401 → `InvalidPasswordError`, network → `NetworkError`, その他 → `Error`.
 * - logout: 4xx/5xx でも throw せず resolve する (token 破棄の後始末は呼出元で行う).
 */

export class InvalidPasswordError extends Error {
  constructor() {
    super("Invalid password");
    this.name = "InvalidPasswordError";
  }
}

export class NetworkError extends Error {
  constructor(message = "Network error") {
    super(message);
    this.name = "NetworkError";
  }
}

export interface LoginResponse {
  token: string;
  expiresAt: number;
}

export async function login(baseUrl: string, password: string): Promise<LoginResponse> {
  let res: Response;
  try {
    res = await fetch(`${baseUrl}/api/v1/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
  } catch (err) {
    throw new NetworkError(err instanceof Error ? err.message : undefined);
  }
  if (res.status === 401) {
    throw new InvalidPasswordError();
  }
  if (!res.ok) {
    throw new Error(`Login failed: HTTP ${res.status}`);
  }
  const body = (await res.json()) as { token?: unknown; expiresAt?: unknown };
  if (typeof body.token !== "string" || typeof body.expiresAt !== "number") {
    throw new Error("Login response missing token or expiresAt");
  }
  return { token: body.token, expiresAt: body.expiresAt };
}

export async function logout(baseUrl: string, token: string): Promise<void> {
  try {
    await fetch(`${baseUrl}/api/v1/logout`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch {
    /* 401 / network エラーでも throw しない (後始末は呼出元の責務) */
  }
}
