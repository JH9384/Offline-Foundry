// dyad-prism (ours, not Dyad's; see VENDORED.md): the model picker, replacing Dyad's at build time
// through `resolveId` in vite.shell.config.mts. Three providers answer here, the device, OpenRouter and
// Featherless (shell/host.js), so the menu is the flat list of their models and nothing else: no submenus, no
// recent section, no effort levels, no price badges, no trial banner, no Pro upsell. Choosing a model
// is choosing who answers, which is the only decision this control makes.
//
// It writes what Dyad's own picker writes, so every screen stays in sync: the settings record's
// selectedModel, and the chat's own selection once that chat has a history (the host's chat turn
// prefers the chat's).
import { CheckIcon } from "lucide-react";
import { useState } from "react";
import { useRouterState } from "@tanstack/react-router";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useChatMode } from "@/hooks/useChatMode";
import { useLanguageModelProviders } from "@/hooks/useLanguageModelProviders";
import { useLanguageModelsByProviders } from "@/hooks/useLanguageModelsByProviders";
import { useSettings } from "@/hooks/useSettings";
import { createModelSelection } from "@/lib/modelEffort";
import type { LanguageModel } from "@/ipc/types";
import type { LargeLanguageModel } from "@/lib/schemas";
import { cn } from "@/lib/utils";

const ORDER = ["local", "openrouter", "featherless"];

export function ModelPicker() {
  const { settings, updateSettings } = useSettings();
  const routerState = useRouterState();
  const isChatRoute = routerState.location.pathname === "/chat";
  const chatId = routerState.location.search.id as number | undefined;
  const { chat, setChatSelection } = useChatMode(isChatRoute ? chatId : null);
  const { data: providers } = useLanguageModelProviders();
  const { data: modelsByProvider, isLoading } = useLanguageModelsByProviders();
  const [open, setOpen] = useState(false);

  const listed = (providers ?? [])
    .filter((provider) => ORDER.includes(provider.id))
    .sort((a, b) => ORDER.indexOf(a.id) - ORDER.indexOf(b.id));
  const selected: LargeLanguageModel =
    chat?.modelSelection ?? settings?.selectedModel ?? { name: "", provider: "local" };
  const modelsOf = (providerId: string) => modelsByProvider?.[providerId] ?? [];
  const isSelected = (providerId: string, model: LanguageModel) =>
    // The product's default is the device, so a selection Dyad left as "auto" reads as the device's model.
    (selected.provider === providerId || (selected.provider === "auto" && providerId === "local")) &&
    (selected.name === model.apiName || selected.provider === "auto");

  const label =
    listed
      .flatMap((provider) => modelsOf(provider.id).map((model) => ({ provider: provider.id, model })))
      .find(({ provider, model }) => isSelected(provider, model))?.model.displayName ??
    selected.name;

  const choose = async (providerId: string, model: LanguageModel) => {
    const next: LargeLanguageModel = { name: model.apiName, provider: providerId };
    if (chat && (chat.modelSelection || chat.messages.length > 0)) {
      await setChatSelection({ modelSelection: createModelSelection({ model: next, catalogModel: model }) });
    }
    await updateSettings({ selectedModel: next });
    setOpen(false);
  };

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger
        className="inline-flex h-7 max-w-[220px] cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap rounded-lg border-none bg-transparent px-2 text-xs font-medium text-foreground/80 shadow-none transition-colors hover:bg-muted/60 hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        data-testid="model-picker"
        title={label}
      >
        <span className="truncate">{label}</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-72" align="start">
        {isLoading && <div className="px-2 py-1.5 text-sm text-muted-foreground">Loading models</div>}
        {listed.map((provider, index) => (
          <div key={provider.id}>
            {index > 0 && <DropdownMenuSeparator />}
            <DropdownMenuLabel className="text-xs font-medium text-muted-foreground">
              {provider.name}
            </DropdownMenuLabel>
            {modelsOf(provider.id).map((model) => (
              <DropdownMenuItem
                key={provider.id + ":" + model.apiName}
                onClick={() => choose(provider.id, model)}
                className={cn(
                  "cursor-pointer gap-2",
                  isSelected(provider.id, model) && "bg-accent",
                )}
              >
                <span className="min-w-0 flex-1 truncate">{model.displayName}</span>
                {isSelected(provider.id, model) && <CheckIcon className="size-3.5 shrink-0 text-brand" />}
              </DropdownMenuItem>
            ))}
          </div>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
