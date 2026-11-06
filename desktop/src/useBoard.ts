import { useCallback, useEffect, useRef, useState } from "react";
import { errorMessage, isStaleError } from "./api";
import type { AppProps, BoardResponse, BoardView } from "./types";

export function useBoard({ rest, getScopeKey, subscribe }: Pick<AppProps, "rest" | "getScopeKey" | "subscribe">) {
  const [board, setBoard] = useState<BoardView | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const alive = useRef(true);
  const operation = useRef(false);
  const request = useRef(0);
  const scope = useRef(getScopeKey?.() ?? "local");
  const currentBoard = useRef<BoardView | null>(null);

  const refresh = useCallback(async (quiet = false) => {
    if (operation.current) return;
    const nextScope = getScopeKey?.() ?? "local";
    if (scope.current !== nextScope) {
      scope.current = nextScope;
      currentBoard.current = null;
      setBoard(null);
      setNotice(null);
      setError(null);
      quiet = false;
    }
    const ticket = ++request.current;
    if (!quiet) setLoading(true);
    try {
      const response = await rest<BoardResponse>("/board");
      if (!alive.current || ticket !== request.current || nextScope !== (getScopeKey?.() ?? "local")) return;
      currentBoard.current = response.board;
      setBoard(response.board);
      setConnectionError(null);
    } catch (error) {
      if (alive.current && ticket === request.current) setConnectionError(errorMessage(error));
    } finally {
      if (alive.current && ticket === request.current) setLoading(false);
    }
  }, [rest, getScopeKey]);

  useEffect(() => {
    alive.current = true;
    void refresh();
    const timer = setInterval(() => void refresh(true), 3000);
    const unsubscribe = subscribe?.(() => void refresh(true));
    return () => {
      alive.current = false;
      ++request.current;
      clearInterval(timer);
      unsubscribe?.();
    };
  }, [refresh, subscribe]);

  const mutate = useCallback(async (path: string, body: unknown, action: string, success?: string): Promise<boolean> => {
    if (operation.current) return false;
    const capturedScope = getScopeKey?.() ?? "local";
    if (capturedScope !== scope.current) {
      setError("The active Hermes connection changed. Review the current schedule before trying again.");
      await refresh();
      return false;
    }
    operation.current = true;
    ++request.current;
    setBusy(action);
    setLoading(false);
    setError(null);
    setNotice(null);
    let failure: unknown;
    try {
      const response = await rest<BoardResponse>(path, { method: "POST", body, timeoutMs: 30000 });
      if (!alive.current || capturedScope !== (getScopeKey?.() ?? "local")) return false;
      currentBoard.current = response.board;
      setBoard(response.board);
      setConnectionError(null);
      if (success) setNotice(success);
      return true;
    } catch (caught) {
      failure = caught;
      return false;
    } finally {
      operation.current = false;
      if (alive.current) {
        setBusy(null);
        if (failure) {
          // A timeout can leave a successful server write. Reload before another edit.
          await refresh(true);
          setError(isStaleError(failure)
            ? "Someone changed this schedule while you were working. The current version is loaded. Review it, then try your change again."
            : errorMessage(failure));
        } else if (capturedScope !== (getScopeKey?.() ?? "local")) {
          await refresh();
        }
      }
    }
  }, [rest, getScopeKey, refresh]);

  return { board, loading, busy, error, connectionError, notice, refresh, mutate, setError, setNotice };
}
