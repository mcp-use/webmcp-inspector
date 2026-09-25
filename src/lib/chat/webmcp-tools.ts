import { validateArgs } from "../arguments";
import type { Connection, Execution, Tool } from "../types";
import type { ProviderTool } from "./types";

const MAX_NAME = 64;

/** OpenAI function names must match ^[a-zA-Z0-9_-]{1,64}$; WebMCP names are free-form. */
export function sanitizeToolName(name: string): string {
  const cleaned = name.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, MAX_NAME);
  return cleaned || "tool";
}

export interface ChatToolset {
  tools: ProviderTool[];
  /** Model-facing name → WebMCP tool name. */
  names: Map<string, string>;
}

/** Expose the page's WebMCP tools as model functions, deduplicating sanitized names. */
export function buildToolset(tools: Tool[]): ChatToolset {
  const names = new Map<string, string>();
  const provider: ProviderTool[] = [];
  for (const tool of tools) {
    const base = sanitizeToolName(tool.name);
    let name = base;
    for (let n = 2; names.has(name); n++) {
      const suffix = `_${n}`;
      name = `${base.slice(0, MAX_NAME - suffix.length)}${suffix}`;
    }
    names.set(name, tool.name);
    const schema =
      tool.inputSchema && typeof tool.inputSchema === "object"
        ? tool.inputSchema
        : {};
    provider.push({
      name,
      description: tool.description,
      inputSchema: { type: "object", properties: {}, ...schema },
    });
  }
  return { tools: provider, names };
}

export function systemPrompt(connection: Connection): string {
  return [
    "You are an assistant inside the WebMCP Inspector browser extension, helping a developer test the WebMCP tools registered by the web page open in their current tab.",
    `Page title: ${connection.title || "(untitled)"}`,
    `Page URL: ${connection.url}`,
    "The available functions are that page's WebMCP tools. Calling one runs it in the live page and may change what the user sees.",
    "Use the tools when they help answer the request, and summarize what each call did. If a tool fails, explain the error.",
  ].join("\n");
}

type Execute = (
  connection: Connection,
  tool: Tool,
  args: Record<string, unknown>,
) => Promise<Execution>;

/**
 * Run a model tool call against the page's current document. Arguments are
 * validated against the tool's schema first so the model can correct itself
 * without the page seeing invalid input.
 */
export async function callWebMcpTool(
  connection: Connection | null,
  toolset: ChatToolset,
  name: string,
  args: Record<string, unknown>,
  execute: Execute,
): Promise<unknown> {
  if (!connection) throw new Error("The page is no longer connected.");
  const original = toolset.names.get(name) ?? name;
  const tool = connection.tools.find((t) => t.name === original);
  if (!tool)
    throw new Error(`Tool "${original}" is not available on the current page.`);
  const errors = validateArgs(tool.inputSchema, args);
  if (errors.length)
    return {
      isError: true,
      content: [
        { type: "text", text: `Invalid arguments:\n${errors.join("\n")}` },
      ],
    };
  return (await execute(connection, tool, args)).value;
}
