# WebMCP Inspector

A standalone Chrome side panel for inspecting and debugging WebMCP tools, using
copied mcp-use Inspector components. Built with WXT, React, TypeScript, and pnpm.
It has two tabs: **Tools** for running tools by hand, and **Chat** for testing
them through a model backed by Manufact Cloud.

<!--
  Animated preview (assets/webmcp-inspector-demo.webp), generated from the original
  recording at assets/webmcp-inspector-demo.mp4, which stays in the repo.

  A real player with audio would need a <video> tag pointing at a GitHub attachment
  URL, e.g.:
      <video src="https://github.com/user-attachments/assets/<uuid>" controls></video>
  That URL can only be minted by dragging the .mp4 into a PR or issue comment - it
  cannot be derived from a path in the repo. Every <video> variant tried against a
  raw/blob/relative URL was removed by GitHub's markdown sanitizer.
-->
![WebMCP Inspector: opening the side panel, filling in a tool's parameters, executing it, and browsing the page's tools](assets/webmcp-inspector-demo.webp)

## Install

[![Install for Chrome](https://img.shields.io/badge/Install_for_Chrome-Chrome_Web_Store-4285F4?style=flat&logo=googlechrome&logoColor=white)](https://chromewebstore.google.com/detail/webmcp-inspector/dgdidjgjofcenipdfaoebdeeppideadh)

[Install WebMCP Inspector from the Chrome Web Store](https://chromewebstore.google.com/detail/webmcp-inspector/dgdidjgjofcenipdfaoebdeeppideadh).
See the [WebMCP Inspector documentation](https://docs.mcp-use.com/inspector/webmcp-inspector)
for setup details and troubleshooting.

1. Open a WebMCP-enabled website and click the extension toolbar icon.
2. Select a tool, enter parameters, and click **Execute** (or ⌘/Ctrl + Enter).
3. To test the tools in conversation, open **Chat**, click **Sign in with
   Manufact**, and ask the model to use them.

To install unpacked instead, download
[`webmcp-inspector.zip`](https://github.com/mcp-use/webmcp-inspector/releases/latest/download/webmcp-inspector.zip)
— the prebuilt extension from the latest release, refreshed on every merge to
`main`. Unzip it, open `chrome://extensions`, enable **Developer mode**, and
choose **Load unpacked** on the unzipped folder. To build it yourself, see
[Development](#development) below.

WebMCP is experimental. Enable **WebMCP for testing** in `chrome://flags` and
relaunch a compatible Chromium build if the API is unavailable. The extension
shell requires Chrome 116+, but this does not imply WebMCP support in Chrome 116.
Native end-to-end tests currently run against Chrome for Testing 149.0.7827.55.

## Features

- Inspector tool rows with descriptions, parameter counts, and search.
- Schema forms with enums, object/array JSON inputs, required markers, defaults,
  explicit empty values, and JSON Schema validation before execution.
- Raw JSON mode for complex inputs; metadata inspection and payload copying.
- Tool results with timing, errors, copy, a draggable split, and fullscreen mode
  within the side panel. The divider also supports keyboard arrow keys.
- Named saved requests stored locally and scoped to the website's origin.
- Automatic refresh on tool registration/removal events, tab changes, and page loads.
- Light/dark themes, persisted locally.
- A Chat tab ported from the mcp-use Inspector chat. It streams responses from
  Manufact Cloud and exposes the page's WebMCP tools to the model (see below).

There is no MCP Apps rendering or remote MCP server connection.

## Chat with Manufact Cloud

The Chat tab uses the same Manufact Cloud LLM proxy as the mcp-use Inspector
when it runs tools locally. The model runs in the cloud and tool calls run in
the browser:

1. **Sign in.** OAuth 2.1 authorization code with PKCE through
   `chrome.identity.launchWebAuthFlow`. The extension registers itself with
   dynamic client registration, using `https://<extension-id>.chromiumapp.org/manufact`
   as its redirect URI. Tokens are kept in `chrome.storage.local` and refreshed
   before they expire. Refresh tokens rotate, so panels in different windows
   refresh under one Web Lock.
2. **Chat.** Each turn is an OpenAI-compatible Chat Completions request to
   `/api/v1/inspector/llm/chat/completions` with a bearer token. The page's
   tools are sent as functions. Names are sanitized to the OpenAI function-name
   grammar and deduplicated.
3. **Tool calls.** The panel validates each call's arguments against the tool's
   schema and then runs the tool through the same path as **Execute**. Calls
   run one at a time, and each result goes back to the model. A turn is capped
   at 10 model steps. **Stop** aborts the turn; no further tool calls start.

Signing in is required: the proxy has no anonymous tier. Usage is billed to the
user's Manufact organization credits. If the session expires, the tab asks the
user to sign in again. The proxy also reports "login required" for accounts
without an organization. In that case the panel stays signed in if the token
still passes userinfo, and shows a notice instead. If credits run out or the
cloud is unavailable, it also shows a notice. Models come from `/api/v1/models`, and the selected model is
remembered.

Cloud requests are cookieless and carry only the bearer token. Manufact Cloud's
CORS policy does not allow `chrome-extension://` origins, so the manifest grants
the cloud host. Chrome does not apply CORS to extension pages for granted hosts.

## Page access and compatibility

The production manifest requests `sidePanel`, `activeTab`, `scripting`,
`storage`, and `identity` (for Manufact sign-in), plus host access to
`https://cloud.manufact.com/*` only. It does not request broad host permissions. An explicit `action.onClicked` handler opens the panel and grants
access to the current site. Automatic `openPanelOnActionClick` is disabled because
it can open the sidebar without granting `activeTab` (including in Helium). After switching to another site, click the toolbar
icon again. Chrome internal pages and the Chrome Web Store cannot be inspected.

The adapter uses feature detection:

| API | Discovery | Change event | Execution |
| --- | --- | --- | --- |
| `document.modelContext` | `getTools()` | `toolchange` | Native tool object; serialized args before Chrome 155, object args from 155 |
| `navigator.modelContextTesting` | `listTools()` | `toolschanged` | Tool name and serialized args |
| `navigator.modelContext` with discovery support | `getTools()` | Both event names | Native tool object |

Inspection is scoped to the top document. Child-frame tools, cross-origin frame
discovery, and retrieval of results from a new document after declarative form
navigation are not implemented. Navigation invalidates the old document's tools.
A tool call is never automatically retried, because it may already have changed
the page before returning an error. A page's change message can trigger a read;
it cannot ask the extension to execute a tool or write saved requests.

The browser's real document ID and a fresh schema comparison guard execution
against stale tools. Unsupported WebMCP versions show an explicit unavailable
state. The newer document API is covered by adapter tests; the native browser
integration suite exercises the legacy testing API.

## Development

Use Node 22.12+ and pnpm 10.33.0.

```sh
pnpm dev            # WXT development build + hot reload
pnpm typecheck
pnpm test           # Schema and page-adapter regression tests
pnpm test:browser   # Build + real extension/native WebMCP browser tests (incl. chat against a mocked cloud)
pnpm zip           # Production zip in .output
```

For development, load `.output/chrome-mv3-dev` in the browser. To point Chat
at another Manufact Cloud, export `WXT_MANUFACT_CLOUD_URL` (for example
`https://cloud.dev.manufact.com`) in the shell that runs the build. The
manifest's host permission reads the process environment, so setting it only
in `.env` is not enough. WXT browser
auto-launch is disabled so you can use your existing logged-in profile.

The browser suite launches a separate temporary profile. It copies the production
build and adds **test-only localhost permission** to that copy, avoiding toolbar
UI automation for activeTab grants. It tests native registration, validation,
execution, saved request load/delete/persistence, live changes, navigation,
resizing/fullscreen, and narrow layout. The chat suite mocks Manufact Cloud,
streams a tool call, and checks that the call runs the page's real tool and
that the result goes back to the model. Screenshots are written to `artifacts/`.
Set `CHROME_PATH` to a compatible Chrome for Testing executable, or install
Playwright Chromium with `pnpm exec playwright install chromium`.

## Structure

- `entrypoints/background.ts`: native toolbar-to-side-panel behavior.
- `entrypoints/sidepanel/`: React shell and Inspector theme.
- `src/components/`: copied/adapted Inspector controls, list, forms, and results.
- `src/lib/page-api.ts`: self-contained page-world API adapter.
- `src/lib/bridge.ts`: extension scripting and document-scoped requests.
- `src/hooks/useConnection.ts`: connection and live update lifecycle.
- `src/lib/saved-requests.ts`: local storage records.
- `src/components/chat/`: chat UI ported from the Inspector (messages, markdown,
  tool calls, composer).
- `src/lib/chat/`: OpenAI-compatible streaming client, tool loop, transcript
  conversion, WebMCP tool bridge, and cloud error notices.
- `src/lib/manufact-auth.ts`: Manufact OAuth (PKCE + dynamic client registration).
- `THIRD_PARTY_NOTICES.md`: retained mcp-use MIT license and attribution.

No workspace imports or runtime dependency on mcp-use.

## API references

- [Chrome WebMCP imperative API](https://developer.chrome.com/docs/ai/webmcp/imperative-api)
- [GoogleChromeLabs WebMCP tools](https://github.com/GoogleChromeLabs/webmcp-tools)
- [Chrome sidePanel API](https://developer.chrome.com/docs/extensions/reference/api/sidePanel)
