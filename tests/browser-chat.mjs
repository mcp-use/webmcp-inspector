import { chromium, expect } from "@playwright/test";
import { cp, mkdir, readFile, writeFile, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import http from "node:http";
// Chat against a mocked Manufact Cloud: the model's tool call must run the
// page's real WebMCP tool and the result must go back to the model.
const out = "artifacts";
const tmp = await mkdtemp(path.join(tmpdir(), "webmcp-chat-"));
const extension = path.join(tmp, "extension");
await cp(".output/chrome-mv3", extension, { recursive: true });
const manifest = JSON.parse(
  await readFile(path.join(extension, "manifest.json"), "utf8"),
);
manifest.host_permissions = [
  ...manifest.host_permissions,
  "http://127.0.0.1/*",
];
await writeFile(
  path.join(extension, "manifest.json"),
  JSON.stringify(manifest),
);
const server = http.createServer((req, res) => {
  res.setHeader("Content-Type", "text/html");
  res.end(
    '<!doctype html><title>Pizza shop</title><h1>Pizza</h1><div id="result"></div>',
  );
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
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
const bodies = [];
const sse = (v) => `data: ${JSON.stringify(v)}\n\n`;
await context.route("https://cloud.manufact.com/**", async (route) => {
  const req = route.request();
  const u = new URL(req.url());
  if (u.pathname === "/api/v1/models")
    return route.fulfill({
      json: {
        defaultModelId: "openai/gpt-5.6-luna",
        models: [
          {
            id: "openai/gpt-5.6-luna",
            name: "OpenAI: GPT-5.6 Luna",
            provider: "openai",
          },
          {
            id: "openai/gpt-5.5-mini",
            name: "OpenAI: GPT-5.5 Mini",
            provider: "openai",
          },
          {
            id: "anthropic/claude-sonnet-5",
            name: "Anthropic: Claude Sonnet 5",
            provider: "anthropic",
          },
          {
            id: "google/gemini-3-pro",
            name: "Google: Gemini 3 Pro",
            provider: "google",
          },
          // Other catalog providers must not be offered.
          {
            id: "meta-llama/llama-4-maverick",
            name: "Meta: Llama 4 Maverick",
            provider: "meta-llama",
          },
          {
            id: "openrouter/auto",
            name: "Auto Router",
            provider: "openrouter",
          },
        ],
      },
    });
  if (u.pathname === "/api/v1/inspector/llm/chat/completions") {
    const body = req.postDataJSON();
    bodies.push({ body, auth: req.headers()["authorization"] });
    const hasTool = body.messages.some((m) => m.role === "tool");
    const chunks = hasTool
      ? [
          sse({
            choices: [
              {
                delta: {
                  content:
                    "I added **2 🍄** to your pizza.\n\n- Tool: `add_topping`",
                },
              },
            ],
          }),
          sse({ choices: [{ delta: {}, finish_reason: "stop" }] }),
          "data: [DONE]\n\n",
        ]
      : [
          sse({ choices: [{ delta: { content: "Adding mushrooms now." } }] }),
          sse({
            choices: [
              {
                delta: {
                  tool_calls: [
                    {
                      index: 0,
                      id: "call_1",
                      function: {
                        name: "add_topping",
                        arguments: '{"topping":"🍄",',
                      },
                    },
                  ],
                },
              },
            ],
          }),
          sse({
            choices: [
              {
                delta: {
                  tool_calls: [
                    { index: 0, function: { arguments: '"count":2}' } },
                  ],
                },
              },
            ],
          }),
          sse({ choices: [{ delta: {}, finish_reason: "tool_calls" }] }),
          "data: [DONE]\n\n",
        ];
    return route.fulfill({
      status: 200,
      headers: { "Content-Type": "text/event-stream" },
      body: chunks.join(""),
    });
  }
  return route.fulfill({ status: 404, body: "not mocked" });
});
try {
  const worker =
    context.serviceWorkers()[0] ??
    (await context.waitForEvent("serviceworker"));
  const id = new URL(worker.url()).host;
  const page = await context.newPage();
  await page.goto(url);
  await page.evaluate(async () => {
    const ctx = document.modelContext ?? navigator.modelContext;
    await ctx.registerTool({
      name: "add_topping",
      description: "Add toppings to the pizza",
      inputSchema: {
        type: "object",
        properties: {
          topping: { type: "string" },
          count: { type: "integer", minimum: 1 },
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
  });
  await mkdir(out, { recursive: true });
  const panel = await context.newPage();
  const errors = [];
  panel.on("pageerror", (e) => errors.push(e.message));
  panel.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  await panel.setViewportSize({ width: 390, height: 820 });
  await panel.goto(`chrome-extension://${id}/sidepanel.html`);
  await page.bringToFront();
  await panel
    .getByRole("button", { name: "Refresh tools", exact: true })
    .click();
  await panel.getByRole("tab", { name: "Chat" }).click();
  await expect(panel.getByTestId("chat-sign-in")).toBeVisible();
  await panel.screenshot({ path: `${out}/chat-signed-out.png` });
  await panel.evaluate(() =>
    chrome.storage.local.set({
      "manufact:session": {
        tokens: {
          access_token: "fake-token",
          refresh_token: "r",
          expires_at: Date.now() + 3600e3,
        },
        user: { id: "u1", name: "Ada Lovelace", email: "ada@example.com" },
      },
    }),
  );
  await expect(panel.getByTestId("chat-input")).toBeVisible();
  const picker = panel.getByTestId("chat-model-picker");
  await expect(picker).toHaveText("GPT-5.6 Luna");
  await expect(panel.getByTestId("chat-input")).toHaveAttribute(
    "placeholder",
    "Ask anything about this page.",
  );
  await panel.screenshot({ path: `${out}/chat-empty.png` });
  await picker.click();
  const dialog = panel.getByRole("dialog", { name: "Choose a model" });
  await expect(dialog.getByRole("tab")).toHaveText([
    "OpenAI",
    "Anthropic",
    "Google",
  ]);
  await expect(dialog.getByRole("option")).toHaveCount(2);
  await panel.screenshot({ path: `${out}/chat-model-picker.png` });
  const search = dialog.getByLabel("Search models");
  await expect(search).toBeFocused();
  await search.fill("llama");
  await expect(dialog.getByRole("option")).toHaveCount(0);
  await expect(dialog).toContainText("No models match");
  await search.fill("gem");
  await expect(dialog.getByRole("tablist")).toBeHidden();
  await expect(dialog.getByRole("option")).toHaveText([/Gemini 3 Pro/]);
  await panel.screenshot({ path: `${out}/chat-model-search.png` });
  await search.fill("");
  await dialog.getByRole("tab", { name: "Google" }).click();
  await expect(dialog.getByRole("option")).toHaveText([/Gemini 3 Pro/]);
  await dialog.getByRole("tab", { name: "Anthropic" }).click();
  await dialog.getByRole("option", { name: /Claude Sonnet 5/ }).click();
  await expect(dialog).toHaveCount(0);
  await expect(picker).toHaveText("Claude Sonnet 5");
  await panel.getByTestId("chat-input").fill("Add two mushrooms");
  await panel.getByTestId("chat-input").press("Enter");
  await expect(panel.getByText("I added")).toBeVisible();
  await expect(page.locator("#result")).toHaveText(
    JSON.stringify({ count: 2, topping: "🍄" }),
  );
  await expect(panel.getByTestId("chat-tool-call-status-result")).toBeVisible();
  await panel.screenshot({ path: `${out}/chat.png` });
  await panel.getByTestId("chat-tool-call-add_topping").click();
  await panel.screenshot({ path: `${out}/chat-tool-call.png` });
  await panel.keyboard.press("Escape");
  await panel.getByRole("button", { name: "Toggle theme" }).click();
  await panel.waitForTimeout(400);
  await panel.screenshot({ path: `${out}/chat-dark.png` });
  // Tools tab still intact and chat survives switching
  await panel.getByRole("tab", { name: "Tools" }).click();
  await expect(panel.getByTestId("tool-item-add_topping")).toBeVisible();
  await panel.getByRole("tab", { name: "Chat" }).click();
  await expect(panel.getByText("I added")).toBeVisible();
  // Narrow width
  await panel.setViewportSize({ width: 300, height: 700 });
  await panel.screenshot({ path: `${out}/chat-narrow.png` });
  const [first, second] = bodies;
  expect(first.auth).toBe("Bearer fake-token");
  expect(first.body.model).toBe("anthropic/claude-sonnet-5");
  expect(first.body.tools.map((t) => t.function.name)).toEqual(["add_topping"]);
  expect(first.body.messages[0].content).toContain("Page title: Pizza shop");
  expect(second.body.messages.at(-1)).toEqual({
    role: "tool",
    tool_call_id: "call_1",
    content: "Added 2 🍄",
  });
  if (errors.length) throw new Error(`Panel errors: ${errors.join("; ")}`);
  console.log(
    "PASS: sign-in gate, provider-filtered model picker, streamed tool call executed in page, tool result returned, tabs, dark/narrow layout",
  );
} finally {
  await context.close();
  server.close();
}
