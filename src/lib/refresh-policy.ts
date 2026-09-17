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

/** Other tabs' loads are irrelevant; before the active tab is known, allow the refresh through. */
export function isActiveTabLoad(
  activeTabId: number | undefined,
  tabId: number,
) {
  return activeTabId === undefined || activeTabId === tabId;
}
