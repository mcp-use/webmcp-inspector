import { chromium, expect } from "@playwright/test";
import { cp, mkdir, readFile, writeFile, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import http from "node:http";
const tmp = await mkdtemp(path.join(tmpdir(), "webmcp-qa-"));
const extension = path.join(tmp, "extension");
await cp(".output/chrome-mv3", extension, { recursive: true });
const manifest = JSON.parse(
  await readFile(path.join(extension, "manifest.json"), "utf8"),
);
manifest.host_permissions = ["http://127.0.0.1/*"];
await writeFile(
  path.join(extension, "manifest.json"),
  JSON.stringify(manifest),
);
const server = http.createServer((req, res) => {
  res.setHeader("Content-Type", "text/html");
  res.end(
    '<!doctype html><title>WebMCP test page</title><h1>WebMCP test page</h1><div id="result"></div>',
  );
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const url = `http://127.0.0.1:${server.address().port}`;
const context = await chromium.launchPersistentContext(
  path.join(tmp, "profile"),
  {
    executablePath: process.env.CHROME_PATH || chromium.executablePath(),
    headless: true,
    args: [
      `--disable-extensions-except=${extension}`,
      `--load-extension=${extension}`,
      "--enable-experimental-web-platform-features",
      "--enable-features=WebMCP",
    ],
  },
);
try {
  const worker =
    context.serviceWorkers()[0] ??
    (await context.waitForEvent("serviceworker"));
  const id = new URL(worker.url()).host;
  const page = await context.newPage();
  await page.goto(url);
  console.log("Browser", context.browser()?.version());
  console.log(
    "API",
    await page.evaluate(() => ({
      document: !!document.modelContext,
      navigator: !!navigator.modelContext,
      testing: !!navigator.modelContextTesting,
    })),
  );
  const registration = await page.evaluate(async () => {
    const ctx = document.modelContext ?? navigator.modelContext;
    if (!ctx) return "unavailable";
    await ctx.registerTool({
      name: "add_topping",
      description: "Add one or more toppings to the pizza",
      inputSchema: {
        type: "object",
        properties: {
          topping: { type: "string", enum: ["🍕", "🍄", "🌿"] },
          size: { type: "string", enum: ["Small", "Medium", "Large"] },
          count: {
            type: "integer",
            minimum: 1,
            description: "Number of toppings to add",
          },
        },
        required: ["topping"],
      },
      execute: async (args) => {
        document.querySelector("#result").textContent = JSON.stringify(args);
        return {
          content: [
            { type: "text", text: `Added ${args.count ?? 1} ${args.topping}` },
          ],
        };
      },
    });
    await ctx.registerTool({
      name: "focus",
      description:
        "Show the current board: the vital few (active streams), the capture inbox, and any drift alert.",
      inputSchema: { type: "object", properties: {} },
      execute: () => "Ready",
    });
    return "registered";
  });
  console.log("Registration", registration);
  const panel = await context.newPage();
  const panelErrors = [];
  panel.on("pageerror", (error) => panelErrors.push(error.message));
  await panel.setViewportSize({ width: 390, height: 820 });
  await panel.goto(`chrome-extension://${id}/sidepanel.html`);
  await page.bringToFront();
  await panel
    .getByRole("button", { name: "Refresh tools", exact: true })
    .click();
  await panel.waitForTimeout(1200);
  console.log("Panel", await panel.locator("body").innerText());
  await mkdir("artifacts", { recursive: true });
  await expect(panel.locator(".app-header")).toHaveCount(0);
  await expect(panel).toHaveTitle("WebMCP Inspector");
  await expect(panel.locator(".site-bar")).toHaveCount(0);
  await panel.screenshot({ path: "artifacts/tools.png" });
  if (registration !== "registered")
    throw new Error("Native WebMCP unavailable");
  await panel.getByTestId("tool-item-add_topping").click();
  await panel.getByRole("button", { name: "Execute", exact: true }).click();
  await expect(panel.getByRole("alert")).toContainText("topping");
  await panel.getByTestId("tool-param-topping").click();
  await panel.getByRole("option", { name: "🍄", exact: true }).click();
  await panel.getByTestId("tool-param-count").fill("2");
  await panel.getByRole("button", { name: "Execute", exact: true }).click();
  await expect(panel.locator(".results")).toContainText("Added 2 🍄");
  await expect(page.locator("#result")).toHaveText(
    JSON.stringify({ count: 2, topping: "🍄" }),
  );
  await panel.getByRole("button", { name: "Save", exact: true }).click();
  await panel.getByLabel("Request name").fill("Two mushrooms");
  await panel
    .getByRole("button", { name: "Save request", exact: true })
    .click();
  await expect(panel.getByRole("status")).toHaveText("Request saved");
  await panel.getByRole("button", { name: "Toggle theme" }).click();
  const separator = panel.getByRole("separator", { name: "Resize results" });
  const beforeResize = await separator.boundingBox();
  await panel.mouse.move(
    beforeResize.x + beforeResize.width / 2,
    beforeResize.y + beforeResize.height / 2,
  );
  await panel.mouse.down();
  await panel.mouse.move(
    beforeResize.x + beforeResize.width / 2,
    beforeResize.y - 100,
    { steps: 8 },
  );
  await panel.mouse.up();
  await expect
    .poll(async () => (await separator.boundingBox()).y)
    .toBeLessThan(beforeResize.y - 50);
  await separator.focus();
  await panel.keyboard.press("ArrowUp");
  await panel
    .getByRole("button", { name: "Fullscreen results", exact: true })
    .click();
  await expect(
    panel.getByRole("dialog", { name: "Result", exact: true }),
  ).toBeVisible();
  await expect(panel.getByRole("dialog")).toContainText("Added 2 🍄");
  await panel.screenshot({ path: "artifacts/results-fullscreen.png" });
  await panel.keyboard.press("Escape");
  await expect(panel.getByRole("dialog")).toHaveCount(0);
  await panel.screenshot({ path: "artifacts/detail.png" });
  await panel
    .getByRole("button", { name: "Back to tools", exact: true })
    .click();
  await panel.getByRole("button", { name: "Saved (1)", exact: true }).click();
  await panel
    .getByRole("button", { name: "Two mushrooms add_topping", exact: true })
    .click();
  await expect(panel.getByTestId("tool-param-count")).toHaveValue("2");
  await expect(panel.getByTestId("tool-param-topping")).toContainText("🍄");
  await panel.reload();
  await page.bringToFront();
  await expect(
    panel.getByRole("button", { name: "Saved (1)", exact: true }),
  ).toBeVisible();
  // Native events must add/remove tools without pressing Refresh.
  await page.evaluate(async () => {
    const ctx = document.modelContext ?? navigator.modelContext;
    window.liveToolController = new AbortController();
    await ctx.registerTool(
      {
        name: "live_tool",
        description: "Registered while the inspector is open",
        inputSchema: { type: "object", properties: {} },
        execute: () => "Live",
      },
      { signal: window.liveToolController.signal },
    );
  });
  await expect(panel.getByTestId("tool-item-live_tool")).toBeVisible();
  await page.evaluate(() => window.liveToolController.abort());
  await expect(panel.getByTestId("tool-item-live_tool")).toHaveCount(0);
  await panel.screenshot({ path: "artifacts/tools-dark.png" });
  await panel.getByRole("button", { name: "Saved (1)", exact: true }).click();
  await panel.screenshot({ path: "artifacts/saved.png" });
  await panel.getByRole("button", { name: "Delete Two mushrooms" }).click();
  await expect(panel.getByText("No saved requests yet")).toBeVisible();
  await panel.getByRole("button", { name: "Back to all tools" }).click();
  await panel.getByTestId("tool-item-focus").click();
  await panel.getByRole("button", { name: "Execute", exact: true }).click();
  await expect(panel.locator(".results")).toContainText("Ready");
  // Boolean controls must preserve the distinction between false and omitted.
  await page.evaluate(async () => {
    await (document.modelContext ?? navigator.modelContext).registerTool({
      name: "boolean_inputs",
      description: "Verify optional and required boolean parameters",
      inputSchema: {
        type: "object",
        properties: {
          all: {
            type: "boolean",
            description: "Remove all toppings of this type",
          },
          confirmed: { type: "boolean" },
          defaulted: { type: "boolean", default: false },
        },
        required: ["confirmed"],
      },
      execute: (args) => {
        document.querySelector("#result").textContent = JSON.stringify(args);
        return "Boolean arguments received";
      },
    });
  });
  await panel
    .getByRole("button", { name: "Back to tools", exact: true })
    .click();
  await panel.getByTestId("tool-item-boolean_inputs").click();
  await expect(panel.getByTestId("tool-param-all")).toContainText("Not set");
  await expect(panel.getByTestId("tool-param-defaulted")).toContainText(
    "False",
  );
  await panel.getByRole("button", { name: "Execute", exact: true }).click();
  await expect(panel.getByRole("alert")).toContainText("confirmed");
  await panel.getByTestId("tool-param-confirmed").click();
  await expect(
    panel.getByRole("option", { name: "Not set", exact: true }),
  ).toHaveCount(0);
  await panel.getByRole("option", { name: "False", exact: true }).click();
  for (const [label, value] of [
    ["True", true],
    ["False", false],
    ["Not set", undefined],
  ]) {
    await panel.getByTestId("tool-param-all").click();
    await panel.getByRole("option", { name: label, exact: true }).click();
    await panel.getByRole("button", { name: "Execute", exact: true }).click();
    await expect
      .poll(async () => JSON.parse(await page.locator("#result").innerText()))
      .toEqual({
        confirmed: false,
        defaulted: false,
        ...(value === undefined ? {} : { all: value }),
      });
  }
  await panel.getByRole("button", { name: "Save", exact: true }).click();
  await panel.getByLabel("Request name").fill("Boolean request");
  await panel
    .getByRole("button", { name: "Save request", exact: true })
    .click();
  await expect(panel.getByRole("status")).toHaveText("Request saved");
  await panel
    .getByRole("button", { name: "Back to tools", exact: true })
    .click();
  await panel.getByRole("button", { name: "Saved (1)", exact: true }).click();
  await panel
    .getByRole("button", {
      name: "Boolean request boolean_inputs",
      exact: true,
    })
    .click();
  await expect(panel.getByTestId("tool-param-confirmed")).toContainText(
    "False",
  );
  await expect(panel.getByTestId("tool-param-all")).toContainText("Not set");
  await panel.screenshot({ path: "artifacts/boolean-inputs.png" });
  await panel.getByRole("button", { name: "Back to tools", exact: true }).click();
  await panel.getByRole("button", { name: "Back to all tools", exact: true }).click();
  await panel.getByTestId("tool-item-boolean_inputs").click();
  await page.reload();
  await expect(
    panel.getByText("No tools available", { exact: true }),
  ).toBeVisible();
  // Isolated-world scripts don't expose any page-controlled execution listener.
  await page.evaluate(() =>
    window.postMessage(
      { source: "mcp-use-webmcp", event: "execute", name: "focus" },
      location.origin,
    ),
  );
  await expect(page.locator("#result")).toHaveText("");
  await panel.setViewportSize({ width: 320, height: 700 });
  await expect
    .poll(() =>
      panel.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    )
    .toBe(true);
  await panel.getByRole("button", { name: "Toggle theme" }).click();
  if (panelErrors.length) throw new Error(panelErrors.join("\n"));
  console.log(
    "PASS: native discovery, required validation, typed execution, boolean selection/omission/defaults, saved reload/delete, live registration/removal, navigation, result resizing/fullscreen, narrow layout",
  );
} catch (error) {
  const failedPanel = context
    .pages()
    .find((page) => page.url().startsWith("chrome-extension://"));
  if (failedPanel) {
    await failedPanel.screenshot({ path: "artifacts/browser-failure.png" });
    console.error(await failedPanel.locator("body").innerText());
  }
  throw error;
} finally {
  await context.close();
  server.close();
}
