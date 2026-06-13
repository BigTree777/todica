export class NetworkError extends Error {
  constructor(message = "Network error") {
    super(message);
    this.name = "NetworkError";
  }
}

export interface AuthState {
  initialized: boolean;
}

export async function fetchAuthState(baseUrl: string): Promise<AuthState> {
  let response: Response;
  try {
    response = await fetch(`${baseUrl}/api/v1/auth-state`, { method: "GET" });
  } catch (error) {
    throw new NetworkError(error instanceof Error ? error.message : undefined);
  }

  if (!response.ok) {
    throw new Error(`Auth state request failed: HTTP ${response.status}`);
  }

  const body = (await response.json()) as { initialized?: unknown };
  if (typeof body.initialized !== "boolean") {
    throw new Error("Auth state response missing initialized");
  }
  return { initialized: body.initialized };
}
