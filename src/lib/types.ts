export type Schema = Record<string, any>;
export interface Tool {
  name: string;
  description?: string;
  inputSchema: Schema;
  annotations?: Record<string, unknown>;
}
export type ApiKind = "document" | "navigator" | "testing" | "unavailable";
export interface Snapshot {
  tools: Tool[];
  url: string;
  title: string;
  api: ApiKind;
  revision: number;
}
export interface Connection extends Snapshot {
  tabId: number;
  documentId: string;
}
export interface Execution {
  value: unknown;
  elapsed: number;
  isError: boolean;
}
export interface SavedRequest {
  id: string;
  name: string;
  toolName: string;
  args: Record<string, unknown>;
  origin: string;
  savedAt: number;
}
