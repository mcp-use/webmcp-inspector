import { afterEach, describe, expect, it, vi } from "vitest";
import { pageCommand } from "../src/lib/page-api";
const tool = {
  name: "test",
  description: "Test",
  inputSchema: { type: "object", properties: {} },
};
function setup(kind: "modern" | "legacy", version: number) {
  const context = Object.assign(new EventTarget(), {
    getTools: vi.fn(async () => [tool]),
    listTools: vi.fn(() => [tool]),
    executeTool: vi.fn(async () => "result"),
  });
  const win = { postMessage: vi.fn() };
  vi.stubGlobal("window", win);
  vi.stubGlobal("document", {
    title: "Test page",
    ...(kind === "modern" ? { modelContext: context } : {}),
  });
  vi.stubGlobal("navigator", {
    userAgent: `Chrome/${version}.0`,
    ...(kind === "legacy" ? { modelContextTesting: context } : {}),
  });
  vi.stubGlobal("location", {
    href: "https://example.com/",
    origin: "https://example.com",
  });
  return { context, win };
}
afterEach(() => vi.unstubAllGlobals());
describe("page bridge compatibility and execution safety", () => {
  it("passes a native tool object and object arguments on current Chrome", async () => {
    const { context } = setup("modern", 155);
    expect(
      await pageCommand({
        action: "execute",
        name: "test",
        args: {},
        schema: JSON.stringify(tool.inputSchema),
      }),
    ).toEqual({ ok: true, value: "result" });
    expect(context.executeTool).toHaveBeenCalledWith(tool, {});
  });
  it("serializes arguments for pre-155 document API and legacy testing API", async () => {
    for (const kind of ["modern", "legacy"] as const) {
      const { context } = setup(kind, 149);
      await pageCommand({
        action: "execute",
        name: "test",
        args: {},
        schema: JSON.stringify(tool.inputSchema),
      });
      expect(context.executeTool).toHaveBeenCalledWith(
        kind === "legacy" ? "test" : tool,
        "{}",
      );
    }
  });
  it("listens to both event names once and increments revision", async () => {
    const { context, win } = setup("modern", 155);
    await pageCommand({ action: "list" });
    await pageCommand({ action: "list" });
    context.dispatchEvent(new Event("toolchange"));
    context.dispatchEvent(new Event("toolschanged"));
    expect(win.postMessage).toHaveBeenCalledTimes(2);
    const result = await pageCommand({ action: "list" });
    expect(result.ok && result.snapshot?.revision).toBe(3);
  });
  it("refuses removed or changed schemas without executing", async () => {
    const { context } = setup("modern", 155);
    expect(
      (
        await pageCommand({
          action: "execute",
          name: "missing",
          args: {},
          schema: "{}",
        })
      ).ok,
    ).toBe(false);
    expect(
      (
        await pageCommand({
          action: "execute",
          name: "test",
          args: {},
          schema: "{}",
        })
      ).ok,
    ).toBe(false);
    expect(context.executeTool).not.toHaveBeenCalled();
  });
  it("never retries errors, even errors resembling API argument failures", async () => {
    const { context } = setup("modern", 155);
    context.executeTool.mockRejectedValue(
      new Error("Failed to parse input after side effects"),
    );
    const result = await pageCommand({
      action: "execute",
      name: "test",
      args: {},
      schema: JSON.stringify(tool.inputSchema),
    });
    expect(result.ok).toBe(false);
    expect(context.executeTool).toHaveBeenCalledTimes(1);
  });
  it("accepts equivalent schemas whose keys were reordered by extension messaging", async () => {
    const { context } = setup("modern", 155);
    const result = await pageCommand({
      action: "execute",
      name: "test",
      args: {},
      schema: '{"properties":{},"type":"object"}',
    });
    expect(result.ok).toBe(true);
    expect(context.executeTool).toHaveBeenCalledTimes(1);
  });
  it("filters child-frame tools to avoid ambiguous same-name execution", async () => {
    const { context } = setup("modern", 155);
    context.getTools.mockResolvedValue([
      { ...tool, window: {} } as typeof tool,
    ]);
    const result = await pageCommand({ action: "list" });
    expect(result.ok && result.snapshot?.tools).toEqual([]);
  });
});
