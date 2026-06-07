/**
 * Clock 抽象.
 *
 * 「今」を取得する手段をドメイン層から I/O 経由で取得しないために, 引数で受け取る.
 * テストでは固定時刻を返す FakeClock を, 本番では SystemClock を注入する.
 */
export interface Clock {
  /** ISO 8601 形式 (タイムゾーン込み) の現在時刻文字列を返す. */
  now(): string;
}

/** 実時刻を返す Clock. サーバ起動時に注入する. */
export class SystemClock implements Clock {
  now(): string {
    return new Date().toISOString();
  }
}

/**
 * テスト用の固定時刻 Clock.
 * `tick(ms)` で時間を進められるようにし, version 更新時刻の差を確認できるようにする.
 */
export class FakeClock implements Clock {
  private current: Date;

  constructor(initial: string | Date = "2026-06-07T00:00:00.000Z") {
    this.current = typeof initial === "string" ? new Date(initial) : initial;
  }

  now(): string {
    return this.current.toISOString();
  }

  /** 現在時刻を ms ぶん進める. */
  tick(ms: number): void {
    this.current = new Date(this.current.getTime() + ms);
  }

  set(iso: string): void {
    this.current = new Date(iso);
  }
}
