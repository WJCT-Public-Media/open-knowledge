import { afterEach, describe, expect, mock, test } from 'bun:test';
import { cleanup, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { TooltipProvider } from '@/components/ui/tooltip';
import {
  expectVisualClassTokens,
  expectVisualClassTokensAbsent,
} from '@/test-utils/visual-contract';
import type { HandoffDispatchInput } from './handoff/useHandoffDispatch';

mock.module('@lingui/react/macro', () => ({
  Trans: ({ children }: { children: ReactNode }) => <>{children}</>,
  useLingui: () => ({
    t: (strings: TemplateStringsArray, ...values: unknown[]) =>
      strings.reduce((acc, part, index) => `${acc}${part}${values[index] ?? ''}`, ''),
  }),
}));

let activeDocName: string | null = 'docs/notes';
let activeTarget: unknown = { kind: 'doc' };
let sidebarState: 'expanded' | 'collapsed' = 'expanded';
let isDraggingRail = false;
let workspace: { contentDir: string; pathSeparator: string } | null = {
  contentDir: '/tmp/project',
  pathSeparator: '/',
};
let latestHandoffInput: HandoffDispatchInput | null | undefined;

mock.module('@/editor/DocumentContext', () => ({
  useDocumentContext: () => ({ activeDocName, activeTarget }),
}));

mock.module('@/lib/use-workspace', () => ({
  useWorkspace: () => workspace,
}));

mock.module('@/components/ui/sidebar', () => ({
  useSidebar: () => ({ state: sidebarState, isDraggingRail }),
  SidebarTrigger: ({ className }: { className?: string }) => (
    <button type="button" data-testid="sidebar-trigger" className={className}>
      sidebar
    </button>
  ),
}));

mock.module('./EditorTabs', () => ({
  EditorTabs: () => <div data-testid="editor-tabs" />,
}));

mock.module('./handoff/OpenInAgentMenu', () => ({
  OpenInAgentMenu: ({ input }: { input: HandoffDispatchInput | null }) => {
    latestHandoffInput = input;
    return <div data-testid="open-in-agent-menu" data-has-input={String(input !== null)} />;
  },
}));

mock.module('./ShareButton', () => ({
  ShareButton: () => <button type="button">Share</button>,
}));

mock.module('./PublishToGitHubDialog', () => ({
  PublishToGitHubDialog: ({ open }: { open: boolean }) => (
    <div data-testid="publish-dialog" data-open={String(open)} />
  ),
}));

mock.module('./SyncStatusBadge', () => ({
  SyncStatusBadge: () => <div data-testid="sync-status-badge" />,
}));

mock.module('@/presence/PresenceBar', () => ({
  PresenceBar: () => <div data-testid="presence-bar" />,
}));

mock.module('./BetaBadge', () => ({
  BetaBadge: () => <div data-testid="beta-badge" />,
}));

mock.module('./SettingsButton', () => ({
  SettingsButton: () => <button type="button">Settings</button>,
}));

mock.module('./HelpPopover', () => ({
  HelpPopover: () => <button type="button">Resources</button>,
}));

function setElectronHost(enabled: boolean) {
  Object.defineProperty(window, 'okDesktop', {
    configurable: true,
    value: enabled ? {} : undefined,
  });
}

async function renderHeader() {
  const { EditorHeader } = await import('./EditorHeader');
  render(
    <TooltipProvider>
      <EditorHeader />
    </TooltipProvider>,
  );
  return document.querySelector('header') as HTMLElement;
}

describe('EditorHeader runtime behavior', () => {
  afterEach(() => {
    cleanup();
    setElectronHost(false);
    activeDocName = 'docs/notes';
    activeTarget = { kind: 'doc' };
    sidebarState = 'expanded';
    isDraggingRail = false;
    workspace = { contentDir: '/tmp/project', pathSeparator: '/' };
    latestHandoffInput = undefined;
  });

  test('exports the EditorHeader component', async () => {
    const mod = await import('./EditorHeader');
    expect(typeof mod.EditorHeader).toBe('function');
  });

  test('web host keeps baseline header layout without Electron drag treatment', async () => {
    setElectronHost(false);
    sidebarState = 'collapsed';
    const header = await renderHeader();

    expect(header.getAttribute('data-electron-drag')).toBeNull();
    expectVisualClassTokens(header.className, [
      'flex',
      'h-12',
      'shrink-0',
      'items-center',
      'shadow-[inset_0_-1px_0_var(--border)]',
    ]);
    expectVisualClassTokensAbsent(header.className, [
      '[-webkit-app-region:drag]',
      'pl-[var(--ok-titlebar-reserve-left,1rem)]',
    ]);
    expectVisualClassTokensAbsent(screen.getByTestId('sidebar-trigger').className, [
      '[-webkit-app-region:no-drag]',
    ]);
  });

  test('Electron collapsed-sidebar host enables drag region and traffic-light reserve', async () => {
    setElectronHost(true);
    sidebarState = 'collapsed';
    const header = await renderHeader();

    expect(header.getAttribute('data-electron-drag')).toBe('');
    expectVisualClassTokens(header.className, [
      '[-webkit-app-region:drag]',
      'pl-[var(--ok-titlebar-reserve-left,1rem)]',
      'motion-safe:transition-[padding]',
    ]);
    expectVisualClassTokens(screen.getByTestId('sidebar-trigger').className, [
      '[-webkit-app-region:no-drag]',
    ]);
    const rightZone = header.children.item(1) as HTMLElement;
    expectVisualClassTokens(rightZone.className, ['[&>*]:[-webkit-app-region:no-drag]']);
  });

  test('Electron expanded sidebar keeps drag region but does not reserve traffic-light padding', async () => {
    setElectronHost(true);
    sidebarState = 'expanded';
    const header = await renderHeader();

    expectVisualClassTokens(header.className, ['[-webkit-app-region:drag]']);
    expectVisualClassTokensAbsent(header.className, ['pl-[var(--ok-titlebar-reserve-left,1rem)]']);
  });

  test('rail drag keeps the reserve but drops the padding transition so it snaps with the sidebar', async () => {
    setElectronHost(true);
    sidebarState = 'collapsed';
    isDraggingRail = true;
    const header = await renderHeader();

    expectVisualClassTokens(header.className, ['pl-[var(--ok-titlebar-reserve-left,1rem)]']);
    expectVisualClassTokensAbsent(header.className, ['motion-safe:transition-[padding]']);
  });

  test('renders tabs and action cluster without project or asset-title chrome', async () => {
    await renderHeader();

    expect(screen.getByTestId('editor-tabs')).toBeTruthy();
    expect(screen.getByTestId('open-in-agent-menu')).toBeTruthy();
    expect(screen.queryByText('projectName')).toBeNull();
    expect(screen.queryByText('assetFileName')).toBeNull();
  });

  test('document target builds file-scope handoff input', async () => {
    activeDocName = 'docs/notes';
    activeTarget = { kind: 'doc' };
    await renderHeader();

    expect(latestHandoffInput?.docContext).toEqual({ relativePath: 'docs/notes.md' });
    expect(latestHandoffInput?.docPath).toBe('/tmp/project/docs/notes.md');
  });

  test('folder target builds folder-scope handoff input', async () => {
    activeDocName = null;
    activeTarget = { kind: 'folder', folderPath: 'team' };
    await renderHeader();

    expect(latestHandoffInput).toMatchObject({
      docContext: null,
      folderRelativePath: 'team',
      projectDir: '/tmp/project',
      docPath: '',
    });
  });

  test('null target builds project-scope handoff input so the menu still renders', async () => {
    activeDocName = null;
    activeTarget = null;
    await renderHeader();

    expect(screen.getByTestId('open-in-agent-menu')).toBeTruthy();
    expect(latestHandoffInput).toMatchObject({
      docContext: null,
      projectDir: '/tmp/project',
      docPath: '',
    });
  });

  test('workspace-missing folder scope disables handoff without hiding the menu', async () => {
    activeDocName = null;
    activeTarget = { kind: 'folder', folderPath: 'team' };
    workspace = null;
    await renderHeader();

    expect(screen.getByTestId('open-in-agent-menu').getAttribute('data-has-input')).toBe('false');
    expect(latestHandoffInput).toBeNull();
  });
});
