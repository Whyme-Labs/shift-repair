import { useCallback, useEffect, useRef, useState } from "react";
import { errorMessage, isStaleError } from "./api";
import type { AppProps, BoardResponse, BoardView, StartPolling } from "./types";

const browserPolling: StartPolling = (refresh, intervalMs) => {
  const timer = setInterval(refresh, intervalMs);
  return () => clearInterval(timer);
};

function boardFrom(response: BoardResponse, allowEmpty: boolean): BoardView | null {
  if (response && Object.hasOwn(response, "board")) {
    if (allowEmpty && response.board === null) return null;
    if (response.board && typeof response.board.id === "string" && Number.isInteger(response.board.revision) && response.board.roster && typeof response.board.can_undo === "boolean") return response.board;
  }
  throw new Error("The backend returned an unsupported board response. Check that the agent and Desktop parts of ShiftRepair use the same version.");
}

export function useBoard({ rest, getScopeKey, subscribe, startPolling = browserPolling }: Pick<AppProps, "rest" | "getScopeKey" | "subscribe" | "startPolling">) {
  const [board, setBoard] = useState<BoardView | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const alive = useRef(false);
  const operation = useRef<{ scope: string } | null>(null);
  const request = useRef(0);
  const scope = useRef(getScopeKey?.() ?? "local");
  const ready = useRef(false);
  const pendingRead = useRef<{ scope: string; ticket: number; promise: Promise<boolean> } | null>(null);
  const refreshAfterWrite = useRef(false);

  const currentScope = useCallback(() => getScopeKey?.() ?? "local", [getScopeKey]);
  const isCurrent = useCallback(() => alive.current && ready.current && scope.current === currentScope(), [currentScope]);

  const syncScope = useCallback(() => {
    const next = currentScope();
    if (scope.current !== next) {
      scope.current = next;
      ++request.current;
      pendingRead.current = null;
      operation.current = null;
      refreshAfterWrite.current = false;
      ready.current = false;
      setBoard(null);
      setBusy(null);
      setNotice(null);
      setError(null);
      setConnectionError(null);
      setLoading(true);
    }
    return next;
  }, [currentScope]);

  const refresh = useCallback((quiet = false, recovery = false): Promise<boolean> => {
    if (!alive.current) return Promise.resolve(false);
    const nextScope = syncScope();
    if (operation.current && !recovery) {
      refreshAfterWrite.current = true;
      return Promise.resolve(false);
    }
    if (pendingRead.current?.scope === nextScope) return pendingRead.current.promise;
    const ticket = ++request.current;
    if (!quiet) setLoading(true);
    const current = () => alive.current && ticket === request.current && nextScope === scope.current && nextScope === currentScope();
    const promise = (async () => {
      try {
        const response = await rest<BoardResponse>("/board");
        if (!current()) return false;
        const nextBoard = boardFrom(response, true);
        ready.current = true;
        setBoard(nextBoard);
        setConnectionError(null);
        return true;
      } catch (caught) {
        if (current()) {
          ready.current = false;
          setConnectionError(errorMessage(caught));
        }
        return false;
      } finally {
        if (pendingRead.current?.ticket === ticket) pendingRead.current = null;
        if (current()) setLoading(false);
      }
    })();
    pendingRead.current = { scope: nextScope, ticket, promise };
    return promise;
  }, [rest, currentScope, syncScope]);

  useEffect(() => {
    alive.current = true;
    void refresh();
    const stopPolling = startPolling(() => void refresh(true), 3000);
    const unsubscribe = subscribe?.(() => void refresh(true));
    return () => {
      alive.current = false;
      ++request.current;
      pendingRead.current = null;
      operation.current = null;
      stopPolling();
      unsubscribe?.();
    };
  }, [refresh, subscribe, startPolling]);

  const mutate = useCallback(async (path: string, body: unknown, action: string, success?: string): Promise<boolean> => {
    if (!alive.current) return false;
    const capturedScope = syncScope();
    if (operation.current) return false;
    if (!isCurrent()) {
      setError("Refresh the current schedule before making a change.");
      await refresh();
      return false;
    }
    const currentOperation = { scope: capturedScope };
    operation.current = currentOperation;
    ++request.current;
    pendingRead.current = null;
    ready.current = false;
    setBusy(action);
    setLoading(false);
    setError(null);
    setNotice(null);
    const current = () => alive.current && operation.current === currentOperation && capturedScope === scope.current && capturedScope === currentScope();
    try {
      const response = await rest<BoardResponse>(path, { method: "POST", body, timeoutMs: 30000 });
      if (!current()) return false;
      const nextBoard = boardFrom(response, false);
      ready.current = true;
      setBoard(nextBoard);
      setConnectionError(null);
      if (success) setNotice(success);
      return true;
    } catch (caught) {
      if (!current()) return false;
      // Hold the write lock until the recovery read settles. A timed-out request
      // may already have committed, and another edit must not race this reload.
      setBusy("Refreshing schedule");
      const recovered = await refresh(true, true);
      if (current()) {
        setError(isStaleError(caught)
          ? recovered
            ? "Someone changed this schedule while you were working. The current version is loaded. Review it, then try your change again."
            : "Someone changed this schedule while you were working. The current version could not be loaded. Refresh before making another change."
          : errorMessage(caught));
      }
      return false;
    } finally {
      if (current()) {
        operation.current = null;
        setBusy(null);
        if (refreshAfterWrite.current) {
          refreshAfterWrite.current = false;
          void refresh(true);
        }
      } else if (alive.current && capturedScope !== currentScope()) {
        void refresh();
      }
    }
  }, [rest, isCurrent, currentScope, syncScope, refresh]);

  return { board, loading, busy, error, connectionError, notice, refresh, mutate, isCurrent, setError, setNotice };
}
