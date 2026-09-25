// Adapted from @mcp-use/agent (llm/toolResultParts.ts); see THIRD_PARTY_NOTICES.md.
import type { ContentPart, ImageContentPart } from "./types";

type Block = { type?: string; [key: string]: any };

const text = (value: string): ContentPart => ({ type: "text", text: value });
const image = (data: string, mimeType: string): ContentPart => ({
  type: "image",
  url: `data:${mimeType};base64,${data}`,
});

/** True when a tool result carries the MCP `isError: true` flag. */
export function isToolResultError(result: unknown): boolean {
  return (
    typeof result === "object" &&
    result !== null &&
    (result as { isError?: unknown }).isError === true
  );
}

function blockToPart(block: Block): ContentPart | null {
  if (!block || typeof block !== "object") return null;
  switch (block.type) {
    case "text":
      return typeof block.text === "string" && block.text
        ? text(block.text)
        : null;
    case "image":
      return typeof block.data === "string" && block.data
        ? image(block.data, block.mimeType || "image/png")
        : null;
    case "audio":
      return text(
        `[audio: ${block.mimeType || "audio/*"}, base64 omitted (${String(block.data ?? "").length} chars)]`,
      );
    case "resource": {
      const r = block.resource ?? {};
      if (typeof r.text === "string" && r.text) return text(r.text);
      if (typeof r.blob === "string" && String(r.mimeType).startsWith("image/"))
        return image(r.blob, r.mimeType);
      return text(
        `[resource: ${r.uri ?? "<unknown>"} (${r.mimeType ?? "unknown"})]`,
      );
    }
    case "resource_link":
      return text(
        `[resource_link${block.name ? ` "${block.name}"` : ""}: ${block.uri ?? "<unknown>"}]`,
      );
    default:
      // Avoid stringifying unknown blocks that may carry large base64 payloads.
      return text(`[unsupported tool content block: ${String(block.type)}]`);
  }
}

/** Convert a WebMCP/MCP tool result into content parts for the model. */
export function extractToolResultParts(result: unknown): ContentPart[] {
  let value = result;
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const { _meta: _ignored, ...rest } = value as Record<string, unknown>;
    value = rest;
  }
  if (typeof value === "string") return value ? [text(value)] : [];
  const record = value as Record<string, unknown> | null;
  if (
    record &&
    typeof record === "object" &&
    (Array.isArray(record.content) || "structuredContent" in record)
  ) {
    const parts: ContentPart[] = [];
    for (const block of (record.content as Block[] | undefined) ?? []) {
      const part = blockToPart(block);
      if (part) parts.push(part);
    }
    if (record.structuredContent !== undefined) {
      try {
        parts.push(
          text(
            `structuredContent: ${JSON.stringify(record.structuredContent)}`,
          ),
        );
      } catch {
        // drop non-serializable structuredContent
      }
    }
    if (record.isError) parts.unshift(text("[tool reported isError=true]"));
    return parts;
  }
  try {
    return [text(JSON.stringify(value) ?? "null")];
  } catch {
    return [text(String(value))];
  }
}

/** A string for text-only results, otherwise content parts (images). */
export function toolResultToContent(result: unknown): string | ContentPart[] {
  const parts = extractToolResultParts(result);
  return parts.every((p) => p.type === "text")
    ? parts.map((p) => (p as { text: string }).text).join("\n")
    : parts;
}

export function partitionToolContent(content: string | ContentPart[]): {
  text: string;
  imageParts: ImageContentPart[];
} {
  if (typeof content === "string") return { text: content, imageParts: [] };
  const texts: string[] = [];
  const imageParts: ImageContentPart[] = [];
  for (const p of content) {
    if (p.type === "text") {
      if (p.text) texts.push(p.text);
    } else imageParts.push(p);
  }
  return { text: texts.join("\n"), imageParts };
}

export function toolImageFollowupHeader(
  toolName: string | undefined,
  count: number,
): string {
  return `(Tool "${toolName ?? "<tool>"}" returned the following image${count === 1 ? "" : "s"}:)`;
}
