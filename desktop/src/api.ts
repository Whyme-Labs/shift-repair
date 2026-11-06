import type { Rest } from "./types";

export class ApiError extends Error {
  constructor(message: string, public readonly status?: number, public readonly code?: string) {
    super(message);
    this.name = "ApiError";
  }
}

export function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "string" && error) return error;
  return "The request could not be completed. Check the connection and try again.";
}

export function isStaleError(error: unknown): boolean {
  return error instanceof ApiError && error.status === 409 || /stale|revision|changed since|conflict/i.test(errorMessage(error));
}

export function normalizeSdkError(error: unknown): Error {
  const message = errorMessage(error);
  const start = message.indexOf("{");
  if (start >= 0) {
    try {
      const data = JSON.parse(message.slice(start)) as { detail?: { code?: string; message?: string } };
      if (data.detail?.message) {
        const status = error && typeof error === "object" && "statusCode" in error ? Number(error.statusCode) : undefined;
        return new ApiError(data.detail.message, status, data.detail.code);
      }
    } catch { /* Preserve the original error if the transport did not carry JSON. */ }
  }
  return error instanceof Error ? error : new Error(message);
}

export function createFetchRest(base = "/api/plugins/shiftrepair", fetcher: typeof fetch = fetch): Rest {
  return async <T>(path: string, options = {}): Promise<T> => {
    const { method = "GET", body, timeoutMs = 15000 } = options as Parameters<Rest>[1] & {};
    if (!path.startsWith("/") || path.includes("..") || path.startsWith("//")) throw new ApiError("Invalid plugin route.");
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetcher(`${base}${path}`, {
        method, credentials: "same-origin", signal: controller.signal,
        headers: { Accept: "application/json", ...(body === undefined ? {} : { "Content-Type": "application/json" }) },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const payload: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        const detail = payload && typeof payload === "object" && "detail" in payload ? payload.detail : undefined;
        const info = detail && typeof detail === "object" ? detail as { message?: string; code?: string } : undefined;
        throw new ApiError(info?.message || (typeof detail === "string" ? detail : `Request failed with HTTP ${response.status}.`), response.status, info?.code);
      }
      if (payload === null) throw new ApiError("The backend returned an empty response.");
      return payload as T;
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") throw new ApiError("The backend did not answer in time. Refresh before retrying a change.");
      throw error;
    } finally {
      clearTimeout(timer);
    }
  };
}
