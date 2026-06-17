/**
 * Settings ドメイン (FR-041 / FR-042 リセット時刻設定 + 境界時刻計算).
 *
 * 仕様参照:
 *   docs/developer/features/settings-day-boundary/spec.md
 *   docs/developer/features/daily-reset/spec.md
 *
 * Settings 型と HH:MM 形式検証 + 境界時刻計算 + リセット要否判定の純関数を提供する.
 * これらの純関数は server (daily-reset / purge-trash) と web local (local-reset-usecase)
 * の双方から共有され, server / Android local モード間の重複実装を解消する.
 */

/**
 * リセット時刻設定の単一レコード (id = "singleton").
 *
 * dayBoundaryTimezone は Android ローカルモード限定のフィールドのため
 * 共通の Settings 型には含めない (Android local 側で `Settings & { dayBoundaryTimezone: string }`
 * の intersection で拡張する). サーバモードでは process.env.TZ で代替する
 * (ADR-0011 / database/schema.md §Settings).
 */
export interface Settings {
  id: string;
  /** 境界時刻. "HH:MM" 形式 (00:00 〜 23:59). デフォルト "04:00". */
  dayBoundaryTime: string;
  updatedAt: string;
  version: number;
}

/**
 * dayBoundaryTime が "HH:MM" 形式 (00:00 〜 23:59) かを判定する純関数.
 * 正規表現: ^([01]\d|2[0-3]):[0-5]\d$
 */
export function validateDayBoundaryTime(value: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

/**
 * 今日の境界時刻（ISO 8601）を算出する純関数.
 *
 * nowIso を timeZone 上の壁時計日付として解釈し、その日の dayBoundaryTime に
 * 対応する UTC ISO 文字列を返す. DST は考慮せず、当日正午の UTC オフセットを使う.
 *
 * 既存 server/src/use-cases/daily-reset.ts の同名関数からそのまま移植.
 */
export function calcTodayBoundaryAt(
  nowIso: string,
  dayBoundaryTime: string,
  timeZone = "UTC",
): string {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const getPart = (parts: Intl.DateTimeFormatPart[], type: Intl.DateTimeFormatPartTypes) =>
    Number.parseInt(parts.find((part) => part.type === type)?.value ?? "0", 10);

  const nowParts = formatter.formatToParts(new Date(nowIso));
  const year = getPart(nowParts, "year");
  const month = getPart(nowParts, "month");
  const day = getPart(nowParts, "day");
  const [hourString, minuteString] = dayBoundaryTime.split(":");
  const hour = Number.parseInt(hourString ?? "0", 10);
  const minute = Number.parseInt(minuteString ?? "0", 10);

  const noonUtc = new Date(Date.UTC(year, month - 1, day, 12));
  const noonParts = formatter.formatToParts(noonUtc);
  const noonLocalAsUtc = Date.UTC(
    getPart(noonParts, "year"),
    getPart(noonParts, "month") - 1,
    getPart(noonParts, "day"),
    getPart(noonParts, "hour"),
    getPart(noonParts, "minute"),
  );
  const offsetMs = noonLocalAsUtc - noonUtc.getTime();
  const boundaryLocalAsUtc = Date.UTC(year, month - 1, day, hour, minute);

  return new Date(boundaryLocalAsUtc - offsetMs).toISOString();
}

/**
 * nowIso から見た「直近過去」 の境界時刻 (UTC ISO 8601) を返す.
 *
 * - nowIso が今日の境界以降 (>=) なら今日の境界を返す.
 * - nowIso が今日の境界より前なら前日の境界を返す.
 *
 * 既存 web/src/usecases/local-reset-usecase.ts の calcPreviousBoundary の
 * 意味論を calcTodayBoundaryAt の上に組み立てて再現. これにより server /
 * web local 間の境界時刻計算の重複実装を解消する.
 */
export function calcPreviousBoundaryAt(
  nowIso: string,
  dayBoundaryTime: string,
  timeZone: string,
): string {
  const todayBoundary = calcTodayBoundaryAt(nowIso, dayBoundaryTime, timeZone);
  if (nowIso >= todayBoundary) {
    return todayBoundary;
  }
  // 今日の境界がまだ未来 → 直近過去 = 前日の境界.
  // 24 時間 (86400000ms) 前の点を「前日」 として calcTodayBoundaryAt に渡せば
  // timeZone の壁時計上で前日の日付として解釈される.
  const yesterdayTimestamp = new Date(todayBoundary).getTime() - 24 * 60 * 60 * 1000;
  const yesterdayIso = new Date(yesterdayTimestamp).toISOString();
  return calcTodayBoundaryAt(yesterdayIso, dayBoundaryTime, timeZone);
}

/**
 * リセットが必要かどうかを判定する純関数.
 *
 *   needsReset = nowIso >= todayBoundaryAt
 *             && (lastResetExecutedAt === null || lastResetExecutedAt < todayBoundaryAt)
 *
 * 既存 server/src/use-cases/daily-reset.ts の同名関数からそのまま移植.
 */
export function needsDailyReset(
  nowIso: string,
  lastResetExecutedAt: string | null,
  todayBoundaryAt: string,
): boolean {
  if (nowIso < todayBoundaryAt) return false; // 境界時刻を超えていない
  if (lastResetExecutedAt === null) return true; // 初回
  return lastResetExecutedAt < todayBoundaryAt; // 今日の境界時刻より前にリセット済み
}
