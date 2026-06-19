import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { createElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useForegroundReset } from "./use-foreground-reset.js";

const mocks = vi.hoisted(() => ({
  getDb: vi.fn(),
  runIfNeeded: vi.fn(),
  LocalResetUsecase: vi.fn(),
}));

vi.mock("@capacitor-community/sqlite", () => ({
  CapacitorSQLite: {},
  SQLiteConnection: vi.fn(),
}));

vi.mock("../repositories/local-db.js", () => ({
  getDb: mocks.getDb,
}));

vi.mock("../usecases/local-reset-usecase.js", () => ({
  LocalResetUsecase: mocks.LocalResetUsecase,
}));

function createWrapper(queryClient: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return createElement(QueryClientProvider, { client: queryClient }, children);
  };
}

function setVisibilityState(value: DocumentVisibilityState): void {
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    value,
  });
}

describe("useForegroundReset", () => {
  let queryClient: QueryClient;
  let invalidateQueries: ReturnType<typeof vi.spyOn>;
  const db = { query: vi.fn() };

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
    invalidateQueries = vi.spyOn(queryClient, "invalidateQueries").mockResolvedValue();
    mocks.getDb.mockReset();
    mocks.getDb.mockResolvedValue(db);
    mocks.runIfNeeded.mockReset();
    mocks.runIfNeeded.mockResolvedValue(undefined);
    mocks.LocalResetUsecase.mockReset();
    mocks.LocalResetUsecase.mockImplementation(function MockLocalResetUsecase() {
      return {
        runIfNeeded: mocks.runIfNeeded,
      };
    });
    setVisibilityState("hidden");
  });

  it("mode='local': visible への visibilitychange でリセットして全クエリを invalidate する", async () => {
    const wrapper = createWrapper(queryClient);
    renderHook(() => useForegroundReset("local"), { wrapper });

    act(() => {
      setVisibilityState("visible");
      document.dispatchEvent(new Event("visibilitychange"));
    });

    await waitFor(() => expect(mocks.runIfNeeded).toHaveBeenCalledTimes(1));
    expect(mocks.getDb).toHaveBeenCalledTimes(1);
    expect(mocks.LocalResetUsecase).toHaveBeenCalledWith(db);
    expect(mocks.runIfNeeded.mock.calls[0]?.[0]).toBeInstanceOf(Date);
    expect(invalidateQueries).toHaveBeenCalledTimes(1);
    expect(invalidateQueries).toHaveBeenCalledWith();
  });

  it("mode='server': visibilitychange でもリセットしない", async () => {
    const wrapper = createWrapper(queryClient);
    renderHook(() => useForegroundReset("server"), { wrapper });

    act(() => {
      setVisibilityState("visible");
      document.dispatchEvent(new Event("visibilitychange"));
    });

    await Promise.resolve();
    expect(mocks.runIfNeeded).not.toHaveBeenCalled();
    expect(mocks.getDb).not.toHaveBeenCalled();
    expect(invalidateQueries).not.toHaveBeenCalled();
  });
});
