/**
 * useTodayQuery フック (フェーズ B: TanStack Query 導入)
 *
 * `repository.today()` を `useQuery` でラップする。
 * クエリキーは `['today']`。
 *
 * 仕様:
 *   TQ-001: TanStack Query を導入し、QueryClientProvider をアプリルートに配置する。
 *   TQ-002: useQuery / useMutation による状態管理。
 *   TQ-003: 書込 mutation 成功後に ['today'] クエリを invalidate する。
 */
import { useQuery } from "@tanstack/react-query";
import type { TaskRepository } from "../repositories/task-repository.js";

export function useTodayQuery(repository: TaskRepository) {
  return useQuery({
    queryKey: ["today"],
    queryFn: () => repository.today(),
  });
}
