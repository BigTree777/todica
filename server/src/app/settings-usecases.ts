/**
 * 設定のユースケース (BL-009 / FR-041 / FR-042).
 *
 * updateDayBoundaryTime は境界時刻検証 + 楽観ロック + 更新オブジェクト組み立て
 * (version+1 / updatedAt) を所管する.
 */
import type { Settings } from "@todica/domain/settings";
import { validateDayBoundaryTime } from "@todica/domain/settings";
import type { AppDeps } from "../app.js";
import type { UsecaseResult } from "./result.js";

/** 設定を取得する. */
export async function getSettings(deps: AppDeps): Promise<Settings> {
  return deps.settingsRepository.get();
}

export interface UpdateDayBoundaryTimeInput {
  dayBoundaryTime: string;
  /** If-Match ヘッダのパース結果. 未指定 / 非数値は undefined. */
  ifMatch: number | undefined;
  /** If-Match ヘッダが存在したか. */
  ifMatchPresent: boolean;
}

/**
 * 境界時刻を更新する.
 *   - validateDayBoundaryTime で形式検証 (現挙動: If-Match 検証より先).
 *   - If-Match の存在 / 数値検証.
 *   - 楽観ロック (version 不一致なら conflict).
 *   - version+1 / updatedAt を組み立てて update.
 */
export async function updateDayBoundaryTime(
  deps: AppDeps,
  input: UpdateDayBoundaryTimeInput,
): Promise<UsecaseResult<Settings>> {
  if (!validateDayBoundaryTime(input.dayBoundaryTime)) {
    return {
      kind: "invalid",
      code: "INVALID_DAY_BOUNDARY_TIME",
      message: "dayBoundaryTime must be in HH:MM format (00:00 - 23:59)",
    };
  }

  if (!input.ifMatchPresent) {
    return { kind: "invalid", code: "MISSING_IF_MATCH", message: "If-Match header is required" };
  }
  if (input.ifMatch === undefined) {
    return {
      kind: "invalid",
      code: "MISSING_IF_MATCH",
      message: "If-Match header must be a numeric version",
    };
  }

  const current = await deps.settingsRepository.get();
  if (current.version !== input.ifMatch) {
    return { kind: "conflict", current };
  }

  const updated: Settings = {
    ...current,
    dayBoundaryTime: input.dayBoundaryTime,
    version: current.version + 1,
    updatedAt: deps.clock.now(),
  };
  await deps.settingsRepository.update(updated);
  return { kind: "ok", value: updated };
}
