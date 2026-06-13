export class InvalidPasswordError extends Error {
  constructor() {
    super("Invalid password");
    this.name = "InvalidPasswordError";
  }
}

export class BadRequestError extends Error {
  constructor() {
    super("Invalid request");
    this.name = "BadRequestError";
  }
}

export class NetworkError extends Error {
  constructor(message = "Network error") {
    super(message);
    this.name = "NetworkError";
  }
}

export interface InitialPasswordResult {
  token: string;
  expiresAt: number;
}

export async function setupInitialPassword(
  baseUrl: string,
  newPassword: string,
): Promise<InitialPasswordResult> {
  let response: Response;
  try {
    response = await fetch(`${baseUrl}/api/v1/password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ newPassword }),
    });
  } catch (error) {
    throw new NetworkError(error instanceof Error ? error.message : undefined);
  }

  if (response.status === 400) {
    throw new BadRequestError();
  }
  if (!response.ok) {
    throw new Error(`Initial password setup failed: HTTP ${response.status}`);
  }

  const body = (await response.json()) as { token?: unknown; expiresAt?: unknown };
  if (typeof body.token !== "string" || typeof body.expiresAt !== "number") {
    throw new Error("Initial password response missing token or expiresAt");
  }
  return { token: body.token, expiresAt: body.expiresAt };
}

export async function changePassword(
  baseUrl: string,
  token: string,
  currentPassword: string,
  newPassword: string,
): Promise<void> {
  let response: Response;
  try {
    response = await fetch(`${baseUrl}/api/v1/password`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ currentPassword, newPassword }),
    });
  } catch (error) {
    throw new NetworkError(error instanceof Error ? error.message : undefined);
  }

  if (response.status === 401) {
    throw new InvalidPasswordError();
  }
  if (response.status === 400) {
    throw new BadRequestError();
  }
  if (!response.ok) {
    throw new Error(`Password change failed: HTTP ${response.status}`);
  }
}
