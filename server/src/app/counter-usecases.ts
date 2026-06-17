/**
 * カウンタのユースケース (BL-008 / FR-040).
 */
import type { Counter } from "@todica/domain/counter";
import type { AppDeps } from "../app.js";

/** 完了数カウンタを取得する. */
export async function getCounter(deps: AppDeps): Promise<Counter> {
  return deps.counterRepository.get();
}
