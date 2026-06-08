/**
 * query-client.ts (フェーズ B: TanStack Query 導入)
 *
 * アプリ全体で共有する QueryClient を定義する。
 *
 * 仕様:
 *   TQ-001: TanStack Query を導入し、QueryClientProvider をアプリルートに配置する。
 *   RC-002: オフライン中も前回キャッシュを返せるよう networkMode: 'offlineFirst' を設定する。
 */
import { QueryClient } from "@tanstack/react-query";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 300_000,
      retry: 1,
      networkMode: "offlineFirst",
    },
    mutations: {
      retry: 0,
    },
  },
});
