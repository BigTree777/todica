import { describe, expect, it } from "vitest";
import {
  type FocusSelection,
  setCurrentTask,
  shouldClearFocus,
} from "../src/focus-selection/index.js";

const BASE: FocusSelection = {
  id: "singleton",
  currentTaskId: null,
  updatedAt: "2026-06-16T00:00:00.000Z",
  version: 1,
};

describe("setCurrentTask", () => {
  it("taskId = string で currentTaskId を上書き / version+1 / updatedAt 更新", () => {
    const result = setCurrentTask(BASE, "task-1", "2026-06-17T10:00:00.000Z");
    expect(result.currentTaskId).toBe("task-1");
    expect(result.version).toBe(2);
    expect(result.updatedAt).toBe("2026-06-17T10:00:00.000Z");
    expect(result.id).toBe("singleton");
  });

  it("taskId = null で currentTaskId を null に上書き (解除)", () => {
    const focus: FocusSelection = { ...BASE, currentTaskId: "task-1", version: 3 };
    const result = setCurrentTask(focus, null, "2026-06-17T10:00:00.000Z");
    expect(result.currentTaskId).toBeNull();
    expect(result.version).toBe(4);
  });

  it("既存の currentTaskId が同じ値でも version+1 / updatedAt 更新が走る", () => {
    const focus: FocusSelection = { ...BASE, currentTaskId: "task-1", version: 5 };
    const result = setCurrentTask(focus, "task-1", "2026-06-17T10:00:00.000Z");
    expect(result.currentTaskId).toBe("task-1");
    expect(result.version).toBe(6);
  });

  it("入力 focus を変更しない (純関数)", () => {
    const before = { ...BASE };
    setCurrentTask(BASE, "task-1", "2026-06-17T10:00:00.000Z");
    expect(BASE).toEqual(before);
  });
});

describe("shouldClearFocus", () => {
  it("currentTaskId が targetId と一致すれば true", () => {
    const focus: FocusSelection = { ...BASE, currentTaskId: "task-1" };
    expect(shouldClearFocus(focus, "task-1")).toBe(true);
  });

  it("currentTaskId が targetId と不一致なら false", () => {
    const focus: FocusSelection = { ...BASE, currentTaskId: "task-1" };
    expect(shouldClearFocus(focus, "task-2")).toBe(false);
  });

  it("currentTaskId が null なら常に false", () => {
    expect(shouldClearFocus(BASE, "task-1")).toBe(false);
  });
});
