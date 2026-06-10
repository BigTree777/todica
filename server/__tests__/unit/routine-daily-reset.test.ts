import { FakeClock } from "@todica/domain/clock";
/**
 * 単体テスト: 日次リセットのルーティン統合 (BL-017 / FR-031 / FR-033 / FR-034).
 *
 * 受け入れ基準の出典: docs/developer/features/routine/spec.md
 * 設計の出典: docs/developer/features/routine/plan.md §D-004
 *
 * テスト対象モジュール:
 *   - server/src/use-cases/daily-reset.ts（DailyResetDeps に routineRepository 追加）
 *   - server/src/data/routine-repository.ts（未実装）
 *
 * 日次リセット処理の拡張フロー（plan.md D-004）:
 *   1. リセット要否判定（既存）
 *   2. リセット不要なら早期リターン（既存）
 *   3. 前日ルーティンタスク削除（新規）: origin="routine" かつ dueDate="today" かつ trashedAt=null を物理削除
 *   4. tomorrow→today 繰越（既存）
 *   5. 当日分ルーティンタスク生成（新規）
 *   6. counter リセット（既存）
 *   7. purgeTrash（既存）
 *
 * 曜日:
 *   2026-06-08T04:01:00.000Z = 月曜日 (getUTCDay() = 1)
 *   2026-06-09T04:01:00.000Z = 火曜日 (getUTCDay() = 2)
 */
import { beforeEach, describe, expect, it } from "vitest";
import { maybeRunDailyReset } from "../../src/use-cases/daily-reset.js";
import {
  InMemoryCounterRepository,
  InMemoryRoutineRepository,
  InMemorySettingsRepository,
  InMemoryTaskRepository,
} from "../helpers/in-memory-repositories.js";

const ROUTINE_ID_WEEKDAYS = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ROUTINE_ID_DAILY = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const TASK_ID_1 = "11111111-1111-4111-8111-111111111111";
const TASK_ID_2 = "22222222-2222-4222-8222-222222222222";

// 月曜日 04:01 UTC（境界時刻 04:00 を超えている）
const MONDAY_RESET_TIME = "2026-06-08T04:01:00.000Z";
// 火曜日 04:01 UTC
const TUESDAY_RESET_TIME = "2026-06-09T04:01:00.000Z";
// 月曜日のリセット直後の境界時刻
const MONDAY_BOUNDARY = "2026-06-08T04:00:00.000Z";
// 日曜日（リセット前日）の時刻（lastResetExecutedAt として使う）
const SUNDAY_RESET_TIME = "2026-06-07T04:01:00.000Z";

let taskRepo: InMemoryTaskRepository;
let counterRepo: InMemoryCounterRepository;
let settingsRepo: InMemorySettingsRepository;
let routineRepo: InMemoryRoutineRepository;

beforeEach(() => {
  taskRepo = new InMemoryTaskRepository();
  counterRepo = new InMemoryCounterRepository();
  settingsRepo = new InMemorySettingsRepository();
  routineRepo = new InMemoryRoutineRepository();

  // counterRepo を「前日リセット済み / 本日未実行」状態に設定
  counterRepo.seed({
    lastResetExecutedAt: SUNDAY_RESET_TIME,
  });
});

// ============================================================
// FR-031: 日次リセット時に指定曜日のルーティンタスクが生成される
// spec.md §「日次リセット時の自動タスク生成（FR-031）」
// ============================================================

describe("maybeRunDailyReset + routineRepository (FR-031 ルーティンタスク生成)", () => {
  it("シナリオ: 日次リセット時に指定曜日のルーティンタスクが生成される", async () => {
    // Given ルーティン（daysOfWeek=[1]、月曜）が存在し、境界時刻設定は "04:00"
    // And   現在時刻が月曜日 04:01 UTC（日次リセット未実行）
    // When  日次リセットがトリガーされる
    // Then  リセットが実行され、dueDate="today", origin="routine", routineId=R1 のタスクが 1 件生成される
    routineRepo.seed({
      id: ROUTINE_ID_WEEKDAYS,
      name: "朝の運動",
      daysOfWeek: [1], // 月曜
      defaultPriority: "normal",
      version: 1,
      createdAt: SUNDAY_RESET_TIME,
      updatedAt: SUNDAY_RESET_TIME,
    });

    const clock = new FakeClock(MONDAY_RESET_TIME);
    const result = await maybeRunDailyReset({
      taskRepository: taskRepo,
      counterRepository: counterRepo,
      settingsRepository: settingsRepo,
      clock,
      routineRepository: routineRepo,
    });

    // リセットが実行された
    expect(result.executed).toBe(true);
    expect(result.appliedBoundaryAt).toBe(MONDAY_BOUNDARY);

    // ルーティンタスクが生成されている
    const tasks = taskRepo.all();
    const routineTasks = tasks.filter(
      (t) => t.origin === "routine" && t.routineId === ROUTINE_ID_WEEKDAYS,
    );
    expect(routineTasks).toHaveLength(1);
    expect(routineTasks[0]?.dueDate).toBe("today");
    expect(routineTasks[0]?.trashedAt).toBeNull();
  });

  it("シナリオ: ルーティンタスクの名称・優先度はルーティン定義に従う", async () => {
    // Given ルーティン（name="日報", defaultPriority="highest", daysOfWeek=[1]）が存在する
    // When  月曜の日次リセットが実行される
    // Then  生成されたタスクの name="日報", priority="highest", origin="routine" になっている
    routineRepo.seed({
      id: ROUTINE_ID_WEEKDAYS,
      name: "日報",
      daysOfWeek: [1],
      defaultPriority: "highest",
      version: 1,
      createdAt: SUNDAY_RESET_TIME,
      updatedAt: SUNDAY_RESET_TIME,
    });

    const clock = new FakeClock(MONDAY_RESET_TIME);
    await maybeRunDailyReset({
      taskRepository: taskRepo,
      counterRepository: counterRepo,
      settingsRepository: settingsRepo,
      clock,
      routineRepository: routineRepo,
    });

    const tasks = taskRepo.all();
    const routineTask = tasks.find(
      (t) => t.origin === "routine" && t.routineId === ROUTINE_ID_WEEKDAYS,
    );
    expect(routineTask).toBeDefined();
    expect(routineTask?.name).toBe("日報");
    expect(routineTask?.priority).toBe("highest");
    expect(routineTask?.origin).toBe("routine");
  });

  it("シナリオ: 生成曜日でない日はタスクが生成されない", async () => {
    // Given ルーティン（daysOfWeek=[1]、月曜）が存在し、境界時刻設定は "04:00"
    // And   現在時刻が火曜日 04:01 UTC（日次リセット未実行）
    // When  日次リセットがトリガーされる
    // Then  リセットが実行され、そのルーティンに対応するタスクは生成されない
    routineRepo.seed({
      id: ROUTINE_ID_WEEKDAYS,
      name: "朝の運動",
      daysOfWeek: [1], // 月曜のみ
      defaultPriority: "normal",
      version: 1,
      createdAt: SUNDAY_RESET_TIME,
      updatedAt: SUNDAY_RESET_TIME,
    });

    // counter を月曜リセット済み状態に（火曜リセットが実行されるよう設定）
    counterRepo.seed({
      lastResetExecutedAt: MONDAY_RESET_TIME,
    });

    const clock = new FakeClock(TUESDAY_RESET_TIME);
    const result = await maybeRunDailyReset({
      taskRepository: taskRepo,
      counterRepository: counterRepo,
      settingsRepository: settingsRepo,
      clock,
      routineRepository: routineRepo,
    });

    // リセットは実行された
    expect(result.executed).toBe(true);

    // 月曜専用ルーティンのタスクは生成されていない
    const tasks = taskRepo.all();
    const routineTasks = tasks.filter(
      (t) => t.origin === "routine" && t.routineId === ROUTINE_ID_WEEKDAYS,
    );
    expect(routineTasks).toHaveLength(0);
  });

  it("シナリオ: 同じ境界日に 2 回リセットしてもタスクは重複生成されない", async () => {
    // Given ルーティン（daysOfWeek=[1]）が存在し、1 回目のリセットで月曜タスクが生成済み
    // When  同じ境界日に POST /api/v1/reset を再度呼ぶ
    // Then  HTTP 200 が返り executed=false
    // And   同ルーティンのタスクは追加生成されていない
    routineRepo.seed({
      id: ROUTINE_ID_WEEKDAYS,
      name: "朝の運動",
      daysOfWeek: [1],
      defaultPriority: "normal",
      version: 1,
      createdAt: SUNDAY_RESET_TIME,
      updatedAt: SUNDAY_RESET_TIME,
    });

    const clock = new FakeClock(MONDAY_RESET_TIME);

    // 1 回目のリセット実行
    const result1 = await maybeRunDailyReset({
      taskRepository: taskRepo,
      counterRepository: counterRepo,
      settingsRepository: settingsRepo,
      clock,
      routineRepository: routineRepo,
    });
    expect(result1.executed).toBe(true);

    // 1 回目でタスクが 1 件生成されている
    const tasksAfter1st = taskRepo
      .all()
      .filter((t) => t.origin === "routine" && t.routineId === ROUTINE_ID_WEEKDAYS);
    expect(tasksAfter1st).toHaveLength(1);

    // 2 回目のリセット（同じ境界日）
    const result2 = await maybeRunDailyReset({
      taskRepository: taskRepo,
      counterRepository: counterRepo,
      settingsRepository: settingsRepo,
      clock,
      routineRepository: routineRepo,
    });

    // 2 回目は executed=false（冪等）
    expect(result2.executed).toBe(false);

    // タスクは増えていない
    const tasksAfter2nd = taskRepo
      .all()
      .filter((t) => t.origin === "routine" && t.routineId === ROUTINE_ID_WEEKDAYS);
    expect(tasksAfter2nd).toHaveLength(1);
  });
});

// ============================================================
// FR-033: 翌日非持越し
// spec.md §「翌日非持越し（FR-033）」
// ============================================================

describe("maybeRunDailyReset + routineRepository (FR-033 翌日非持越し)", () => {
  it("シナリオ: 当日未完了のルーティンタスクは翌日リセット時に削除される", async () => {
    // Given 月曜の日次リセットで T1（origin="routine", dueDate="today"）が生成された
    // And   T1 が未完了のまま
    // When  翌日（火曜）の日次リセットが実行される
    // Then  T1 は物理削除されており、GET /api/v1/tasks?trashed=all にも T1 が含まれない
    routineRepo.seed({
      id: ROUTINE_ID_DAILY,
      name: "朝の運動",
      daysOfWeek: [1, 2], // 月・火
      defaultPriority: "normal",
      version: 1,
      createdAt: SUNDAY_RESET_TIME,
      updatedAt: SUNDAY_RESET_TIME,
    });

    // 月曜のリセットで生成されたルーティンタスク（未完了）
    taskRepo.seed({
      id: TASK_ID_1,
      name: "朝の運動",
      projectId: null,
      dueDate: "today",
      priority: "normal",
      origin: "routine",
      routineId: ROUTINE_ID_DAILY,
      createdAt: MONDAY_RESET_TIME,
      updatedAt: MONDAY_RESET_TIME,
      trashedAt: null,
      trashedReason: null,
      version: 1,
    });

    // 月曜リセット済み状態に設定
    counterRepo.seed({
      lastResetExecutedAt: MONDAY_RESET_TIME,
    });

    const clock = new FakeClock(TUESDAY_RESET_TIME);
    const result = await maybeRunDailyReset({
      taskRepository: taskRepo,
      counterRepository: counterRepo,
      settingsRepository: settingsRepo,
      clock,
      routineRepository: routineRepo,
    });

    // リセットが実行された
    expect(result.executed).toBe(true);

    // T1 は物理削除されている（trashed=all でも見えない）
    const allTasks = await taskRepo.list({ trashed: "all" });
    expect(allTasks.find((t) => t.id === TASK_ID_1)).toBeUndefined();
  });

  it("シナリオ: 完了済みのルーティンタスクは deleteRoutineTasksForToday の対象外（trashedAt!=null）", async () => {
    // Given 月曜の日次リセットで T1（origin="routine"）が生成された
    // And   T1 が完了されており trashedAt!=null
    // When  翌日の日次リセットが実行される
    // Then  T1 は deleteRoutineTasksForToday（trashedAt=null 限定）の対象にはならない.
    //       ただし purgeTrash によって境界時刻より古いゴミ箱タスクとして清算される.
    routineRepo.seed({
      id: ROUTINE_ID_DAILY,
      name: "朝の運動",
      daysOfWeek: [2], // 火曜
      defaultPriority: "normal",
      version: 1,
      createdAt: SUNDAY_RESET_TIME,
      updatedAt: SUNDAY_RESET_TIME,
    });

    // 月曜リセットで生成されたルーティンタスク（完了済み）
    // trashedAt = MONDAY_RESET_TIME = "2026-06-08T04:01:00.000Z"
    // TUESDAY boundary = "2026-06-09T04:00:00.000Z"
    // → boundary より古いためPurgeTra によって清算される
    taskRepo.seed({
      id: TASK_ID_1,
      name: "朝の運動",
      projectId: null,
      dueDate: "today",
      priority: "normal",
      origin: "routine",
      routineId: ROUTINE_ID_DAILY,
      createdAt: MONDAY_RESET_TIME,
      updatedAt: MONDAY_RESET_TIME,
      trashedAt: MONDAY_RESET_TIME, // 完了済み
      trashedReason: "completed",
      version: 2,
    });

    // 月曜リセット済み状態に設定
    counterRepo.seed({
      lastResetExecutedAt: MONDAY_RESET_TIME,
    });

    const clock = new FakeClock(TUESDAY_RESET_TIME);
    await maybeRunDailyReset({
      taskRepository: taskRepo,
      counterRepository: counterRepo,
      settingsRepository: settingsRepo,
      clock,
      routineRepository: routineRepo,
    });

    // T1 は deleteRoutineTasksForToday の対象外（trashedAt!=null）だが,
    // purgeTrash によって境界より古いゴミ箱タスクとして物理削除されている.
    // trashedAt="2026-06-08T04:01:00.000Z" < boundary="2026-06-09T04:00:00.000Z"
    const t1 = await taskRepo.findById(TASK_ID_1);
    expect(t1).toBeNull(); // purgeTrash によって清算済み
  });

  it("シナリオ: ルーティン由来タスクの翌日繰越（FR-051）は実行されない", async () => {
    // Given 日次リセットで T1（origin="routine", dueDate="today"）が生成された
    // And   T1 が未完了のまま
    // When  翌日の日次リセットが実行される
    // Then  T1 の dueDate が "tomorrow" に変わることなく削除されている
    routineRepo.seed({
      id: ROUTINE_ID_DAILY,
      name: "朝の運動",
      daysOfWeek: [2], // 火曜
      defaultPriority: "normal",
      version: 1,
      createdAt: SUNDAY_RESET_TIME,
      updatedAt: SUNDAY_RESET_TIME,
    });

    // 月曜リセットで生成されたルーティンタスク（未完了）
    taskRepo.seed({
      id: TASK_ID_1,
      name: "朝の運動",
      projectId: null,
      dueDate: "today", // dueDate="today" のまま
      priority: "normal",
      origin: "routine",
      routineId: ROUTINE_ID_DAILY,
      createdAt: MONDAY_RESET_TIME,
      updatedAt: MONDAY_RESET_TIME,
      trashedAt: null,
      trashedReason: null,
      version: 1,
    });

    // 月曜リセット済み状態に設定
    counterRepo.seed({
      lastResetExecutedAt: MONDAY_RESET_TIME,
    });

    const clock = new FakeClock(TUESDAY_RESET_TIME);
    await maybeRunDailyReset({
      taskRepository: taskRepo,
      counterRepository: counterRepo,
      settingsRepository: settingsRepo,
      clock,
      routineRepository: routineRepo,
    });

    // T1 は "tomorrow" に変わらず物理削除されている
    const t1 = await taskRepo.findById(TASK_ID_1);
    expect(t1).toBeNull();

    // 全タスク（trashed=all）にも T1 は存在しない（物理削除）
    const allTasks = await taskRepo.list({ trashed: "all" });
    expect(allTasks.find((t) => t.id === TASK_ID_1)).toBeUndefined();
  });
});

// ============================================================
// FR-034: 実施履歴なし
// spec.md §「実施履歴なし（FR-034）」
// ============================================================

describe("maybeRunDailyReset + routineRepository (FR-034 実施履歴なし)", () => {
  it("シナリオ: ルーティンタスクが物理削除されると履歴が一切残らない", async () => {
    // Given 月曜の日次リセットで T1（origin="routine"）が生成された
    // And   T1 が未完了のまま
    // When  翌日の日次リセットが実行される
    // Then  GET /api/v1/tasks?trashed=all に T1 が含まれない
    // And   GET /api/v1/tasks?trashed=true に T1 が含まれない
    routineRepo.seed({
      id: ROUTINE_ID_DAILY,
      name: "日報",
      daysOfWeek: [1, 2],
      defaultPriority: "normal",
      version: 1,
      createdAt: SUNDAY_RESET_TIME,
      updatedAt: SUNDAY_RESET_TIME,
    });

    taskRepo.seed({
      id: TASK_ID_1,
      name: "日報",
      projectId: null,
      dueDate: "today",
      priority: "normal",
      origin: "routine",
      routineId: ROUTINE_ID_DAILY,
      createdAt: MONDAY_RESET_TIME,
      updatedAt: MONDAY_RESET_TIME,
      trashedAt: null,
      trashedReason: null,
      version: 1,
    });

    // 月曜リセット済み
    counterRepo.seed({
      lastResetExecutedAt: MONDAY_RESET_TIME,
    });

    const clock = new FakeClock(TUESDAY_RESET_TIME);
    await maybeRunDailyReset({
      taskRepository: taskRepo,
      counterRepository: counterRepo,
      settingsRepository: settingsRepo,
      clock,
      routineRepository: routineRepo,
    });

    // trashed=all でも T1 が含まれない（物理削除）
    const allTasks = await taskRepo.list({ trashed: "all" });
    expect(allTasks.find((t) => t.id === TASK_ID_1)).toBeUndefined();

    // trashed=true でも T1 が含まれない
    const trashedTasks = await taskRepo.list({ trashed: "true" });
    expect(trashedTasks.find((t) => t.id === TASK_ID_1)).toBeUndefined();
  });
});

// ============================================================
// routineRepository 未注入時の後方互換（plan.md D-007）
// spec.md §「DailyResetDeps 拡張」
// ============================================================

describe("maybeRunDailyReset (routineRepository 未注入時の後方互換)", () => {
  it("routineRepository を注入しなくても既存のリセット動作は維持される", async () => {
    // Given routineRepository が DailyResetDeps に含まれていない
    // When  日次リセットがトリガーされる
    // Then  既存のリセット動作（tomorrow→today 繰越 / counter リセット）は正常に実行される
    taskRepo.seed({
      id: TASK_ID_2,
      name: "明日のタスク",
      projectId: null,
      dueDate: "tomorrow",
      priority: "normal",
      origin: "manual",
      routineId: null,
      createdAt: SUNDAY_RESET_TIME,
      updatedAt: SUNDAY_RESET_TIME,
      trashedAt: null,
      trashedReason: null,
      version: 1,
    });

    const clock = new FakeClock(MONDAY_RESET_TIME);

    // routineRepository を注入しない（省略）
    const result = await maybeRunDailyReset({
      taskRepository: taskRepo,
      counterRepository: counterRepo,
      settingsRepository: settingsRepo,
      clock,
      // routineRepository は渡さない
    });

    // リセットが実行された
    expect(result.executed).toBe(true);

    // tomorrow→today の繰越が実行されている
    const task = await taskRepo.findById(TASK_ID_2);
    expect(task?.dueDate).toBe("today");
  });
});
