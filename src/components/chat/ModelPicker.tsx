// Adapted from mcp-use Inspector (chat/providerMeta.tsx, the managed cloud
// picker in ConfigurationDialog.tsx); see THIRD_PARTY_NOTICES.md.
import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, Search } from "lucide-react";
import { Modal } from "../Modal";
import { Input } from "../ui/input";
import { cn } from "@/src/lib/utils";
import {
  MODEL_PROVIDERS,
  PROVIDER_LABELS,
  modelLabel,
  providerOf,
  type CloudModel,
  type ModelProvider,
} from "@/src/hooks/useCloudModels";

export function ProviderLogo({
  provider,
  className,
}: {
  provider: string;
  className?: string;
}) {
  if (!(MODEL_PROVIDERS as readonly string[]).includes(provider)) return null;
  return (
    <img
      src={`/providers/${provider}.png`}
      alt=""
      className={cn("size-4 shrink-0 rounded-full object-cover", className)}
    />
  );
}

export function ModelPicker({
  models,
  selectedId,
  onSelect,
  disabled,
}: {
  models: CloudModel[];
  selectedId: string;
  onSelect: (id: string) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const selected = models.find((m) => m.id === selectedId);
  const selectedProvider = selected?.provider ?? providerOf(selectedId);
  const providers = MODEL_PROVIDERS.filter((provider) =>
    models.some((m) => m.provider === provider),
  );
  const [active, setActive] = useState<ModelProvider | null>(null);
  const shown =
    active ??
    (providers.find((p) => p === selectedProvider) || providers[0] || null);
  const [query, setQuery] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  // showModal() focuses the close button after children mount; take focus back.
  useEffect(() => {
    if (!open) return;
    const frame = requestAnimationFrame(() => searchRef.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [open]);
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  // A search spans every provider; otherwise show the active provider's tab.
  const searching = terms.length > 0;
  const list = searching
    ? models.filter((m) => {
        const text =
          `${m.name} ${m.id} ${PROVIDER_LABELS[m.provider as ModelProvider] ?? ""}`.toLowerCase();
        return terms.every((term) => text.includes(term));
      })
    : models.filter((m) => m.provider === shown);
  const choose = (id: string) => {
    onSelect(id);
    setOpen(false);
  };

  return (
    <>
      <button
        type="button"
        className="model-trigger"
        onClick={() => {
          setActive(null);
          setQuery("");
          setOpen(true);
        }}
        disabled={disabled}
        title="Choose a model"
        aria-label={`Model: ${modelLabel(selected, selectedId)}`}
        data-testid="chat-model-picker"
      >
        <ProviderLogo provider={selectedProvider} />
        <span className="truncate">{modelLabel(selected, selectedId)}</span>
        <ChevronDown className="size-3 shrink-0 opacity-60" aria-hidden />
      </button>
      {open && (
        <Modal title="Choose a model" onClose={() => setOpen(false)}>
          {providers.length === 0 ? (
            <p className="text-[12px] text-muted-foreground">
              Models are loading. The chat uses{" "}
              <span className="font-mono">{selectedId}</span> until then.
            </p>
          ) : (
            <>
              <div className="model-search">
                <Search className="size-3.5" aria-hidden />
                <Input
                  ref={searchRef}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => {
                    // Enter picks the top match.
                    if (e.key === "Enter" && searching && list[0]) {
                      e.preventDefault();
                      choose(list[0].id);
                    }
                  }}
                  placeholder="Search models…"
                  aria-label="Search models"
                />
              </div>
              <div
                className="provider-tabs"
                role="tablist"
                aria-label="Provider"
                hidden={searching}
              >
                {providers.map((provider) => (
                  <button
                    key={provider}
                    type="button"
                    role="tab"
                    aria-selected={provider === shown}
                    onClick={() => setActive(provider)}
                  >
                    <ProviderLogo provider={provider} />
                    {PROVIDER_LABELS[provider]}
                  </button>
                ))}
              </div>
              <div
                className="model-list"
                role="listbox"
                aria-label={
                  searching
                    ? "Matching models"
                    : `${shown ? PROVIDER_LABELS[shown] : ""} models`
                }
              >
                {list.length === 0 && (
                  <p className="px-2.5 py-6 text-center text-[12px] text-muted-foreground">
                    No models match “{query.trim()}”.
                  </p>
                )}
                {list.map((model) => {
                  const isSelected = model.id === selectedId;
                  return (
                    <button
                      key={model.id}
                      type="button"
                      role="option"
                      aria-selected={isSelected}
                      onClick={() => choose(model.id)}
                    >
                      {searching && <ProviderLogo provider={model.provider} />}
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[12px] font-medium">
                          {modelLabel(model, model.id)}
                        </span>
                        <span className="block truncate font-mono text-[10px] text-muted-foreground">
                          {model.id}
                        </span>
                      </span>
                      <Check
                        className={cn(
                          "size-3.5 shrink-0",
                          isSelected ? "opacity-100" : "opacity-0",
                        )}
                        aria-hidden
                      />
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </Modal>
      )}
    </>
  );
}
