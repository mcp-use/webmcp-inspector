import type { ApiKind, Snapshot, Tool } from "./types";

type NativeTool = Tool & { window?: Window };
type Context = EventTarget & {
  getTools?: () => Promise<NativeTool[]>;
  listTools?: () => NativeTool[] | Promise<NativeTool[]>;
  executeTool?: (tool: NativeTool | string, args: unknown) => Promise<unknown>;
};
type PageState = { context?: Context; revision: number; changed: () => void };
export type PageCommand =
  | { action: "list" }
  | {
      action: "execute";
      name: string;
      args: Record<string, unknown>;
      schema: string;
    };

/** Runs in the inspected document's MAIN world. Keep self-contained: Chrome serializes this function. */
export async function pageCommand(
  command: PageCommand,
): Promise<
  | { ok: true; snapshot?: Snapshot; value?: unknown }
  | { ok: false; error: string }
> {
  try {
    const host = window as Window & { __mcpUseInspectorV1?: PageState };
    const doc = document as Document & { modelContext?: Context };
    const nav = navigator as Navigator & {
      modelContext?: Context;
      modelContextTesting?: Context;
    };
    const context = doc.modelContext?.getTools
      ? doc.modelContext
      : nav.modelContextTesting?.listTools
        ? nav.modelContextTesting
        : nav.modelContext?.getTools
          ? nav.modelContext
          : undefined;
    const api: ApiKind = !context
      ? "unavailable"
      : context === doc.modelContext
        ? "document"
        : context === nav.modelContextTesting
          ? "testing"
          : "navigator";
    if (!host.__mcpUseInspectorV1) {
      host.__mcpUseInspectorV1 = {
        revision: 0,
        changed: () => {
          host.__mcpUseInspectorV1!.revision++;
          window.postMessage(
            { source: "mcp-use-webmcp", event: "tools-changed" },
            location.origin,
          );
        },
      };
    }
    const state = host.__mcpUseInspectorV1;
    if (state.context !== context) {
      for (const event of ["toolchange", "toolschanged"]) {
        state.context?.removeEventListener?.(event, state.changed);
        context?.addEventListener?.(event, state.changed);
      }
      state.context = context;
      state.revision++;
    }
    const rawTools = context
      ? await (context.getTools?.() ?? context.listTools?.() ?? [])
      : [];
    // Deliberately inspect the top document. Never guess which frame owns a same-named tool.
    const localTools = rawTools.filter(
      (tool) => !tool.window || tool.window === window,
    );
    const tools: Tool[] = localTools.map((tool) => ({
      name: tool.name,
      description: tool.description,
      inputSchema:
        typeof tool.inputSchema === "string"
          ? JSON.parse(tool.inputSchema)
          : (tool.inputSchema ?? { type: "object", properties: {} }),
      ...(tool.annotations ? { annotations: tool.annotations } : {}),
    }));
    if (command.action === "list") {
      return {
        ok: true,
        snapshot: {
          tools,
          api,
          revision: state.revision,
          url: location.href,
          title: document.title,
        },
      };
    }
    if (!context?.executeTool)
      throw new Error("WebMCP execution is unavailable on this page.");
    const index = localTools.findIndex((tool) => tool.name === command.name);
    if (index < 0)
      throw new Error("This tool was removed. Refresh the tool list.");
    // Extension messaging may reorder object keys. Compare schemas structurally.
    const canonical = (value: unknown): string =>
      JSON.stringify(value, (_, item) =>
        item && typeof item === "object" && !Array.isArray(item)
          ? Object.fromEntries(
              Object.keys(item)
                .sort()
                .map((key) => [key, item[key]]),
            )
          : item,
      );
    if (
      canonical(tools[index]!.inputSchema) !==
      canonical(JSON.parse(command.schema))
    ) {
      throw new Error(
        "This tool’s parameters changed. Reopen it before executing.",
      );
    }
    // Chrome <155 accepts serialized arguments. Do not retry a failed execution:
    // a tool may already have produced side effects before throwing.
    const version = Number(
      navigator.userAgent.match(/(?:Chrome|Chromium)\/(\d+)/)?.[1] ?? 155,
    );
    const args =
      api === "testing" || version < 155
        ? JSON.stringify(command.args)
        : command.args;
    const value = await context.executeTool(
      api === "testing" ? command.name : localTools[index]!,
      args,
    );
    return { ok: true, value: value === undefined ? null : value };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/** The page can only announce changes, never request extension actions or tool execution. */
export function installRelay() {
  const host = globalThis as typeof globalThis & {
    __mcpUseRelay?: boolean;
    chrome: {
      runtime: { sendMessage: (message: unknown) => Promise<unknown> };
    };
  };
  if (host.__mcpUseRelay) return;
  host.__mcpUseRelay = true;
  let timer: ReturnType<typeof setTimeout>;
  window.addEventListener("message", (event) => {
    if (
      event.source !== window ||
      event.origin !== location.origin ||
      event.data?.source !== "mcp-use-webmcp" ||
      event.data?.event !== "tools-changed"
    )
      return;
    clearTimeout(timer);
    timer = setTimeout(() => {
      void host.chrome.runtime
        .sendMessage({ type: "webmcp:changed" })
        .catch(() => {});
    }, 80);
  });
}
