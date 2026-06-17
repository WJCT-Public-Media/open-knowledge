import { beforeEach, describe, expect, mock, test } from 'bun:test';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { type ReactNode, useState } from 'react';
import { renderLinguiTemplate } from '@/test-utils/lingui-mock';

type SyncStatus = {
  state: string;
  hasRemote: boolean;
  pausedReason?: string;
  pushPermission?: {
    checkStatus: 'allowed' | 'denied' | 'unknown';
    deniedReason?: string;
    unknownError?: string;
  };
  syncEnabled?: boolean;
  remote?: { label: string; webUrl: string | null } | null;
} | null;

let syncStatus: SyncStatus = null;
let projectLocalConfig: { autoSync?: { enabled?: boolean } } | null = {
  autoSync: { enabled: true },
};
let projectLocalSynced = true;
let syncWriterCalls: boolean[] = [];
let okignoreProps: Array<{ binding: unknown; synced: boolean }> = [];
let installDialogProps: Array<{
  open: boolean;
  onOpenChange: (open: boolean) => void;
  reinstall: boolean;
}> = [];
let publishDialogProps: Array<{ open: boolean }> = [];
let claudeRefreshCalls = 0;
let claudeSkillInstalled = false;

const actualCore = await import('@inkeep/open-knowledge-core');

mock.module('@inkeep/open-knowledge-core', () => ({
  ...actualCore,
  SHOW_INSTALL_SKILL: true,
}));

mock.module('@lingui/react/macro', () => ({
  Plural: ({ value, one, other }: { value: number; one: string; other: string }) => (
    <>{(value === 1 ? one : other).replace('#', String(value))}</>
  ),
  Trans: ({ children }: { children?: ReactNode }) => <>{children}</>,
  useLingui: () => ({ t: renderLinguiTemplate }),
}));

mock.module('@lingui/core/macro', () => ({
  msg: renderLinguiTemplate,
  plural: (value: number, options: { one: string; other: string }) =>
    (value === 1 ? options.one : options.other).replace('#', String(value)),
  t: renderLinguiTemplate,
}));

mock.module('@/components/ui/button', () => ({
  Button: ({ children, ...props }: { children?: ReactNode; [key: string]: unknown }) => (
    <button type="button" {...props}>
      {children}
    </button>
  ),
}));

mock.module('@/components/ui/collapsible', () => ({
  Collapsible: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  CollapsibleContent: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  CollapsibleTrigger: ({ children }: { children?: ReactNode }) => <>{children}</>,
}));

mock.module('@/components/ui/switch', () => ({
  Switch: ({
    checked,
    disabled,
    onCheckedChange,
    ...props
  }: {
    checked?: boolean;
    disabled?: boolean;
    onCheckedChange?: (checked: boolean) => void;
    [key: string]: unknown;
  }) => (
    <button
      type="button"
      role="switch"
      aria-checked={checked ? 'true' : 'false'}
      disabled={disabled}
      onClick={() => onCheckedChange?.(!checked)}
      {...props}
    />
  ),
}));

mock.module('@/components/ui/skeleton', () => ({
  Skeleton: ({ className }: { className?: string }) => <div className={className} />,
}));

mock.module('@/components/ui/form', () => ({
  Form: ({ children }: { children?: ReactNode }) => <form>{children}</form>,
  FormControl: ({ children }: { children?: ReactNode }) => <>{children}</>,
  FormDescription: ({ children }: { children?: ReactNode }) => <p>{children}</p>,
  FormField: () => null,
  FormItem: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  FormLabel: ({ children }: { children?: ReactNode }) => <span>{children}</span>,
  FormMessage: () => null,
}));

mock.module('@/components/ui/input', () => ({
  Input: (props: React.InputHTMLAttributes<HTMLInputElement>) => <input {...props} />,
}));

mock.module('@/components/ui/toggle-group', () => ({
  ToggleGroup: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  ToggleGroupItem: ({ children, ...props }: { children?: ReactNode; [key: string]: unknown }) => (
    <button type="button" {...props}>
      {children}
    </button>
  ),
}));

mock.module('@/components/ui/tooltip', () => ({
  TooltipProvider: ({ children }: { children?: ReactNode }) => <>{children}</>,
  Tooltip: ({ children }: { children?: ReactNode }) => <>{children}</>,
  TooltipContent: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  TooltipTrigger: ({ children }: { children?: ReactNode }) => <>{children}</>,
}));

mock.module('@/components/PublishToGitHubDialog', () => ({
  PublishToGitHubDialog: (props: { open: boolean }) => {
    publishDialogProps.push(props);
    return <div data-open={String(props.open)} data-testid="publish-dialog" />;
  },
}));

mock.module('@/components/InstallInClaudeDesktopDialog', () => ({
  InstallInClaudeDesktopDialog: (props: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    reinstall: boolean;
  }) => {
    installDialogProps.push(props);
    return (
      <div
        data-open={String(props.open)}
        data-reinstall={String(props.reinstall)}
        data-testid="install-claude-dialog"
      />
    );
  },
}));

mock.module('./OkignoreSection', () => ({
  OkignoreSection: (props: { binding: unknown; synced: boolean }) => {
    okignoreProps.push(props);
    return <div data-testid="okignore-section">okignore synced: {String(props.synced)}</div>;
  },
}));

mock.module('./ProjectTemplatesSection', () => ({
  ProjectTemplatesSection: () => <div data-testid="project-templates-section" />,
}));

mock.module('@/hooks/use-git-sync-status', () => ({
  useGitSyncStatus: () => syncStatus,
  useGitSyncStatusDetailed: () => ({ status: syncStatus, fetchError: null }),
}));

mock.module('@/lib/config-provider', () => ({
  useConfigContext: () => ({
    projectLocalConfig,
    projectLocalSynced,
  }),
}));

mock.module('@/hooks/use-enable-sync-with-confirm', () => ({
  useSyncEnabledWriter: () => ({
    write: (enabled: boolean) => {
      syncWriterCalls.push(enabled);
      return true;
    },
  }),
  useEnableSyncWithConfirm: (writer: { write: (enabled: boolean) => boolean }) => {
    const [confirmOpen, setConfirmOpen] = useState(false);
    return {
      confirmOpen,
      setConfirmOpen,
      onToggleRequest: (enabled: boolean) => {
        if (enabled) {
          setConfirmOpen(true);
          return;
        }
        writer.write(false);
      },
      onConfirm: () => {
        writer.write(true);
        setConfirmOpen(false);
      },
    };
  },
  EnableSyncConfirmDialog: () => null,
}));

mock.module('@/components/EnableSyncConfirmDialog', () => ({
  EnableSyncConfirmDialog: ({ open, onConfirm }: { open: boolean; onConfirm: () => void }) => (
    <div data-open={String(open)} data-testid="sync-confirm-dialog">
      <button type="button" onClick={onConfirm}>
        Confirm sync
      </button>
    </div>
  ),
}));

mock.module('@/lib/handoff/use-claude-desktop-integration', () => ({
  useClaudeDesktopIntegration: () => ({
    desktopPresent: true,
    skillInstalled: claudeSkillInstalled,
    skillVersion: claudeSkillInstalled ? '1.0.0' : null,
    refresh: () => {
      claudeRefreshCalls += 1;
    },
  }),
}));

async function renderBody(
  props: {
    activeId: string;
    userBinding?: unknown;
    okignoreBinding?: unknown;
    okignoreSynced?: boolean;
  } = { activeId: 'sync' },
) {
  const { SettingsDialogBody } = await import('./SettingsDialogBody');
  render(
    <SettingsDialogBody
      activeId={props.activeId}
      userBinding={(props.userBinding ?? null) as never}
      okignoreBinding={(props.okignoreBinding ?? null) as never}
      okignoreSynced={props.okignoreSynced ?? false}
    />,
  );
}

describe('SettingsDialogBody section runtime dispatch', () => {
  beforeEach(() => {
    cleanup();
    syncStatus = null;
    projectLocalConfig = { autoSync: { enabled: true } };
    projectLocalSynced = true;
    syncWriterCalls = [];
    okignoreProps = [];
    installDialogProps = [];
    publishDialogProps = [];
    claudeRefreshCalls = 0;
    claudeSkillInstalled = false;
  });

  test('body dispatches heavy project sections without owning a Dialog frame', async () => {
    const okignoreBinding = { id: 'okignore-binding' };

    await renderBody({ activeId: 'okignore', okignoreBinding, okignoreSynced: true });

    expect(screen.getByTestId('okignore-section').textContent).toContain('true');
    expect(okignoreProps.at(-1)).toEqual({ binding: okignoreBinding, synced: true });
    expect(screen.queryByRole('dialog')).toBeNull();

    cleanup();
    await renderBody({ activeId: 'project-templates' });
    expect(screen.getByTestId('project-templates-section')).not.toBeNull();
    expect(screen.queryByRole('dialog')).toBeNull();

    cleanup();
    await renderBody({ activeId: 'terminal' });
    expect(screen.getByTestId('settings-terminal-body')).not.toBeNull();
  });

  test('hotkeys section renders from the shared shortcut registry', async () => {
    await renderBody({ activeId: 'hotkeys' });

    expect(screen.getByTestId('settings-hotkeys')).not.toBeNull();
    expect(screen.getByTestId('settings-hotkeys-list').textContent).toContain('Editor');
    expect(screen.getAllByText('Workspace').length).toBeGreaterThan(0);
  });

  test('sync section reads checked state from project-local config and keeps the writer/confirm path', async () => {
    syncStatus = {
      state: 'enabled',
      hasRemote: true,
      syncEnabled: false,
      remote: {
        label: 'inkeep/open-knowledge',
        webUrl: 'https://github.com/inkeep/open-knowledge',
      },
    };
    projectLocalConfig = { autoSync: { enabled: true } };

    await renderBody({ activeId: 'sync' });

    const toggle = screen.getByTestId('settings-sync-toggle');
    expect(toggle.getAttribute('aria-checked')).toBe('true');
    expect(screen.getByTestId('settings-sync-remote-link').getAttribute('href')).toBe(
      'https://github.com/inkeep/open-knowledge',
    );
    expect(screen.getByTestId('settings-sync-remote-link').getAttribute('rel')).toBe(
      'noopener noreferrer',
    );

    fireEvent.click(toggle);
    expect(syncWriterCalls).toEqual([false]);

    cleanup();
    syncStatus = {
      state: 'enabled',
      hasRemote: true,
      syncEnabled: true,
      remote: { label: 'ssh://git.example/repo.git', webUrl: null },
    };
    projectLocalConfig = { autoSync: { enabled: false } };
    projectLocalSynced = false;

    await renderBody({ activeId: 'sync' });

    expect(screen.getByTestId('settings-sync-toggle').getAttribute('aria-checked')).toBe('false');
    expect(screen.getByTestId('settings-sync-toggle').hasAttribute('disabled')).toBe(true);
    expect(screen.getByTestId('settings-sync-remote-label').textContent).toBe(
      'ssh://git.example/repo.git',
    );
  });

  test('sync section disables the toggle with denied-specific accessible copy when push permission is denied', async () => {
    syncStatus = {
      state: 'idle',
      hasRemote: true,
      syncEnabled: false,
      pushPermission: { checkStatus: 'denied', deniedReason: 'no-collaborator' },
      remote: {
        label: 'inkeep/open-knowledge',
        webUrl: 'https://github.com/inkeep/open-knowledge',
      },
    };
    projectLocalConfig = { autoSync: { enabled: false } };
    projectLocalSynced = true;

    await renderBody({ activeId: 'sync' });

    const toggle = screen.getByTestId('settings-sync-toggle') as HTMLButtonElement;
    expect(toggle.disabled).toBe(true);
    expect(toggle.getAttribute('aria-label')).toBe(
      "Sync disabled — you don't have permission to push",
    );
    expect(screen.getByTestId('settings-sync-body').textContent).toContain(
      "you don't have permission to push",
    );
    expect(screen.queryByTestId('settings-sync-reason')).toBeNull();
  });

  test('sync section renders shared paused-reason copy for non-permission pause reasons', async () => {
    syncStatus = {
      state: 'disabled',
      hasRemote: true,
      pausedReason: 'protected-branch',
      syncEnabled: false,
      remote: {
        label: 'inkeep/open-knowledge',
        webUrl: 'https://github.com/inkeep/open-knowledge',
      },
    };
    projectLocalConfig = { autoSync: { enabled: false } };

    await renderBody({ activeId: 'sync' });

    expect(screen.getByTestId('settings-sync-reason').textContent).toBe(
      'Protected branch — cannot push',
    );
  });

  test('sync empty state offers Publish wizard and keeps the advanced git remote path', async () => {
    syncStatus = { state: 'dormant', hasRemote: false, syncEnabled: false };

    await renderBody({ activeId: 'sync' });

    expect(screen.getByTestId('settings-sync-empty').textContent).toContain(
      'lives only on this computer',
    );
    expect(screen.getByText(/git remote add origin/).textContent).toContain(
      'git remote add origin',
    );
    expect(screen.getByTestId('publish-dialog').getAttribute('data-open')).toBe('false');

    fireEvent.click(screen.getByTestId('settings-sync-setup'));

    await waitFor(() => {
      expect(screen.getByTestId('publish-dialog').getAttribute('data-open')).toBe('true');
    });
    expect(publishDialogProps.at(-1)?.open).toBe(true);
  });

  test('integrations row reflects shared Claude Desktop state and refreshes when installer closes', async () => {
    claudeSkillInstalled = false;
    await renderBody({ activeId: 'claude-desktop' });

    expect(screen.getByText('Install in Claude Desktop')).not.toBeNull();
    expect(screen.getByTestId('settings-install-claude-desktop').textContent).toBe('Install');

    fireEvent.click(screen.getByTestId('settings-install-claude-desktop'));
    await waitFor(() => {
      expect(screen.getByTestId('install-claude-dialog').getAttribute('data-open')).toBe('true');
    });
    expect(installDialogProps.at(-1)?.reinstall).toBe(false);

    act(() => {
      installDialogProps.at(-1)?.onOpenChange(false);
    });
    expect(claudeRefreshCalls).toBe(1);

    cleanup();
    claudeSkillInstalled = true;
    await renderBody({ activeId: 'claude-desktop' });

    expect(screen.getByTestId('settings-install-claude-desktop').textContent).toBe('Reinstall');
    expect(screen.getByTestId('install-claude-dialog').getAttribute('data-reinstall')).toBe('true');
  });
});
