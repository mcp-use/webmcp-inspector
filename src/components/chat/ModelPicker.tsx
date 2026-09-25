// Adapted from mcp-use Inspector (chat/providerMeta.tsx, the managed cloud
// picker in ConfigurationDialog.tsx); see THIRD_PARTY_NOTICES.md.
import { useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import { Modal } from "../Modal";
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
  const list = models.filter((m) => m.provider === shown);

  return (
    <>
      <button
        type="button"
        className="model-trigger"
        onClick={() => {
          setActive(null);
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
              <div
                className="provider-tabs"
                role="tablist"
                aria-label="Provider"
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
                aria-label={`${shown ? PROVIDER_LABELS[shown] : ""} models`}
              >
                {list.map((model) => {
                  const isSelected = model.id === selectedId;
                  return (
                    <button
                      key={model.id}
                      type="button"
                      role="option"
                      aria-selected={isSelected}
                      onClick={() => {
                        onSelect(model.id);
                        setOpen(false);
                      }}
                    >
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
