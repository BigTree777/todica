/**
 * SettingsRepository インターフェース + HTTP 実装 (BL-009 / settings-day-boundary).
 *
 * 仕様参照:
 *   - docs/developer/features/settings-day-boundary/spec.md
 *   - docs/developer/features/settings-day-boundary/plan.md §「UI 設計」
 */

export interface Settings {
  id: string;
  dayBoundaryTime: string;
  version: number;
  updatedAt: string;
}

export interface PatchSettingsCommand {
  dayBoundaryTime: string;
  ifMatch: number;
}

export interface SettingsRepository {
  getSettings(): Promise<Settings>;
  patchSettings(cmd: PatchSettingsCommand): Promise<Settings>;
}

/** 412 (楽観ロック競合) 時にスローされるエラー. ボディから取得した最新 settings を保持する. */
export class PatchConflictError extends Error {
  constructor(public readonly settings: Settings) {
    super("Conflict: version mismatch");
  }
}

export class HttpSettingsRepository implements SettingsRepository {
  constructor(
    readonly baseUrl: string,
    readonly authToken: string,
  ) {}

  async getSettings(): Promise<Settings> {
    const res = await fetch(`${this.baseUrl}/api/v1/settings`, {
      headers: { Authorization: `Bearer ${this.authToken}` },
    });
    const json = (await res.json()) as { settings: Settings };
    return json.settings;
  }

  async patchSettings(cmd: PatchSettingsCommand): Promise<Settings> {
    const res = await fetch(`${this.baseUrl}/api/v1/settings`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${this.authToken}`,
        "Content-Type": "application/json",
        "Idempotency-Key": crypto.randomUUID(),
        "If-Match": String(cmd.ifMatch),
      },
      body: JSON.stringify({ dayBoundaryTime: cmd.dayBoundaryTime }),
    });
    if (res.status === 412) {
      const json = (await res.json()) as { settings: Settings };
      throw new PatchConflictError(json.settings);
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = (await res.json()) as { settings: Settings };
    return json.settings;
  }
}
