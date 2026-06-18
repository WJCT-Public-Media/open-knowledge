// biome-ignore-all lint/plugin/no-raw-html-interactive-element: pre-rule backlog — file uses raw <button>/<input>/<textarea> awaiting shadcn migration; tracked at https://github.com/inkeep/open-knowledge/blob/main/biome-plugins/README.md#no-raw-html-interactive-elementgrit

import {
  CONFIG_DOC_NAME_PROJECT,
  CONFIG_DOC_NAME_USER,
  type Config,
  type ConfigBinding,
  ConfigSchema,
  type ConfigValidationError,
  getFieldMeta,
  humanFormat,
  isKnownConfigError,
  type OkignoreBinding,
  SHOW_INSTALL_SKILL,
} from '@inkeep/open-knowledge-core';
import type { MessageDescriptor } from '@lingui/core';
import { msg } from '@lingui/core/macro';
import { Trans, useLingui } from '@lingui/react/macro';
import { ArrowUpRight, Check, ChevronRight, RotateCcw } from 'lucide-react';
import { useTheme } from 'next-themes';
import { useEffect, useRef, useState } from 'react';
import { type ControllerRenderProps, type FieldPath, useFormContext } from 'react-hook-form';
import { toast } from 'sonner';
import { AuthModal } from '@/components/AuthModal';
import { EnableSyncConfirmDialog } from '@/components/EnableSyncConfirmDialog';
import { InstallInClaudeDesktopDialog } from '@/components/InstallInClaudeDesktopDialog';
import { PublishToGitHubDialog } from '@/components/PublishToGitHubDialog';
import {
  formatPausedReason,
  shouldDisableSyncSwitch,
  shouldOfferSignInAgain,
} from '@/components/SyncStatusBadge';
import { SharingSection } from '@/components/settings/SharingSection';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Kbd } from '@/components/ui/kbd';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
  useEnableSyncWithConfirm,
  useSyncEnabledWriter,
} from '@/hooks/use-enable-sync-with-confirm';
import { useGitSyncStatus } from '@/hooks/use-git-sync-status';
import { useConfigContext } from '@/lib/config-provider';
import { subscribeToConfigValidationRejected } from '@/lib/config-validation-events';
import { useClaudeDesktopIntegration } from '@/lib/handoff/use-claude-desktop-integration';
import {
  formatShortcutBinding,
  formatShortcutTextLabel,
  KEYBOARD_SHORTCUTS,
  SHORTCUT_CATEGORY_LABELS,
  SHORTCUT_CATEGORY_ORDER,
  type ShortcutBinding,
} from '@/lib/keyboard-shortcuts';
import { cn } from '@/lib/utils';
import { AccountSection } from './AccountSection';
import { EmbeddingsKeySection } from './EmbeddingsKeySection';
import { OkignoreSection } from './OkignoreSection';
import { ProjectTemplatesSection } from './ProjectTemplatesSection';
import { SearchSection } from './SearchSection';
import {
  getEnumOptions,
  getFieldDefault,
  getLeafTypeTag,
  resolveLeafSchema,
} from './schema-walker';
import type { SlotForwardedProps } from './slot-forwarded-props';
import { TerminalSection } from './TerminalSection';
import { pickFirstIssueForPath, useConfigForm } from './use-config-form';

type Scope = 'user' | 'project';

interface FieldDef {
  path: string[];
  label: MessageDescriptor;
  description?: MessageDescriptor;
  control?: 'enum-toggle';
}

const FIELDS_USER_PREFERENCES: FieldDef[] = [
  {
    path: ['appearance', 'theme'],
    label: msg`Theme`,
    description: msg`Light, dark, or follow the OS.`,
    control: 'enum-toggle',
  },
  {
    path: ['editor', 'wordWrap'],
    label: msg`Word wrap`,
    description: msg`Wrap long lines in the markdown source editor.`,
  },
  {
    path: ['appearance', 'preview', 'autoOpen'],
    label: msg`Open preview when agent edits`,
    description: msg`When enabled, the agent opens or refreshes the preview after each edit. Disable if you manage your own preview window (OK Desktop, a browser tab on another display, etc.).`,
  },
];

interface SettingsDialogBodyProps {
  activeId: string;
  userBinding: ConfigBinding | null;
  okignoreBinding: OkignoreBinding | null;
  okignoreSynced: boolean;
}

export function SettingsDialogBody({
  activeId,
  userBinding,
  okignoreBinding,
  okignoreSynced,
}: SettingsDialogBodyProps) {
  const { t } = useLingui();
  if (activeId === 'preferences') {
    return userBinding ? (
      <BoundSchemaSection
        title={t`Preferences`}
        description={t`Customize how the editor looks and behaves.`}
        scope="user"
        binding={userBinding}
        fields={FIELDS_USER_PREFERENCES}
      />
    ) : (
      <SectionSkeleton />
    );
  }
  if (activeId === 'hotkeys') {
    return <HotkeysSection />;
  }
  if (activeId === 'account') {
    return (
      <div className="space-y-8">
        <AccountSection />
        <EmbeddingsKeySection />
      </div>
    );
  }
  if (activeId === 'sync') {
    return <SyncSection />;
  }
  if (activeId === 'search') {
    return <SearchSection />;
  }
  if (activeId === 'terminal') {
    return <TerminalSection />;
  }
  if (activeId === 'project-templates') {
    return <ProjectTemplatesSection />;
  }
  if (activeId === 'sharing') {
    return <SharingSection />;
  }
  if (activeId === 'okignore') {
    return <OkignoreSection binding={okignoreBinding} synced={okignoreSynced} />;
  }
  if (activeId === 'claude-desktop') {
    return <IntegrationsSection />;
  }
  return null;
}

function firstIssuePath(error: ConfigValidationError): string | null {
  if (!isKnownConfigError(error) || error.code !== 'SCHEMA_INVALID') return null;
  const first = error.issues[0];
  if (!first || first.path.length === 0) return null;
  return first.path.map(String).join('.');
}

function SectionSkeleton() {
  return (
    <div className="space-y-3">
      <Skeleton className="h-5 w-32" />
      <Skeleton className="h-4 w-64" />
      <div className="space-y-2">
        <Skeleton className="h-9 w-full" />
        <Skeleton className="h-9 w-full" />
      </div>
    </div>
  );
}

function ShortcutBindingChips({ binding }: { binding: ShortcutBinding }) {
  return formatShortcutBinding(binding)
    .split(' / ')
    .map((part, index) =>
      index === 0 ? (
        <Kbd key={`kbd-${part}`} aria-label={formatShortcutTextLabel(part)}>
          {part}
        </Kbd>
      ) : (
        <span key={`or-${part}`} className="inline-flex items-center gap-1.5">
          <span className="sr-only">
            <Trans> or </Trans>
          </span>
          <span aria-hidden="true"> / </span>
          <Kbd aria-label={formatShortcutTextLabel(part)}>{part}</Kbd>
        </span>
      ),
    );
}

function HotkeysSection() {
  const { t } = useLingui();
  const titleId = 'settings-hotkeys-title';
  return (
    <section aria-labelledby={titleId} className="space-y-5" data-testid="settings-hotkeys">
      <div className="space-y-1">
        <h3 id={titleId} className="text-base font-semibold">
          <Trans>Hotkeys</Trans>
        </h3>
        <p className="text-sm text-muted-foreground">
          <Trans>Keyboard shortcuts available in the editor and workspace.</Trans>
        </p>
      </div>

      <div className="space-y-6" data-testid="settings-hotkeys-list">
        {SHORTCUT_CATEGORY_ORDER.map((category) => {
          const shortcuts = KEYBOARD_SHORTCUTS.filter((shortcut) => shortcut.category === category);
          if (shortcuts.length === 0) return null;

          return (
            <section key={category} aria-labelledby={`settings-hotkeys-${category}`}>
              <h4
                id={`settings-hotkeys-${category}`}
                className="mb-2 font-mono text-muted-foreground text-xs uppercase tracking-wide"
              >
                {t(SHORTCUT_CATEGORY_LABELS[category])}
              </h4>
              <ul
                aria-labelledby={`settings-hotkeys-${category}`}
                className="m-0 list-none overflow-hidden rounded-md border p-0"
              >
                {shortcuts.map((shortcut) => {
                  const shortcutTitleId = `settings-hotkey-${shortcut.id}-title`;
                  const shortcutDescriptionId = `settings-hotkey-${shortcut.id}-description`;
                  const bindingChipCount = shortcut.bindings.reduce(
                    (count, binding) => count + formatShortcutBinding(binding).split(' / ').length,
                    0,
                  );
                  const hasDenseBindings = bindingChipCount > 4;

                  return (
                    <li
                      key={shortcut.id}
                      aria-describedby={shortcutDescriptionId}
                      aria-labelledby={shortcutTitleId}
                      className={cn(
                        'grid gap-2 border-border border-b px-3 py-3 last:border-b-0',
                        hasDenseBindings
                          ? 'sm:grid-cols-1'
                          : 'sm:grid-cols-[minmax(0,1fr)_minmax(0,auto)]',
                      )}
                      data-testid={`settings-hotkey-${shortcut.id}`}
                    >
                      <div className="min-w-0 space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-medium text-sm" id={shortcutTitleId}>
                            {t(shortcut.title)}
                          </p>
                          <Badge variant="gray">
                            <span className="sr-only">
                              <Trans>Scope: </Trans>
                            </span>
                            {t(shortcut.scope)}
                          </Badge>
                        </div>
                        <p className="text-muted-foreground text-sm" id={shortcutDescriptionId}>
                          {t(shortcut.description)}
                        </p>
                      </div>
                      <div
                        className={cn(
                          'flex min-w-0 max-w-full self-start content-start flex-wrap items-start gap-1.5',
                          hasDenseBindings ? 'sm:justify-start' : 'sm:max-w-[38rem] sm:justify-end',
                        )}
                      >
                        {shortcut.bindings.map((binding) => (
                          <ShortcutBindingChips
                            key={`${shortcut.id}-${binding.mac}-${binding.windowsLinux}`}
                            binding={binding}
                          />
                        ))}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })}
      </div>
    </section>
  );
}

interface BoundSchemaSectionProps {
  title: string;
  description: string;
  scope: Scope;
  binding: ConfigBinding;
  fields: FieldDef[];
}

function BoundSchemaSection({
  title,
  description,
  scope,
  binding,
  fields,
}: BoundSchemaSectionProps) {
  const { form, commitField } = useConfigForm(binding);
  const [flashedPath, setFlashedPath] = useState<string | null>(null);
  const flashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const docName = scope === 'project' ? CONFIG_DOC_NAME_PROJECT : CONFIG_DOC_NAME_USER;
    const unsubscribe = subscribeToConfigValidationRejected((event) => {
      if (event.docName !== docName) return;

      toast.error(humanFormat(event.error), { duration: 8000 });

      const path = firstIssuePath(event.error);
      if (path) {
        form.setError(path as FieldPath<Config>, {
          type: 'config-validation-rejected',
          message: pickFirstIssueForPath(event.error, path),
        });
        form.setFocus(path as FieldPath<Config>);
        setFlashedPath(path);
        if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
        flashTimerRef.current = setTimeout(() => {
          setFlashedPath(null);
          form.clearErrors(path as FieldPath<Config>);
        }, 600);
      }
    });
    return () => {
      unsubscribe();
      if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
    };
  }, [scope, form]);

  return (
    <Form {...form}>
      <SchemaSection
        title={title}
        description={description}
        scope={scope}
        fields={fields}
        commitField={commitField}
        flashedPath={flashedPath}
      />
    </Form>
  );
}

interface SchemaSectionProps {
  title: string;
  description: string;
  scope: Scope;
  fields: FieldDef[];
  commitField: (name: FieldPath<Config>) => boolean;
  flashedPath: string | null;
}

function SchemaSection({
  title,
  description,
  scope,
  fields,
  commitField,
  flashedPath,
}: SchemaSectionProps) {
  const titleId = `settings-section-${scope}-title`;
  return (
    <section aria-labelledby={titleId} className="space-y-3">
      <div className="space-y-1">
        <h3 id={titleId} className="text-base font-semibold">
          {title}
        </h3>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      <div className="space-y-10">
        {fields.map((field) => (
          <SettingsField
            key={field.path.join('.')}
            field={field}
            scope={scope}
            commitField={commitField}
            isFlashed={flashedPath === field.path.join('.')}
          />
        ))}
      </div>
    </section>
  );
}

function SyncSection() {
  const { t } = useLingui();
  const status = useGitSyncStatus();
  const { projectLocalConfig, projectLocalSynced } = useConfigContext();
  const writer = useSyncEnabledWriter();
  const { confirmOpen, setConfirmOpen, onToggleRequest, onConfirm } =
    useEnableSyncWithConfirm(writer);
  const [publishOpen, setPublishOpen] = useState(false);
  const [authModalOpen, setAuthModalOpen] = useState(false);

  if (status && !status.hasRemote && status.state === 'dormant') {
    return (
      <section
        aria-labelledby="settings-sync-title"
        className="space-y-4"
        data-testid="settings-sync-empty"
      >
        <div className="space-y-1">
          <h3 id="settings-sync-title" className="text-base font-semibold">
            <Trans>Sync</Trans>
          </h3>
          <p className="text-sm text-muted-foreground">
            <Trans>
              This project lives only on this computer. Connect it to GitHub to back it up and share
              it with other people.
            </Trans>
          </p>
        </div>
        <div className="flex items-center justify-between gap-3 rounded-md border p-3">
          <div className="space-y-0.5">
            <div className="text-sm font-medium">
              <Trans>Connect to GitHub</Trans>
            </div>
            <p className="text-muted-foreground text-1sm">
              <Trans>We'll create a repository and start syncing — no terminal needed.</Trans>
            </p>
          </div>
          <Button onClick={() => setPublishOpen(true)} data-testid="settings-sync-setup">
            <Trans>Set up syncing</Trans>
          </Button>
        </div>

        <Collapsible>
          <CollapsibleTrigger asChild>
            <Button variant="ghost" size="sm" className="group gap-1 px-1.5 text-muted-foreground">
              <ChevronRight
                className="size-3.5 transition-transform group-data-[state=open]:rotate-90"
                aria-hidden
              />
              <Trans>Connect an existing repository</Trans>
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="px-1.5 pt-2 text-sm text-muted-foreground">
            <Trans>
              Already have a git repository? Add it with{' '}
              <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">
                git remote add origin &lt;url&gt;
              </code>{' '}
              in this project's folder. This page updates automatically once a remote is detected.
            </Trans>
          </CollapsibleContent>
        </Collapsible>

        <PublishToGitHubDialog open={publishOpen} onOpenChange={setPublishOpen} />
      </section>
    );
  }

  const enabled = projectLocalConfig?.autoSync?.enabled ?? false;
  const disabledControl = shouldDisableSyncSwitch(
    projectLocalSynced,
    status?.pushPermission?.checkStatus,
  );
  const isPushDenied =
    status?.pushPermission?.checkStatus === 'denied' ||
    status?.pausedReason === 'no-push-permission';
  const sectionMessage =
    isPushDenied || !status?.pausedReason ? null : formatPausedReason(status.pausedReason);

  return (
    <section aria-labelledby="settings-sync-title" className="space-y-3">
      <div className="space-y-1">
        <h3 id="settings-sync-title" className="text-base font-semibold">
          <Trans>Sync</Trans>
        </h3>
        <p className="text-sm text-muted-foreground">
          <Trans>
            Auto-sync pushes/pulls commits to your git remote on intervals and on save. Toggling on
            requires confirmation.
          </Trans>
        </p>
      </div>
      <div className="rounded-md border p-3">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <label htmlFor="settings-sync-toggle" className="text-sm font-medium">
              <Trans>Git auto-sync</Trans>
            </label>
            <p className="text-muted-foreground text-1sm" data-testid="settings-sync-body">
              {isPushDenied ? (
                <Trans>Auto-sync is off — you don't have permission to push to this repo</Trans>
              ) : enabled ? (
                <Trans>
                  Auto-sync is on — your commits push and remote changes pull on intervals.
                </Trans>
              ) : (
                <Trans>
                  Auto-sync is off — your edits stay local until you commit and push manually.
                </Trans>
              )}
            </p>
            {status?.remote ? (
              <p
                className="text-muted-foreground text-1sm truncate"
                data-testid="settings-sync-remote"
              >
                <Trans>Connected to</Trans>{' '}
                {status.remote.webUrl ? (
                  <a
                    href={status.remote.webUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-foreground hover:text-primary hover:underline inline-flex items-center gap-0.5"
                    aria-label={t`Open ${status.remote.label} on GitHub (opens in a new tab)`}
                    data-testid="settings-sync-remote-link"
                  >
                    <span>{status.remote.label}</span>
                    <ArrowUpRight className="inline size-3.5" aria-hidden />
                  </a>
                ) : (
                  <span
                    className="font-medium text-foreground"
                    data-testid="settings-sync-remote-label"
                  >
                    {status.remote.label}
                  </span>
                )}
              </p>
            ) : null}
          </div>
          <Switch
            id="settings-sync-toggle"
            checked={enabled}
            disabled={disabledControl}
            onCheckedChange={onToggleRequest}
            aria-label={
              status?.pushPermission?.checkStatus === 'denied'
                ? t`Sync disabled — you don't have permission to push`
                : enabled
                  ? t`Disable git auto-sync`
                  : t`Enable git auto-sync`
            }
            data-testid="settings-sync-toggle"
          />
        </div>
        {sectionMessage !== null && (
          <p className="text-1sm text-muted-foreground mt-2" data-testid="settings-sync-reason">
            {sectionMessage}
          </p>
        )}
        {shouldOfferSignInAgain(status?.pushPermission) && (
          <div className="mt-2 flex items-start gap-2" data-testid="settings-sync-signin-again">
            <p className="text-1sm text-muted-foreground flex-1 min-w-0">
              <Trans>Your GitHub session expired — sign in again to verify push access.</Trans>
            </p>
            <Button
              variant="outline"
              size="xs"
              className="self-start"
              onClick={() => setAuthModalOpen(true)}
            >
              <Trans>Sign in</Trans>
            </Button>
          </div>
        )}
      </div>
      <EnableSyncConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        onConfirm={onConfirm}
      />
      <AuthModal
        open={authModalOpen}
        onOpenChange={setAuthModalOpen}
        onSuccess={() => setAuthModalOpen(false)}
      />
    </section>
  );
}

interface SettingsFieldProps {
  field: FieldDef;
  scope: Scope;
  commitField: (name: FieldPath<Config>) => boolean;
  isFlashed: boolean;
}

function SettingsField({ field, scope, commitField, isFlashed }: SettingsFieldProps) {
  'use no memo';
  const { t } = useLingui();
  const form = useFormContext<Config>();
  const leafSchema = resolveLeafSchema(ConfigSchema, field.path);
  const typeTag = leafSchema ? getLeafTypeTag(leafSchema) : undefined;
  const defaultValue = leafSchema ? getFieldDefault(leafSchema) : undefined;
  const enumOptions = leafSchema ? getEnumOptions(leafSchema) : undefined;

  const meta = leafSchema ? getFieldMeta(leafSchema) : undefined;
  const scopeMismatch =
    (meta?.scope === 'project' && scope !== 'project') ||
    (meta?.scope === 'user' && scope !== 'user');

  const dottedName = field.path.join('.') as FieldPath<Config>;
  const labelText = t(field.label);

  const [savedTick, setSavedTick] = useState(false);
  const savedTickTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (savedTickTimerRef.current) clearTimeout(savedTickTimerRef.current);
    },
    [],
  );

  const flashSavedTick = () => {
    setSavedTick(true);
    if (savedTickTimerRef.current) clearTimeout(savedTickTimerRef.current);
    savedTickTimerRef.current = setTimeout(() => setSavedTick(false), 1200);
  };

  const runCommit = (): boolean => {
    const ok = commitField(dottedName);
    if (ok) flashSavedTick();
    return ok;
  };

  const runCommitIfDirty = (): boolean => {
    if (!form.getFieldState(dottedName).isDirty) return true;
    return runCommit();
  };

  const reset = () => {
    const target = defaultValue === undefined ? null : defaultValue;
    form.setValue(dottedName, target as never, { shouldDirty: false });
    runCommit();
  };

  const wrapperClass = cn('relative', isFlashed && 'animate-settings-flash');

  return (
    <FormField
      control={form.control}
      name={dottedName}
      render={({ field: ctl }) => {
        const showResetButton =
          !scopeMismatch && (defaultValue !== undefined || ctl.value !== undefined);

        return (
          <FormItem className={wrapperClass} data-field={field.path.join('.')} data-scope={scope}>
            <div className="flex items-center justify-between gap-2">
              <FormLabel className="text-sm font-medium">{labelText}</FormLabel>
              {showResetButton ? (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-5 w-5 text-muted-foreground opacity-60 hover:opacity-100"
                      onClick={reset}
                      aria-label={t`Reset ${labelText} to default`}
                    >
                      <RotateCcw className="size-3.5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <Trans>Reset to default</Trans>
                  </TooltipContent>
                </Tooltip>
              ) : null}
            </div>
            {field.description ? (
              <FormDescription className="text-muted-foreground text-1sm">
                {t(field.description)}
              </FormDescription>
            ) : null}
            <div className="flex items-center gap-2">
              <FormControl>
                <FieldControlBody
                  field={field}
                  ctl={ctl}
                  typeTag={typeTag}
                  enumOptions={enumOptions}
                  onCommit={runCommitIfDirty}
                />
              </FormControl>
              <SavedIndicator visible={savedTick} />
            </div>
            <FormMessage data-field-error={field.path.join('.')} />
          </FormItem>
        );
      }}
    />
  );
}

interface FieldControlBodyProps {
  field: FieldDef;
  ctl: ControllerRenderProps<Config, FieldPath<Config>>;
  typeTag: string | undefined;
  enumOptions: readonly string[] | undefined;
  onCommit: () => boolean;
}

function FieldControlBody({
  field,
  ctl,
  typeTag,
  enumOptions,
  onCommit,
  ...slotForwarded
}: FieldControlBodyProps & SlotForwardedProps) {
  'use no memo';
  const { t } = useLingui();
  const { setTheme } = useTheme();
  if (typeTag === 'boolean') {
    return (
      <Switch
        {...slotForwarded}
        checked={Boolean(ctl.value)}
        ref={ctl.ref}
        onCheckedChange={(next) => {
          ctl.onChange(next);
          onCommit();
        }}
        onBlur={ctl.onBlur}
      />
    );
  }
  if (typeTag === 'enum' && enumOptions && enumOptions.length > 0) {
    if (field.control === 'enum-toggle' || enumOptions.length <= 4) {
      const { id: forwardedId, ...wrapperSlotProps } = slotForwarded;
      const isThemeField = field.path[0] === 'appearance' && field.path[1] === 'theme';
      return (
        <ToggleGroup
          {...wrapperSlotProps}
          type="single"
          value={typeof ctl.value === 'string' ? ctl.value : ''}
          ref={ctl.ref}
          onValueChange={(next) => {
            if (!next) return;
            if (isThemeField) setTheme(next);
            ctl.onChange(next);
            onCommit();
          }}
          onBlur={ctl.onBlur}
          variant="segmented"
          size="sm"
          spacing={1}
          className="bg-muted dark:bg-background p-0.5 rounded-lg"
          aria-label={t(field.label)}
        >
          {enumOptions.map((opt, idx) => (
            <ToggleGroupItem
              key={opt}
              value={opt}
              id={idx === 0 ? forwardedId : undefined}
              className="text-1sm capitalize"
            >
              {opt}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      );
    }
  }
  if (typeTag === 'number' || typeTag === 'int') {
    return <NumberControlBody ctl={ctl} onCommit={onCommit} {...slotForwarded} />;
  }
  if (typeTag === 'array') {
    return <StringArrayControlBody ctl={ctl} onCommit={onCommit} {...slotForwarded} />;
  }
  return <StringControlBody ctl={ctl} onCommit={onCommit} {...slotForwarded} />;
}

function StringControlBody({
  ctl,
  onCommit,
  ...slotForwarded
}: {
  ctl: ControllerRenderProps<Config, FieldPath<Config>>;
  onCommit: () => boolean;
} & SlotForwardedProps) {
  'use no memo';
  return (
    <Input
      {...slotForwarded}
      value={typeof ctl.value === 'string' ? ctl.value : ''}
      ref={ctl.ref}
      onChange={(e) => ctl.onChange(e.target.value)}
      onBlur={() => {
        ctl.onBlur();
        onCommit();
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          onCommit();
        }
      }}
      className="h-8 text-sm"
    />
  );
}

function NumberControlBody({
  ctl,
  onCommit,
  ...slotForwarded
}: {
  ctl: ControllerRenderProps<Config, FieldPath<Config>>;
  onCommit: () => boolean;
} & SlotForwardedProps) {
  'use no memo';
  const [pendingText, setPendingText] = useState(ctl.value === undefined ? '' : String(ctl.value));
  const lastSyncedValueRef = useRef(ctl.value);

  useEffect(() => {
    if (lastSyncedValueRef.current === ctl.value) return;
    setPendingText(ctl.value === undefined ? '' : String(ctl.value));
    lastSyncedValueRef.current = ctl.value;
  }, [ctl.value]);

  const commitText = () => {
    const parsed = Number(pendingText);
    if (!Number.isFinite(parsed)) {
      ctl.onChange(pendingText as unknown as number);
      onCommit();
      return;
    }
    ctl.onChange(parsed);
    onCommit();
    lastSyncedValueRef.current = parsed as unknown as Config[keyof Config];
  };

  return (
    <Input
      {...slotForwarded}
      type="number"
      value={pendingText}
      ref={ctl.ref}
      onChange={(e) => setPendingText(e.target.value)}
      onBlur={() => {
        ctl.onBlur();
        commitText();
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          commitText();
        }
      }}
      className="h-8 w-28 text-sm tabular-nums"
    />
  );
}

function StringArrayControlBody({
  ctl,
  onCommit,
  ...slotForwarded
}: {
  ctl: ControllerRenderProps<Config, FieldPath<Config>>;
  onCommit: () => boolean;
} & SlotForwardedProps) {
  'use no memo';
  const initial = Array.isArray(ctl.value) ? (ctl.value as string[]).join('\n') : '';
  const [pendingText, setPendingText] = useState(initial);
  const lastSyncedRef = useRef(initial);

  useEffect(() => {
    const incoming = Array.isArray(ctl.value) ? (ctl.value as string[]).join('\n') : '';
    if (incoming === lastSyncedRef.current) return;
    setPendingText(incoming);
    lastSyncedRef.current = incoming;
  }, [ctl.value]);

  const commitText = () => {
    const parsed = pendingText
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
    ctl.onChange(parsed);
    onCommit();
    lastSyncedRef.current = parsed.join('\n');
  };

  return (
    <textarea
      {...slotForwarded}
      value={pendingText}
      ref={ctl.ref}
      onChange={(e) => setPendingText(e.target.value)}
      onBlur={() => {
        ctl.onBlur();
        commitText();
      }}
      rows={Math.max(2, Math.min(6, pendingText.split('\n').length))}
      className="min-h-16 w-full rounded-md border border-input bg-background px-3 py-1.5 font-mono text-xs outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40"
    />
  );
}

function SavedIndicator({ visible }: { visible: boolean }) {
  return (
    <span role="status" aria-live="polite" className="text-emerald-600">
      {visible ? (
        <>
          <Check aria-hidden="true" className="size-3.5" />
          <span className="sr-only">
            <Trans>Saved</Trans>
          </span>
        </>
      ) : null}
    </span>
  );
}

function IntegrationsSection() {
  const [installOpen, setInstallOpen] = useState(false);
  const { skillInstalled, refresh } = useClaudeDesktopIntegration();
  if (!SHOW_INSTALL_SKILL) return null;

  return (
    <section aria-labelledby="settings-integrations-title" className="space-y-3">
      <div className="space-y-1">
        <h3 id="settings-integrations-title" className="text-base font-semibold">
          <Trans>Integrations</Trans>
        </h3>
        <p className="text-sm text-muted-foreground">
          <Trans>Connect Open Knowledge to other tools you use.</Trans>
        </p>
      </div>
      <div className="rounded-md border p-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-sm font-medium">
              <Trans>Install in Claude Desktop</Trans>
            </div>
            <p className="text-muted-foreground text-1sm">
              <Trans>Make this knowledge base available as a Claude Skill.</Trans>
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setInstallOpen(true)}
            data-testid="settings-install-claude-desktop"
            className="uppercase font-mono"
          >
            {skillInstalled ? <Trans>Reinstall</Trans> : <Trans>Install</Trans>}
          </Button>
        </div>
      </div>
      <InstallInClaudeDesktopDialog
        open={installOpen}
        onOpenChange={(next) => {
          setInstallOpen(next);
          if (!next) refresh();
        }}
        reinstall={skillInstalled}
      />
    </section>
  );
}
