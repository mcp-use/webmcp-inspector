// Adapted from mcp-use Inspector (chat/useManagedCloudModel.ts); see THIRD_PARTY_NOTICES.md.
import { useCallback, useEffect, useState } from "react";
import { getAccessToken, MANUFACT_CLOUD_URL } from "../lib/manufact-auth";

export const DEFAULT_MODEL_ID = "openai/gpt-5.6-luna";
const STORAGE_KEY = "manufact:model";

/** Like the Inspector's cloud picker, offer first-party providers only. */
export const MODEL_PROVIDERS = ["openai", "anthropic", "google"] as const;
export type ModelProvider = (typeof MODEL_PROVIDERS)[number];

export const PROVIDER_LABELS: Record<ModelProvider, string> = {
  openai: "OpenAI",
  anthropic: "Anthropic",
  google: "Google",
};

export interface CloudModel {
  id: string;
  name: string;
  provider: string;
}

/** Cloud model ids are `provider/model`. */
export function providerOf(id: string): string {
  return id.split("/")[0] ?? "";
}

export function isAllowedModel(id: string): boolean {
  return (MODEL_PROVIDERS as readonly string[]).includes(providerOf(id));
}

function storedModel(): string | null {
  try {
    const id = localStorage.getItem(STORAGE_KEY);
    return id && isAllowedModel(id) ? id : null;
  } catch {
    return null;
  }
}

/** Strip the "Provider: " prefix the cloud's model catalog puts on display names. */
export function modelLabel(model: CloudModel | undefined, id: string): string {
  if (!model) return id;
  const index = model.name.indexOf(": ");
  return index > 0 && index < 48 ? model.name.slice(index + 2) : model.name;
}

export function useCloudModels(enabled: boolean) {
  const [models, setModels] = useState<CloudModel[]>([]);
  const [selectedId, setSelectedIdState] = useState(
    () => storedModel() ?? DEFAULT_MODEL_ID,
  );
  const setSelectedId = useCallback((id: string) => {
    setSelectedIdState(id);
    try {
      localStorage.setItem(STORAGE_KEY, id);
    } catch {
      // ignore quota errors
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch(`${MANUFACT_CLOUD_URL}/api/v1/models`, {
          headers: { Authorization: `Bearer ${await getAccessToken()}` },
          credentials: "omit",
        });
        if (!response.ok || cancelled) return;
        const data = (await response.json()) as {
          models?: CloudModel[];
          defaultModelId?: string;
        };
        if (cancelled) return;
        const list = (data.models ?? []).filter(
          (m) =>
            (MODEL_PROVIDERS as readonly string[]).includes(m.provider) &&
            isAllowedModel(m.id),
        );
        setModels(list);
        const ids = new Set(list.map((m) => m.id));
        const fallback =
          data.defaultModelId && isAllowedModel(data.defaultModelId)
            ? data.defaultModelId
            : DEFAULT_MODEL_ID;
        const stored = storedModel();
        if (stored && ids.has(stored)) setSelectedIdState(stored);
        else if (ids.has(fallback)) setSelectedIdState(fallback);
        else if (list[0]) setSelectedIdState(list[0].id);
      } catch {
        // The chat still works with the default model.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [enabled]);

  return { models, selectedId, setSelectedId };
}
