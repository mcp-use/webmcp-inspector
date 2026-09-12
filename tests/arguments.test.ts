import { describe, expect, it } from "vitest";
import { executionArgs, initialArgs, validateArgs } from "../src/lib/arguments";
const schema = {
  type: "object",
  properties: {
    text: { type: "string" },
    count: { type: "integer", minimum: 1 },
    enabled: { type: "boolean" },
    payload: {
      type: "object",
      required: ["name"],
      properties: { name: { type: "string" } },
    },
    tags: { type: "array", items: { type: "string" } },
    size: { type: "string", enum: ["Small", "Large"] },
  },
  required: ["text"],
};
describe("execution arguments", () => {
  it("omits untouched values while preserving explicit empty, zero and false", () => {
    expect(
      executionArgs(
        schema,
        { text: "", enabled: false, count: 0, size: undefined },
        new Set(),
      ),
    ).toEqual({ enabled: false, count: 0 });
    expect(executionArgs(schema, { text: "" }, new Set(["text"]))).toEqual({
      text: "",
    });
  });
  it("coerces schema types without coercing string fields", () => {
    expect(
      executionArgs(
        schema,
        {
          text: "001",
          count: "2",
          enabled: "false",
          tags: '["a"]',
          payload: '{"name":"x"}',
        },
        new Set(),
      ),
    ).toEqual({
      text: "001",
      count: 2,
      enabled: false,
      tags: ["a"],
      payload: { name: "x" },
    });
  });
  it("validates required, integer bounds, enums, nested objects and array item types", () => {
    expect(
      validateArgs(schema, {
        text: "",
        count: 1,
        enabled: false,
        payload: { name: "x" },
        tags: ["a"],
        size: "Small",
      }),
    ).toEqual([]);
    for (const args of [
      {},
      { text: "x", count: 1.5 },
      { text: "x", count: 0 },
      { text: "x", size: "wrong" },
      { text: "x", payload: {} },
      { text: "x", tags: [1] },
    ])
      expect(validateArgs(schema, args).length).toBeGreaterThan(0);
  });
  it("supports local references and preserves falsy defaults", () => {
    const referenced = {
      type: "object",
      $defs: { count: { type: "integer", minimum: 1 } },
      properties: {
        count: { $ref: "#/$defs/count" },
        enabled: { type: "boolean", default: false },
        label: { type: "string", default: "" },
      },
    };
    expect(initialArgs(referenced)).toEqual({ enabled: false, label: "" });
    expect(executionArgs(referenced, { count: "3" }, new Set())).toEqual({
      count: 3,
    });
    expect(validateArgs(referenced, { count: 0 }).length).toBeGreaterThan(0);
  });
  it("rejects invalid JSON input shapes and malformed object arguments", () => {
    expect(validateArgs(schema, []).length).toBeGreaterThan(0);
    const args = executionArgs(
      schema,
      { text: "x", payload: "{broken" },
      new Set(),
    );
    expect(validateArgs(schema, args).length).toBeGreaterThan(0);
  });
  it("does not mutate the tool schema when validating it", () => {
    const before = JSON.stringify(schema);
    validateArgs(schema, { text: "hello" });
    expect(JSON.stringify(schema)).toBe(before);
  });
});
