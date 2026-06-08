/**
 * Project ドメイン (BL-016 / project-crud).
 *
 * 仕様参照: docs/developer/features/project-crud/spec.md
 */
import type { Clock } from "../clock/index.js";

/** Project エンティティ. */
export interface Project {
  id: string;
  name: string;
  version: number;
  createdAt: string;
  updatedAt: string;
}

const MAX_NAME_LENGTH = 200;

/**
 * 制御文字判定 (C0: U+0000-U+001F と DEL: U+007F).
 */
function containsControlChar(value: string): boolean {
  for (const ch of value) {
    const code = ch.codePointAt(0);
    if (code === undefined) continue;
    if (code <= 0x1f || code === 0x7f) return true;
  }
  return false;
}

/**
 * プロジェクト名のバリデーション.
 *
 * - null / undefined → INVALID_PROJECT_NAME
 * - 空文字 → INVALID_PROJECT_NAME
 * - 200 文字超 → INVALID_PROJECT_NAME
 * - 制御文字を含む → INVALID_PROJECT_NAME
 * - 正常値 → null
 */
export function validateProjectName(name: unknown): "INVALID_PROJECT_NAME" | null {
  if (name === null || name === undefined) {
    return "INVALID_PROJECT_NAME";
  }
  if (typeof name !== "string") {
    return "INVALID_PROJECT_NAME";
  }
  if (name.length < 1) {
    return "INVALID_PROJECT_NAME";
  }
  if (name.length > MAX_NAME_LENGTH) {
    return "INVALID_PROJECT_NAME";
  }
  if (containsControlChar(name)) {
    return "INVALID_PROJECT_NAME";
  }
  return null;
}

/**
 * プロジェクト起票. バリデーション後 version=1, createdAt=updatedAt=clock.now() を返す.
 * バリデーションエラー時は例外をスローする代わりにエラーコードを throw する.
 */
export function createProject(id: string, name: string, clock: Clock): Project {
  const now = clock.now();
  return {
    id,
    name,
    version: 1,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * プロジェクト名称変更. バリデーション後 version+1, updatedAt 更新. createdAt は不変.
 */
export function updateProject(current: Project, name: string, clock: Clock): Project {
  return {
    ...current,
    name,
    version: current.version + 1,
    updatedAt: clock.now(),
  };
}
