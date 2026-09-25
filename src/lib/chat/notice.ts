// Adapted from mcp-use Inspector (chat/managedChatNotice.ts); see THIRD_PARTY_NOTICES.md.
import { ManufactLoginRequiredError } from "../manufact-auth";
import { LlmRequestError } from "./llm";

export type ChatNotice =
  | { kind: "cloud_unavailable" }
  | { kind: "login_required"; loginUrl?: string }
  | { kind: "credits_exhausted"; billingUrl?: string; message: string };

const CREDITS = "You've used your organization's included Manufact credits.";

/** Map Manufact LLM proxy failures to a notice the chat can render inline. */
export function noticeFromError(error: unknown): ChatNotice | null {
  if (error instanceof ManufactLoginRequiredError)
    return { kind: "login_required" };
  if (error instanceof LlmRequestError) {
    const body =
      error.body && typeof error.body === "object" && !Array.isArray(error.body)
        ? (error.body as Record<string, any>)
        : {};
    const message =
      typeof body.error?.message === "string"
        ? body.error.message
        : typeof body.message === "string"
          ? body.message
          : CREDITS;
    const billingUrl =
      typeof body.upgradeUrl === "string"
        ? body.upgradeUrl
        : typeof body.billingUrl === "string"
          ? body.billingUrl
          : undefined;
    if (error.status === 401 || body.loginRequired)
      return {
        kind: "login_required",
        loginUrl: typeof body.loginUrl === "string" ? body.loginUrl : undefined,
      };
    if (error.status === 402 || body.creditsExhausted)
      return { kind: "credits_exhausted", billingUrl, message };
    if (error.status === 429)
      return {
        kind: "credits_exhausted",
        billingUrl,
        message:
          typeof body.message === "string"
            ? body.message
            : "You've reached your chat quota for this workspace.",
      };
    if (error.status >= 502 && error.status <= 504)
      return { kind: "cloud_unavailable" };
    return null;
  }
  if (
    error instanceof TypeError &&
    /failed to fetch|networkerror|load failed/i.test(error.message)
  )
    return { kind: "cloud_unavailable" };
  return null;
}
