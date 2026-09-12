import { Validator } from "@cfworker/json-schema";
import type { Schema } from "./types";
import {
  coerceExecutionArgByType,
  getToolPropertyType,
  resolveToolPropertySchema,
} from "../components/tools/schema-utils";
export function initialArgs(schema: Schema): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(schema.properties ?? {}).flatMap(([key, prop]) => {
      const resolved = resolveToolPropertySchema(prop, schema);
      return resolved.default !== undefined ? [[key, resolved.default]] : [];
    }),
  );
}
export function executionArgs(
  schema: Schema,
  values: Record<string, unknown>,
  empty: Set<string>,
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(values)
      .filter(
        ([key, value]) =>
          value !== undefined && (value !== "" || empty.has(key)),
      )
      .map(([key, value]) => [
        key,
        coerceExecutionArgByType(
          value,
          getToolPropertyType(schema.properties?.[key], schema),
        ),
      ]),
  );
}
export function validateArgs(schema: Schema, args: unknown): string[] {
  if (!args || typeof args !== "object" || Array.isArray(args))
    return ["Arguments must be a JSON object."];
  try {
    const result = new Validator(
      structuredClone(schema),
      "2020-12",
      false,
    ).validate(args);
    return result.valid
      ? []
      : result.errors.map(
          (error) =>
            `${error.instanceLocation.replace(/^#\/?/, "").replaceAll("/", ".") || "Arguments"}: ${error.error}`,
        );
  } catch (error) {
    return [
      `Cannot validate this schema: ${error instanceof Error ? error.message : String(error)}`,
    ];
  }
}
