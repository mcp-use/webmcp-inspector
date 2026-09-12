# Extension tooling decision

Researched September 12, 2026. Decision: WXT + React + TypeScript + pnpm.

## Does a side panel require a framework?

No. Chrome's native Manifest V3 `side_panel.default_path` points to an ordinary
HTML page. The `sidePanel` permission and `chrome.sidePanel` API provide the
sidebar. React handles our UI; WXT handles building and developing the extension.
WXT is not a separate sidebar implementation and does not replace Chrome APIs.

## Options

| Option | Benefits | Tradeoff for this project |
| --- | --- | --- |
| Plain MV3 + Vite | Explicit native manifest, little extension-specific abstraction | We own extension entry bundling, reload behavior, and packaging |
| Vite + CRXJS | Thin plugin, manifest-driven entries, React/content script HMR, side panel starter | Good lighter alternative; packaging/runner setup depends on the chosen template/plugins |
| WXT | Dedicated sidepanel entrypoint, Vite-based UI workflow, background/content entry handling, built-in build/zip workflow | File conventions and generated manifest; a pre-1.0 build-tool dependency |
| Plasmo | React-oriented extension framework | Its Parcel-based stack adds a different toolchain from our existing Vite UI workflow |

The WXT choice is project-specific, not a claim that the other options cannot
implement this. Its development workflow earns the small layer of conventions.
CRXJS would also be reasonable if we wanted to own the manifest and more build
configuration directly. The framework used for the user's previous extension has not been confirmed.

## Native side panel integration

WXT recognizes `entrypoints/sidepanel/index.html` and emits `sidepanel.html` plus
the `side_panel` manifest entry. The background entry calls
`browser.sidePanel.setPanelBehavior({ openPanelOnActionClick: false })` and opens
the panel synchronously from `browser.action.onClicked`. This explicit toolbar
gesture grants `activeTab`; automatic sidebar opening did not grant it in Helium. No action popup is registered.

The panel's page is an extension document, separate from the inspected page.
Later, a content script will call the page's WebMCP APIs and exchange typed
messages with the UI. A framework does not solve WebMCP version compatibility,
tab navigation, frame permissions, or stale tool identity.

## Standalone code reuse

Keep this as an independent repository under `$DEV/webmcp-inspector`, using pnpm.
Adapt selected Inspector UI components and theme primitives, preserving any
applicable licensing notices. Avoid local filesystem imports or `workspace:`
dependencies back into mcp-use. Do not pull the entire MCP server/client UI into
the extension merely to reuse the tool list.

## Sources

- [Chrome sidePanel API](https://developer.chrome.com/docs/extensions/reference/api/sidePanel)
- [WXT entrypoints: side panel](https://wxt.dev/guide/essentials/entrypoints#side-panel)
- [WXT installation and build commands](https://wxt.dev/guide/installation.html)
- [WXT frontend frameworks](https://wxt.dev/guide/essentials/frontend-frameworks.html)
- [WXT browser startup](https://wxt.dev/guide/essentials/config/browser-startup.html)
- [CRXJS starter including sidepanel](https://crxjs.dev/guide/installation/create-crxjs/)
- [CRXJS content script HMR](https://crxjs.dev/concepts/content/)
- [CRXJS packaging](https://crxjs.dev/guide/packaging/)
- [Plasmo repository](https://github.com/PlasmoHQ/plasmo)
- [WebMCP API](https://developer.chrome.com/docs/ai/webmcp/imperative-api)
