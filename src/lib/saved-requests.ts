import { browser } from "wxt/browser";
import type { SavedRequest } from "./types";
const PREFIX = "saved-request:";
export async function readSavedRequests(): Promise<SavedRequest[]> {
  const data = await browser.storage.local.get(null);
  return Object.entries(data)
    .filter(([key, value]) => key.startsWith(PREFIX) && isSavedRequest(value))
    .map(([, value]) => value as SavedRequest)
    .sort((a, b) => b.savedAt - a.savedAt);
}
function isSavedRequest(value: unknown): value is SavedRequest {
  if (!value || typeof value !== "object") return false;
  const v = value as SavedRequest;
  return (
    typeof v.id === "string" &&
    typeof v.origin === "string" &&
    typeof v.toolName === "string" &&
    typeof v.name === "string" &&
    typeof v.savedAt === "number" &&
    !!v.args &&
    typeof v.args === "object" &&
    !Array.isArray(v.args)
  );
}
export async function saveRequest(request: SavedRequest) {
  await browser.storage.local.set({ [PREFIX + request.id]: request });
}
export async function deleteRequest(id: string) {
  await browser.storage.local.remove(PREFIX + id);
}
