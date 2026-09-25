import { useCallback, useEffect, useRef, useState } from "react";
import { browser } from "wxt/browser";
import { connect } from "../lib/bridge";
import {
  CONNECT_TIMEOUT_MS,
  isActiveTabLoad,
  refreshStart,
  shouldPoll,
  withTimeout,
  type RefreshOptions,
} from "../lib/refresh-policy";
import type { Connection } from "../lib/types";

export function useConnection() {
  const [connection, setConnection] = useState<Connection | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const generation = useRef(0);
  const current = useRef<Connection | null>(null);
  const windowId = useRef<number | undefined>(undefined);
  const activeTabId = useRef<number | undefined>(undefined);
  const inFlight = useRef(false);
  const refresh = useCallback(async (options: RefreshOptions = {}) => {
    const ticket = ++generation.current;
    const { invalidate, show } = refreshStart(options);
    inFlight.current = true;
    if (invalidate) {
      current.current = null;
      setConnection(null);
    }
    if (show) {
      setError("");
      setLoading(true);
    }
    try {
      if (windowId.current === undefined)
        windowId.current = (await browser.windows.getCurrent()).id;
      const [tab] = await browser.tabs.query({
        active: true,
        windowId: windowId.current,
      });
      if (!tab?.id)
        throw new Error(
          "Open a website and click the extension toolbar icon to connect.",
        );
      activeTabId.current = tab.id;
      const next = await withTimeout(
        connect(tab.id),
        CONNECT_TIMEOUT_MS,
        "The page didn’t respond. Retrying…",
      );
      if (ticket !== generation.current) return;
      current.current = next;
      setConnection((previous) =>
        JSON.stringify(previous) === JSON.stringify(next) ? previous : next,
      );
      setError("");
    } catch (error) {
      if (ticket !== generation.current) return;
      current.current = null;
      setConnection(null);
      setError(error instanceof Error ? error.message : String(error));
    } finally {
      if (ticket === generation.current) {
        inFlight.current = false;
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    void refresh();
    const activated = (info: { windowId: number; tabId: number }) => {
      if (info.windowId !== windowId.current) return;
      activeTabId.current = info.tabId;
      void refresh({ invalidate: true });
    };
    const updated = (
      tabId: number,
      change: { status?: string; url?: string },
    ) => {
      if (current.current?.tabId !== tabId) return;
      if (change.status === "loading") {
        ++generation.current;
        inFlight.current = false;
        current.current = null;
        setConnection(null);
        setLoading(true);
      }
    };
    // Query the active tab after its own completed load; activeTab survives same-origin navigations.
    const completed = (tabId: number, change: { status?: string }) => {
      if (
        change.status === "complete" &&
        isActiveTabLoad(activeTabId.current, tabId)
      )
        void refresh();
    };
    const message = (
      msg: unknown,
      sender: { tab?: { id?: number }; documentId?: string },
    ) => {
      if (
        (msg as { type?: string })?.type === "webmcp:access-granted" &&
        !sender.tab
      ) {
        void refresh();
        return;
      }
      if (
        (msg as { type?: string })?.type === "webmcp:changed" &&
        sender.tab?.id === current.current?.tabId &&
        sender.documentId === current.current?.documentId
      )
        void refresh();
    };
    browser.tabs.onActivated.addListener(activated);
    browser.tabs.onUpdated.addListener(updated);
    browser.tabs.onUpdated.addListener(completed);
    browser.runtime.onMessage.addListener(message);
    // Handles APIs/polyfills installed after page load and permission granted by a later toolbar click.
    const interval = setInterval(() => {
      if (
        shouldPoll({ inFlight: inFlight.current, connection: current.current })
      )
        void refresh({ background: true });
    }, 2500);
    return () => {
      ++generation.current;
      clearInterval(interval);
      browser.tabs.onActivated.removeListener(activated);
      browser.tabs.onUpdated.removeListener(updated);
      browser.tabs.onUpdated.removeListener(completed);
      browser.runtime.onMessage.removeListener(message);
    };
  }, [refresh]);
  return { connection, error, loading, refresh };
}
