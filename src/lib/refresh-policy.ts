import type { Connection } from "./types";

export interface RefreshOptions {
  invalidate?: boolean;
  background?: boolean;
}

/** A background poll must not repaint the panel: no spinner, and any existing error stays put. */
export function refreshStart(options: RefreshOptions = {}) {
  return {
    invalidate: options.invalidate === true,
    show: options.background !== true,
  };
}

/** Skipped while an attempt is in flight, so the poll cannot discard its own pending result. */
export function shouldPoll(state: {
  inFlight: boolean;
  connection: Connection | null;
}) {
  if (state.inFlight) return false;
  return !state.connection || state.connection.api === "unavailable";
}

/**
 * Longest a connect attempt may take. The poll waits for the attempt in flight,
 * so one that never settles (a page whose getTools() never resolves) would
 * otherwise stop reconnection for good. Generous because executeScript waits
 * for the document to be idle.
 */
export const CONNECT_TIMEOUT_MS = 10_000;

/** Reject when `promise` has not settled within `ms`. The late result is ignored. */
export function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  message: string,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error(message)), ms);
    }),
  ]).finally(() => clearTimeout(timer));
}

/** Other tabs' loads are irrelevant; before the active tab is known, allow the refresh through. */
export function isActiveTabLoad(
  activeTabId: number | undefined,
  tabId: number,
) {
  return activeTabId === undefined || activeTabId === tabId;
}
