import { browser } from "wxt/browser";
import { installRelay, pageCommand } from "./page-api";
import type { Connection, Execution, Tool } from "./types";

export async function connect(tabId: number): Promise<Connection> {
  await browser.scripting.executeScript({
    target: { tabId, frameIds: [0] },
    func: installRelay,
    world: "ISOLATED",
  });
  const [result] = await browser.scripting.executeScript({
    target: { tabId, frameIds: [0] },
    world: "MAIN",
    func: pageCommand,
    args: [{ action: "list" }],
  });
  if (!result?.result?.ok)
    throw new Error(
      result?.result && !result.result.ok
        ? result.result.error
        : "Cannot read this page.",
    );
  if (!result.documentId || !result.result.snapshot)
    throw new Error("Page changed while connecting. Try again.");
  return { ...result.result.snapshot, tabId, documentId: result.documentId };
}

export async function execute(
  connection: Connection,
  tool: Tool,
  args: Record<string, unknown>,
): Promise<Execution> {
  const started = performance.now();
  const [result] = await browser.scripting.executeScript({
    target: { tabId: connection.tabId, documentIds: [connection.documentId] },
    world: "MAIN",
    func: pageCommand,
    args: [
      {
        action: "execute",
        name: tool.name,
        args,
        schema: JSON.stringify(tool.inputSchema),
      },
    ],
  });
  if (!result?.result?.ok)
    throw new Error(
      result?.result && !result.result.ok
        ? result.result.error
        : "The page navigated or closed during execution.",
    );
  let value = result.result.value;
  if (typeof value === "string") {
    try {
      value = JSON.parse(value);
    } catch {
      /* Plain text is a valid result. */
    }
  }
  return {
    value,
    elapsed: performance.now() - started,
    isError: !!(
      value &&
      typeof value === "object" &&
      "isError" in value &&
      value.isError
    ),
  };
}
