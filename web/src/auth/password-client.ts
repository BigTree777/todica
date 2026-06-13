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
