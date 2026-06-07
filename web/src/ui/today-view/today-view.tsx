/**
 * 今日ビュー (BL-001 の最小ビュー兼用).
 *
 * 本ファイルは test-designer が用意したスタブ. implementer が本実装する.
 * テストは TaskRepository をモック注入し, 描画・送信・更新の挙動を検証する.
 */
import type { TaskRepository } from "../../repositories/task-repository.js";

export interface TodayViewProps {
  repository: TaskRepository;
}

/**
 * スタブ: 「今日ビュー」最小ビュー. implementer が以下を実装する.
 * - 起票フォーム (タスク名のみ必須, 期限 = today/tomorrow の 2 値)
 * - タスク一覧 (各行に 編集 / 期限切替 / 削除 を表示)
 * - 編集ダイアログ
 */
export function TodayView(_props: TodayViewProps): JSX.Element {
  throw new Error("not implemented: TodayView");
}
