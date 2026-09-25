// Adapted from mcp-use Inspector (chat/useManagedCloudModel.ts); see THIRD_PARTY_NOTICES.md.
import { useCallback, useEffect, useState } from "react";
import { getAccessToken, MANUFACT_CLOUD_URL } from "../lib/manufact-auth";

export const DEFAULT_MODEL_ID = "openai/gpt-5.6-luna";
const STORAGE_KEY = "manufact:model";

export interface CloudModel {
  id: string;
  name: string;
  provider: string;
}

function storedModel(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

/** Strip the "Provider: " prefix OpenRouter puts on display names. */
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
        const list = data.models ?? [];
        setModels(list);
        const ids = new Set(list.map((m) => m.id));
        const fallback = data.defaultModelId ?? DEFAULT_MODEL_ID;
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
