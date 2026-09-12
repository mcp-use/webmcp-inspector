import { beforeEach, expect, it, vi } from "vitest";
const api = vi.hoisted(() => ({
  sidePanel: {
    setPanelBehavior: vi.fn(async () => {}),
    open: vi.fn(async () => {}),
  },
  runtime: {
    onInstalled: { addListener: vi.fn() },
    onStartup: { addListener: vi.fn() },
    sendMessage: vi.fn(async () => {}),
  },
  action: { onClicked: { addListener: vi.fn() } },
}));
vi.mock("wxt/browser", () => ({ browser: api }));
vi.mock("wxt/utils/define-background", () => ({
  defineBackground: (main: () => void) => main,
}));
import background from "../entrypoints/background";
beforeEach(() => vi.clearAllMocks());
it("opens synchronously from the action gesture and notifies an existing panel after opening", async () => {
  (background as unknown as () => void)();
  expect(api.sidePanel.setPanelBehavior).toHaveBeenCalledWith({
    openPanelOnActionClick: false,
  });
  const click = api.action.onClicked.addListener.mock.calls[0]![0] as (tab: {
    id: number;
    windowId: number;
  }) => void;
  click({ id: 42, windowId: 7 });
  // open must happen before any promise turn to retain Chrome's user gesture.
  expect(api.sidePanel.open).toHaveBeenCalledWith({ windowId: 7 });
  expect(api.runtime.sendMessage).not.toHaveBeenCalled();
  await Promise.resolve();
  expect(api.runtime.sendMessage).toHaveBeenCalledWith({
    type: "webmcp:access-granted",
  });
});
