/**
 * ドメイン単体テスト: Routine の生成・編集・バリデーション (BL-017 / FR-030 / FR-035).
 *
 * 受け入れ基準の出典: docs/developer/features/routine/spec.md
 * 設計の出典: docs/developer/features/routine/plan.md §D-002
 *
 * テスト対象モジュール: domain/src/routine/index.ts（未実装）
 * → import がコンパイルエラーになることで「red」を確認する.
 * → implementer が domain/src/routine/index.ts を実装することで「green」になる.
 *
 * 受け入れ基準:
 *   - spec.md §「ルーティン作成（FR-030）」のバリデーション部分
 *   - plan.md §D-002 バリデーション規則
 */
import { describe, expect, it } from "vitest";
import {
  createRoutine,
  updateRoutine,
  validateDaysOfWeek,
  validateRoutineName,
} from "../src/routine/index.js";
import { FakeClock } from "../src/index.js";

const NOW = "2026-06-08T09:00:00.000Z";
const LATER = "2026-06-08T09:00:01.000Z";

// ============================================================
// validateRoutineName
//
// spec.md §「ルーティン作成（FR-030）」バリデーション:
//   - 空文字は INVALID_ROUTINE_NAME (400)
//   - 201 文字以上は INVALID_ROUTINE_NAME (400)
//   - 制御文字を含むと INVALID_ROUTINE_NAME (400)
// plan.md D-002: name は 1〜200 文字, 制御文字 (C0/DEL/C1) 禁止.
// ============================================================

describe("validateRoutineName (plan.md D-002)", () => {
  // spec.md: 名称が空のルーティンは作成できない
  it("空文字は INVALID_ROUTINE_NAME", () => {
    // Given 認証済みの状態
    // When  POST /api/v1/routines に name="" を送る
    // Then  INVALID_ROUTINE_NAME エラーが返る
    const error = validateRoutineName("");
    expect(error).not.toBeNull();
    expect(error?.code).toBe("INVALID_ROUTINE_NAME");
  });

  it("1 文字は OK（下限境界値）", () => {
    // 1 文字は仕様の最小値 → null が返る（エラーなし）
    expect(validateRoutineName("a")).toBeNull();
  });

  it("200 文字は OK（上限境界値）", () => {
    // 200 文字は仕様上限値 → null が返る（エラーなし）
    expect(validateRoutineName("a".repeat(200))).toBeNull();
  });

  // spec.md: 名称が 201 文字以上のルーティンは作成できない
  it("201 文字は INVALID_ROUTINE_NAME（上限超過）", () => {
    // Given 認証済みの状態
    // When  POST /api/v1/routines に 201 文字の name を送る
    // Then  INVALID_ROUTINE_NAME エラーが返る
    const error = validateRoutineName("a".repeat(201));
    expect(error).not.toBeNull();
    expect(error?.code).toBe("INVALID_ROUTINE_NAME");
  });

  // spec.md: 名称に制御文字を含むルーティンは作成できない
  it("改行文字（U+000A）を含むと INVALID_ROUTINE_NAME", () => {
    // Given 認証済みの状態
    // When  POST /api/v1/routines に name に改行文字（U+000A）を含む文字列を送る
    // Then  INVALID_ROUTINE_NAME エラーが返る
    const error = validateRoutineName("朝の運動\nメモ");
    expect(error).not.toBeNull();
    expect(error?.code).toBe("INVALID_ROUTINE_NAME");
  });

  it("タブ文字を含むと INVALID_ROUTINE_NAME", () => {
    const error = validateRoutineName("朝の運動\t");
    expect(error).not.toBeNull();
    expect(error?.code).toBe("INVALID_ROUTINE_NAME");
  });

  it("制御文字 U+0001 を含むと INVALID_ROUTINE_NAME", () => {
    const error = validateRoutineName("朝の運動\x01");
    expect(error).not.toBeNull();
    expect(error?.code).toBe("INVALID_ROUTINE_NAME");
  });

  it("日本語文字列は OK", () => {
    expect(validateRoutineName("朝の運動")).toBeNull();
  });

  it("C1 制御文字（U+0080）を含む name は INVALID_ROUTINE_NAME", () => {
    const error = validateRoutineName("\x80test");
    expect(error).not.toBeNull();
    expect(error?.code).toBe("INVALID_ROUTINE_NAME");
  });
});

// ============================================================
// validateDaysOfWeek
//
// spec.md §「ルーティン作成（FR-030）」バリデーション:
//   - daysOfWeek が空配列のルーティンは作成できない → INVALID_DAYS_OF_WEEK
//   - daysOfWeek に 0〜6 以外の値を含む場合は作成できない → INVALID_DAYS_OF_WEEK
//   - daysOfWeek に重複値を含む場合は重複を排除して保存される
// plan.md D-002: 空配列禁止, 各要素は 0〜6 の整数, 重複は排除して保存
// ============================================================

describe("validateDaysOfWeek (plan.md D-002)", () => {
  // spec.md: daysOfWeek が空配列のルーティンは作成できない
  it("空配列は INVALID_DAYS_OF_WEEK", () => {
    // Given 認証済みの状態
    // When  POST /api/v1/routines に daysOfWeek=[] を送る
    // Then  INVALID_DAYS_OF_WEEK エラーが返る
    const error = validateDaysOfWeek([]);
    expect(error).not.toBeNull();
    expect(error?.code).toBe("INVALID_DAYS_OF_WEEK");
  });

  // spec.md: daysOfWeek に 0〜6 以外の値を含む場合は作成できない
  it("7 以上の値を含むと INVALID_DAYS_OF_WEEK", () => {
    // Given 認証済みの状態
    // When  POST /api/v1/routines に daysOfWeek=[7] を送る
    // Then  INVALID_DAYS_OF_WEEK エラーが返る
    const error = validateDaysOfWeek([7]);
    expect(error).not.toBeNull();
    expect(error?.code).toBe("INVALID_DAYS_OF_WEEK");
  });

  it("-1 以下の値を含むと INVALID_DAYS_OF_WEEK", () => {
    const error = validateDaysOfWeek([-1]);
    expect(error).not.toBeNull();
    expect(error?.code).toBe("INVALID_DAYS_OF_WEEK");
  });

  it("0〜6 の全値は OK（境界値）", () => {
    // 0=日, 1=月, 2=火, 3=水, 4=木, 5=金, 6=土
    expect(validateDaysOfWeek([0])).toBeNull();
    expect(validateDaysOfWeek([6])).toBeNull();
    expect(validateDaysOfWeek([0, 1, 2, 3, 4, 5, 6])).toBeNull();
  });

  it("平日（月〜金）は OK", () => {
    expect(validateDaysOfWeek([1, 2, 3, 4, 5])).toBeNull();
  });

  it("重複値を含む場合は重複排除後の値でバリデーションする", () => {
    // spec.md: daysOfWeek=[1,1,2] → [1,2] になる
    // バリデーション段階では重複を許容する（保存時に排除）
    expect(validateDaysOfWeek([1, 1, 2])).toBeNull();
  });
});

// ============================================================
// createRoutine
//
// spec.md §「ルーティン作成（FR-030）」正常系:
//   - 有効なルーティンを作成できる
//   - version=1, createdAt=updatedAt=clock.now()
// plan.md D-001: Routine エンティティのデータモデル
// ============================================================

describe("createRoutine (spec.md §「ルーティン作成（FR-030）」)", () => {
  it("正常系: 有効な入力でルーティンを作成できる（version=1, createdAt=updatedAt）", () => {
    // Given 認証済みの状態
    // When  POST /api/v1/routines に name="朝の運動", daysOfWeek=[1,2,3,4,5], defaultPriority="normal" を送る
    // Then  HTTP 201 が返り、レスポンスボディに作成されたルーティンが含まれる
    const clock = new FakeClock(NOW);
    const result = createRoutine(
      {
        id: "routine-1",
        name: "朝の運動",
        daysOfWeek: [1, 2, 3, 4, 5],
        defaultPriority: "normal",
      },
      clock,
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.routine).toMatchObject({
      id: "routine-1",
      name: "朝の運動",
      daysOfWeek: [1, 2, 3, 4, 5],
      defaultPriority: "normal",
      version: 1,
      createdAt: NOW,
      updatedAt: NOW,
    });
    // createdAt と updatedAt は同一値
    expect(result.routine.createdAt).toBe(result.routine.updatedAt);
  });

  it("daysOfWeek の重複は排除されて保存される", () => {
    // spec.md: daysOfWeek=[1,1,2] → 保存されるルーティンの daysOfWeek は [1,2] になる
    const clock = new FakeClock(NOW);
    const result = createRoutine(
      {
        id: "routine-2",
        name: "夜の読書",
        daysOfWeek: [1, 1, 2],
        defaultPriority: "later",
      },
      clock,
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // 重複排除: [1,1,2] → [1,2]
    expect(result.routine.daysOfWeek).toEqual([1, 2]);
  });

  it("defaultPriority = 'highest' でも OK", () => {
    const clock = new FakeClock(NOW);
    const result = createRoutine(
      {
        id: "routine-3",
        name: "朝会",
        daysOfWeek: [1, 2, 3, 4, 5],
        defaultPriority: "highest",
      },
      clock,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.routine.defaultPriority).toBe("highest");
  });

  it("空 name は INVALID_ROUTINE_NAME を返す", () => {
    // spec.md: 名称が空のルーティンは作成できない
    const clock = new FakeClock(NOW);
    const result = createRoutine(
      {
        id: "routine-err",
        name: "",
        daysOfWeek: [1],
        defaultPriority: "normal",
      },
      clock,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("INVALID_ROUTINE_NAME");
  });

  it("201 文字の name は INVALID_ROUTINE_NAME を返す", () => {
    // spec.md: 名称が 201 文字以上のルーティンは作成できない
    const clock = new FakeClock(NOW);
    const result = createRoutine(
      {
        id: "routine-err2",
        name: "a".repeat(201),
        daysOfWeek: [1],
        defaultPriority: "normal",
      },
      clock,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("INVALID_ROUTINE_NAME");
  });

  it("daysOfWeek が空配列は INVALID_DAYS_OF_WEEK を返す", () => {
    // spec.md: daysOfWeek が空配列のルーティンは作成できない
    const clock = new FakeClock(NOW);
    const result = createRoutine(
      {
        id: "routine-err3",
        name: "日報",
        daysOfWeek: [],
        defaultPriority: "normal",
      },
      clock,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("INVALID_DAYS_OF_WEEK");
  });

  it("daysOfWeek に 7 を含む場合は INVALID_DAYS_OF_WEEK を返す", () => {
    // spec.md: daysOfWeek に 0〜6 以外の値を含む場合は作成できない
    const clock = new FakeClock(NOW);
    const result = createRoutine(
      {
        id: "routine-err4",
        name: "日報",
        daysOfWeek: [7],
        defaultPriority: "normal",
      },
      clock,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("INVALID_DAYS_OF_WEEK");
  });
});

// ============================================================
// updateRoutine
//
// spec.md §「ルーティン編集（FR-035）」:
//   - ルーティンの名称・生成曜日・既定優先度は変更できる
//   - version+1, updatedAt 更新, createdAt 不変
// ============================================================

describe("updateRoutine (spec.md §「ルーティン編集（FR-035）」)", () => {
  const baseRoutine = {
    id: "routine-1",
    name: "朝の運動",
    daysOfWeek: [1, 2, 3, 4, 5],
    defaultPriority: "normal" as const,
    version: 1,
    createdAt: NOW,
    updatedAt: NOW,
  };

  it("正常系: name を更新すると version+1, updatedAt 更新, createdAt 不変", () => {
    // spec.md: PATCH /api/v1/routines/R1 に name="夜の運動" を送る
    // Then: version=2 になっている
    const clock = new FakeClock(LATER);
    const result = updateRoutine(
      { ...baseRoutine },
      { name: "夜の運動" },
      clock,
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.routine.name).toBe("夜の運動");
    expect(result.routine.version).toBe(2);
    expect(result.routine.updatedAt).toBe(LATER);
    expect(result.routine.createdAt).toBe(NOW); // createdAt は不変
  });

  it("daysOfWeek を更新できる", () => {
    // spec.md: PATCH /api/v1/routines/R1 に daysOfWeek=[6,0] を送る
    const clock = new FakeClock(LATER);
    const result = updateRoutine(
      { ...baseRoutine },
      { daysOfWeek: [6, 0] },
      clock,
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.routine.daysOfWeek).toEqual([6, 0]);
    expect(result.routine.version).toBe(2);
  });

  it("defaultPriority を更新できる", () => {
    // spec.md: PATCH /api/v1/routines/R1 に defaultPriority="later" を送る
    const clock = new FakeClock(LATER);
    const result = updateRoutine(
      { ...baseRoutine },
      { defaultPriority: "later" },
      clock,
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.routine.defaultPriority).toBe("later");
    expect(result.routine.version).toBe(2);
  });

  it("複数フィールドを同時に更新できる（部分上書き）", () => {
    // spec.md: PATCH に name="夜の運動", daysOfWeek=[6,0], defaultPriority="later" を送る
    const clock = new FakeClock(LATER);
    const result = updateRoutine(
      { ...baseRoutine },
      { name: "夜の運動", daysOfWeek: [6, 0], defaultPriority: "later" },
      clock,
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.routine.name).toBe("夜の運動");
    expect(result.routine.daysOfWeek).toEqual([6, 0]);
    expect(result.routine.defaultPriority).toBe("later");
    expect(result.routine.version).toBe(2);
  });

  it("更新時に空 name は INVALID_ROUTINE_NAME を返す", () => {
    const clock = new FakeClock(LATER);
    const result = updateRoutine(
      { ...baseRoutine },
      { name: "" },
      clock,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("INVALID_ROUTINE_NAME");
  });

  it("更新時に daysOfWeek が空配列は INVALID_DAYS_OF_WEEK を返す", () => {
    const clock = new FakeClock(LATER);
    const result = updateRoutine(
      { ...baseRoutine },
      { daysOfWeek: [] },
      clock,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("INVALID_DAYS_OF_WEEK");
  });

  it("更新時も daysOfWeek の重複は排除される", () => {
    const clock = new FakeClock(LATER);
    const result = updateRoutine(
      { ...baseRoutine },
      { daysOfWeek: [1, 1, 2] },
      clock,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.routine.daysOfWeek).toEqual([1, 2]);
  });

  it("指定しなかったフィールドは変更されない（部分上書き原則）", () => {
    // name のみ更新 → daysOfWeek と defaultPriority は元のまま
    const clock = new FakeClock(LATER);
    const result = updateRoutine(
      { ...baseRoutine },
      { name: "変更後" },
      clock,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.routine.daysOfWeek).toEqual([1, 2, 3, 4, 5]);
    expect(result.routine.defaultPriority).toBe("normal");
  });
});
