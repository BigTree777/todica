import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";

export function useForegroundReset(mode: "local" | "server"): void {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (mode !== "local") {
      return;
    }

    const handleVisibilityChange = () => {
      if (document.visibilityState !== "visible") {
        return;
      }

      void (async () => {
        try {
          const { getDb } = await import("../repositories/local-db.js");
          const { LocalResetUsecase } = await import("../usecases/local-reset-usecase.js");
          await new LocalResetUsecase(await getDb()).runIfNeeded(new Date());
          await queryClient.invalidateQueries();
        } catch (err: unknown) {
          console.error("[useForegroundReset] reset failed on visibilitychange:", err);
        }
      })();
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [mode, queryClient]);
}
