import { Trans, useLingui } from '@lingui/react/macro';
import {
  ChevronDownIcon,
  ChevronRightIcon,
  PanelBottomIcon,
  PanelRightIcon,
  PlusIcon,
  XIcon,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import type { TerminalDockPosition } from '@/lib/terminal-dock-store';
import { cn } from '@/lib/utils';

export interface TerminalTabDescriptor {
  readonly id: string;
  readonly label: string;
}

interface TerminalTabStripProps {
  readonly sessions: readonly TerminalTabDescriptor[];
  readonly activeSessionId: string;
  readonly onSelect: (id: string) => void;
  readonly onTabActivate?: (id: string) => void;
  readonly onNew: () => void;
  readonly onClose: (id: string) => void;
  /** Where the terminal is currently docked — drives the dock-toggle + collapse
   *  button icons/labels. */
  readonly dockPosition: TerminalDockPosition;
  readonly onToggleDock: () => void;
  readonly onCollapse: () => void;
  readonly children?: ReactNode;
  readonly className?: string;
}

export function TerminalTabStrip({
  sessions,
  activeSessionId,
  onSelect,
  onTabActivate,
  onNew,
  onClose,
  dockPosition,
  onToggleDock,
  onCollapse,
  children,
  className,
}: TerminalTabStripProps) {
  const { t } = useLingui();
  const rightDocked = dockPosition === 'right';
  return (
    <Tabs
      value={activeSessionId}
      onValueChange={onSelect}
      className={cn('flex min-h-0 min-w-0 flex-1 flex-col', className)}
    >
      <div className="flex shrink-0 flex-row items-center gap-1 px-1.5 py-1">
        <TabsList
          variant="line"
          aria-label={t`Terminal sessions`}
          className="flex h-auto min-w-0 flex-1 items-center justify-start gap-0.5 overflow-x-auto bg-transparent p-0 [scrollbar-width:none] scroll-fade-mask-x"
        >
          {sessions.map((session) => {
            const isActive = session.id === activeSessionId;
            return (
              <div
                key={session.id}
                className={cn(
                  'group flex shrink-0 cursor-default items-center rounded-md pr-0.5 transition-colors',
                  isActive ? 'bg-muted' : 'hover:bg-muted/50',
                )}
              >
                <TabsTrigger
                  value={session.id}
                  onClick={() => onTabActivate?.(session.id)}
                  className="h-7 flex-none rounded-md px-2 text-xs"
                >
                  <span className="max-w-40 truncate">{session.label}</span>
                </TabsTrigger>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  aria-label={t`Close ${session.label}`}
                  tabIndex={isActive ? 0 : -1}
                  className={cn(
                    'text-muted-foreground opacity-0 transition-opacity hover:text-foreground group-hover:opacity-100 group-focus-within:opacity-100',
                    isActive && 'opacity-100',
                  )}
                  onClick={(event) => {
                    event.stopPropagation();
                    onClose(session.id);
                  }}
                >
                  <XIcon aria-hidden="true" />
                </Button>
              </div>
            );
          })}
        </TabsList>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              aria-label={t`New terminal`}
              className="shrink-0 cursor-pointer text-muted-foreground hover:text-foreground"
              onClick={onNew}
            >
              <PlusIcon aria-hidden="true" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom" sideOffset={8}>
            <Trans>New terminal</Trans>
          </TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              aria-label={
                rightDocked ? t`Dock terminal to the bottom` : t`Dock terminal to the right`
              }
              className="shrink-0 cursor-pointer text-muted-foreground hover:text-foreground"
              onClick={onToggleDock}
            >
              {rightDocked ? (
                <PanelBottomIcon aria-hidden="true" />
              ) : (
                <PanelRightIcon aria-hidden="true" />
              )}
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom" sideOffset={8}>
            {rightDocked ? (
              <Trans>Dock terminal to the bottom</Trans>
            ) : (
              <Trans>Dock terminal to the right</Trans>
            )}
          </TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              aria-label={t`Collapse terminal`}
              className="shrink-0 cursor-pointer text-muted-foreground hover:text-foreground"
              onClick={onCollapse}
            >
              {/* Chevron points the way the panel slides shut: down for the bottom
                  dock, right for the right column. */}
              {rightDocked ? (
                <ChevronRightIcon aria-hidden="true" />
              ) : (
                <ChevronDownIcon aria-hidden="true" />
              )}
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom" sideOffset={8}>
            <Trans>Collapse terminal</Trans>
          </TooltipContent>
        </Tooltip>
      </div>
      {children}
    </Tabs>
  );
}
