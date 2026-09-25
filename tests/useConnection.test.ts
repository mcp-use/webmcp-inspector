import { expect, it, vi } from "vitest";
import {
  isActiveTabLoad,
  refreshStart,
  shouldPoll,
  withTimeout,
} from "../src/lib/refresh-policy";
import type { Connection } from "../src/lib/types";

const connected = {
  api: "document",
  tools: [],
  url: "https://example.com/",
  title: "Example",
  revision: 1,
  tabId: 1,
  documentId: "doc",
} satisfies Connection;

it("keeps a background poll from repainting an existing error", () => {
  expect(refreshStart({ background: true })).toEqual({
    invalidate: false,
    show: false,
  });
});

it("does not poll while an attempt is in flight", () => {
  expect(shouldPoll({ inFlight: true, connection: null })).toBe(false);
  expect(
    shouldPoll({
      inFlight: true,
      connection: { ...connected, api: "unavailable" },
    }),
  ).toBe(false);
  expect(shouldPoll({ inFlight: false, connection: null })).toBe(true);
  expect(
    shouldPoll({
      inFlight: false,
      connection: { ...connected, api: "unavailable" },
    }),
  ).toBe(true);
  expect(shouldPoll({ inFlight: false, connection: connected })).toBe(false);
});

it("clears the previous error on a foreground refresh so loading can render", () => {
  expect(refreshStart()).toEqual({ invalidate: false, show: true });
  expect(refreshStart({ invalidate: true })).toEqual({
    invalidate: true,
    show: true,
  });
});

it("ignores completed loads from other tabs, but not before the active tab is known", () => {
  expect(isActiveTabLoad(undefined, 7)).toBe(true);
  expect(isActiveTabLoad(7, 7)).toBe(true);
  expect(isActiveTabLoad(7, 8)).toBe(false);
});

it("times out a connect attempt that never settles", async () => {
  vi.useFakeTimers();
  try {
    const hung = withTimeout(new Promise(() => {}), 1000, "No response");
    const settled = expect(hung).rejects.toThrow("No response");
    await vi.advanceTimersByTimeAsync(1000);
    await settled;
    await expect(withTimeout(Promise.resolve(7), 1000, "x")).resolves.toBe(7);
  } finally {
    vi.useRealTimers();
  }
});
