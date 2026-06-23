import type { HandoffTarget } from '@inkeep/open-knowledge-core';
import { Trans, useLingui } from '@lingui/react/macro';
import { ArrowUpRight, Check, ChevronDown, Sparkles, SquareTerminal } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import {
  type CreateScenario,
  useCreateSuggestions,
} from '@/components/empty-state/use-create-suggestions';
import { TargetIcon } from '@/components/handoff/OpenInAgentMenuItem';
import { useTerminalLaunch } from '@/components/handoff/TerminalLaunchContext';
import {
  buildCreateHandoffInput,
  getDisplayNameDefault,
  openInstallUrl,
  useHandoffDispatch,
} from '@/components/handoff/useHandoffDispatch';
import { useInstalledAgents } from '@/components/handoff/useInstalledAgents';
import { Button } from '@/components/ui/button';
import { ButtonGroup } from '@/components/ui/button-group';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Textarea } from '@/components/ui/textarea';
import { VISIBLE_TARGETS } from '@/lib/handoff/targets';
import {
  readPreferredAgent,
  resolvePreferredAgent,
  writePreferredAgent,
} from '@/lib/preferred-agent-store';
import { useWorkspace } from '@/lib/use-workspace';
import { cn } from '@/lib/utils';

interface CreatePromptComposerProps {
  readonly scenario: CreateScenario;
  readonly className?: string;
}

export function CreatePromptComposer({ scenario, className }: CreatePromptComposerProps) {
  const { t } = useLingui();
  const { states, refresh } = useInstalledAgents();
  const { dispatch } = useHandoffDispatch();
  const workspace = useWorkspace();
  const terminalLaunch = useTerminalLaunch();

  const [description, setDescription] = useState('');
  const [selectedAgentId, setSelectedAgentId] = useState<HandoffTarget | null>(() =>
    readPreferredAgent(),
  );
  const userPickedRef = useRef(false);
  const [cliMode, setCliMode] = useState(false);
  const cliSelected = cliMode && terminalLaunch !== null;

  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const suggestions = useCreateSuggestions(scenario);

  const selectableTargets = VISIBLE_TARGETS.filter(
    (target) => states[target.id]?.installed === true,
  );
  const probeSettled = VISIBLE_TARGETS.every((target) => states[target.id]?.installed != null);
  const noAgentsInstalled = probeSettled && selectableTargets.length === 0;

  useEffect(() => {
    if (!probeSettled || userPickedRef.current) return;
    const resolved = resolvePreferredAgent({ lastUsed: readPreferredAgent(), states });
    setSelectedAgentId((current) => (resolved === current ? current : resolved));
  }, [probeSettled, states]);

  function chooseAgent(targetId: HandoffTarget) {
    userPickedRef.current = true;
    setCliMode(false);
    setSelectedAgentId(targetId);
    writePreferredAgent(targetId);
  }

  function chooseCli() {
    userPickedRef.current = true;
    setCliMode(true);
  }

  function launchCli() {
    if (terminalLaunch === null) return;
    const input = buildCreateHandoffInput({ workspace, description: description.trim(), scenario });
    if (input === null) return; // Workspace not resolved yet — disabled-trigger contract.
    terminalLaunch.launchInTerminal(input);
  }

  function handleCreate(targetId: HandoffTarget) {
    const desc = description.trim();
    writePreferredAgent(targetId);
    const input = buildCreateHandoffInput({ workspace, description: desc, scenario });
    if (input === null) return; // Workspace not resolved yet — disabled-trigger contract.
    void dispatch(targetId, input);
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
      event.preventDefault();
      if (cliSelected) {
        launchCli();
      } else if (selectedAgentId !== null) {
        handleCreate(selectedAgentId);
      }
    }
  }

  function applySuggestion(prompt: string) {
    setDescription(prompt);
    textareaRef.current?.focus();
  }

  if (noAgentsInstalled) {
    return (
      <div
        className={cn(
          'flex w-full flex-wrap items-center justify-between gap-3 rounded-2xl border border-border/60 bg-card px-4 py-3',
          className,
        )}
        data-testid="create-no-agents"
      >
        <div className="flex min-w-0 items-center gap-2.5">
          <Sparkles aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
          <span className="text-1sm text-muted-foreground">
            <Trans>Install an AI agent to create with AI</Trans>
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {VISIBLE_TARGETS.map((target) => (
            <Button
              key={target.id}
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void openInstallUrl(target)}
              className="gap-1.5"
              data-testid={`install-agent-${target.id}`}
            >
              <TargetIcon id={target.id} aria-hidden="true" className="size-3.5" />
              {target.displayName}
              <ArrowUpRight aria-hidden="true" className="size-3" />
            </Button>
          ))}
        </div>
      </div>
    );
  }

  const showDesktopSection = selectableTargets.length > 0;
  const showTerminalSection = terminalLaunch !== null;

  return (
    <div className={cn('flex w-full flex-col gap-3', className)}>
      <div className="flex w-full flex-col rounded-2xl border border-border/60 bg-card shadow-sm transition-colors focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50">
        {/* The card owns the border + focus ring; the textarea drops its own
            (border-0 + ring-0) so the whole card lights up on focus instead of
            nesting a second outline. */}
        <Textarea
          ref={textareaRef}
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          onKeyDown={handleKeyDown}
          rows={4}
          placeholder={t`A team knowledge base, a personal wiki, project docs...`}
          aria-label={t`Describe the project you want to create`}
          className="min-h-12 resize-none rounded-2xl border-0 bg-transparent dark:bg-transparent px-4 py-3.5 text-sm leading-relaxed shadow-none focus-visible:border-0 focus-visible:ring-0 max-h-96 subtle-scrollbar"
        />
        {/* Footer row: the Create split button, pinned right. */}
        <div className="flex flex-wrap items-center justify-end gap-2 px-3 pb-3">
          {selectedAgentId === null ? (
            <Button
              type="button"
              variant="outline"
              disabled
              className="gap-1.5"
              data-testid="create-with-agent"
            >
              <Trans>Create</Trans>
            </Button>
          ) : (
            <ButtonGroup>
              <Button
                type="button"
                onClick={() => (cliSelected ? launchCli() : handleCreate(selectedAgentId))}
                variant="outline"
                className="gap-1.5"
                data-testid="create-with-agent"
              >
                {cliSelected ? (
                  <>
                    <SquareTerminal aria-hidden="true" className="size-3.5" />
                    <Trans>Create with Claude CLI</Trans>
                  </>
                ) : (
                  <>
                    <TargetIcon id={selectedAgentId} aria-hidden="true" className="size-3.5" />
                    <Trans>Create with {getDisplayNameDefault(selectedAgentId)}</Trans>
                  </>
                )}
              </Button>
              <DropdownMenu
                onOpenChange={(open) => {
                  if (open) void refresh();
                }}
              >
                <DropdownMenuTrigger asChild>
                  <Button
                    type="button"
                    aria-label={t`Choose agent`}
                    size="icon"
                    variant="outline"
                    data-testid="create-with-agent-menu"
                  >
                    <ChevronDown aria-hidden="true" className="size-3.5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="min-w-[200px]">
                  {showDesktopSection ? (
                    <DropdownMenuGroup aria-label={t`Desktop`}>
                      <DropdownMenuLabel>
                        <Trans>Desktop</Trans>
                      </DropdownMenuLabel>
                      {selectableTargets.map((target) => (
                        <DropdownMenuItem
                          key={target.id}
                          onSelect={() => chooseAgent(target.id)}
                          data-testid={`create-agent-option-${target.id}`}
                        >
                          <TargetIcon id={target.id} aria-hidden="true" className="size-4" />
                          <span className="flex-1">{target.displayName}</span>
                          {!cliSelected && target.id === selectedAgentId ? (
                            <Check aria-hidden="true" className="size-4 text-muted-foreground" />
                          ) : null}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuGroup>
                  ) : null}
                  {showTerminalSection ? (
                    <>
                      {showDesktopSection ? <DropdownMenuSeparator /> : null}
                      <DropdownMenuGroup aria-label={t`Terminal`}>
                        <DropdownMenuLabel>
                          <Trans>Terminal</Trans>
                        </DropdownMenuLabel>
                        {/* Selects the docked-terminal Claude CLI as the create target
                          (the Create button performs the launch). Visible text is
                          "Claude" while the accessible name stays "Claude CLI" so AT
                          users can tell it apart from the Desktop "Claude" (WCAG
                          2.5.3 — the name contains the visible label). */}
                        <DropdownMenuItem
                          onSelect={() => chooseCli()}
                          data-testid="create-with-claude-cli"
                          aria-label={t`Claude CLI`}
                        >
                          <SquareTerminal className="size-4" aria-hidden="true" />
                          <span className="flex-1">
                            <Trans>Claude</Trans>
                          </span>
                          {cliSelected ? (
                            <Check aria-hidden="true" className="size-4 text-muted-foreground" />
                          ) : null}
                        </DropdownMenuItem>
                      </DropdownMenuGroup>
                    </>
                  ) : null}
                </DropdownMenuContent>
              </DropdownMenu>
            </ButtonGroup>
          )}
        </div>
      </div>
      {/* Starter-brief chips — below the card, centered. Clicking one prefills
          the field (no auto-create), so they read as suggestions rather than
          card actions. Wraps on narrow widths. */}
      <div className="flex flex-wrap items-center justify-center gap-2">
        {suggestions.map((suggestion) => {
          const Icon = suggestion.icon;
          return (
            <Button
              key={suggestion.id}
              type="button"
              variant="outline"
              size="sm"
              onClick={() => applySuggestion(suggestion.prompt)}
              className="gap-1.5 rounded-md font-normal text-muted-foreground hover:text-foreground"
              data-testid={`create-suggestion-${suggestion.id}`}
            >
              <Icon className="size-3.5" aria-hidden="true" />
              {suggestion.label}
            </Button>
          );
        })}
      </div>
    </div>
  );
}
