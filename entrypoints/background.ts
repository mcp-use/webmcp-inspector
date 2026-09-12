import { browser } from "wxt/browser";
import { defineBackground } from "wxt/utils/define-background";

export default defineBackground(() => {
  const configureSidePanel = () => {
    void browser.sidePanel
      // Automatic side-panel opening does not grant activeTab in Chromium.
      // Handle the action explicitly so the browser grants access first.
      .setPanelBehavior({ openPanelOnActionClick: false })
      .catch((error: unknown) =>
        console.error("Could not configure the side panel", error),
      );
  };

  browser.runtime.onInstalled.addListener(configureSidePanel);
  browser.runtime.onStartup.addListener(configureSidePanel);
  configureSidePanel();

  browser.action.onClicked.addListener((tab) => {
    if (tab.id === undefined) return;
    // Keep open() synchronous with the toolbar gesture (no preceding await).
    void browser.sidePanel
      .open({ windowId: tab.windowId })
      .then(() => {
        // An already-open panel should retry immediately with the new grant.
        void browser.runtime
          .sendMessage({ type: "webmcp:access-granted" })
          .catch(() => {});
      })
      .catch((error: unknown) =>
        console.error("Could not open the side panel", error),
      );
  });
});
