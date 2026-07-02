import { beforeEach, describe, expect, mock, test } from 'bun:test';
import type { WorktreeSelectorModel } from '@inkeep/open-knowledge-core';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import {
  cloneElement,
  createContext,
  isValidElement,
  type ReactElement,
  type ReactNode,
  use,
  useEffect,
  useState,
} from 'react';
import type { RecentProjectEntry } from '@/lib/desktop-bridge-types';
import { RecentProjectsMenu } from './RecentProjectsMenu';

type ItemProps = {
  children?: ReactNode;
  disabled?: boolean;
  onSelect?: (e?: unknown) => void;
  [key: string]: unknown;
};

mock.module('@/components/ui/dropdown-menu', () => ({
  DropdownMenuItem: ({ children, onSelect, ...props }: ItemProps) => (
    <div
      role="menuitem"
      tabIndex={-1}
      onClick={(e) => onSelect?.(e as unknown as Event)}
      onKeyDown={() => {}}
      {...props}
    >
      {children}
    </div>
  ),
  DropdownMenuLabel: ({ children, ...props }: ItemProps) => <div {...props}>{children}</div>,
}));
mock.module('@/components/ui/button', () => ({
  Button: ({
    children,
    onClick,
    onMouseDown,
    ...props
  }: ItemProps & {
    onClick?: (e: unknown) => void;
    onMouseDown?: (e: unknown) => void;
  }) => (
    <button
      type="button"
      onClick={(e) => onClick?.(e)}
      onMouseDown={(e) => onMouseDown?.(e)}
      {...props}
    >
      {children}
    </button>
  ),
}));

const PopoverStateContext = createContext<{ open: boolean; onOpenChange: (o: boolean) => void }>({
  open: false,
  onOpenChange: () => {},
});
mock.module('@/components/ui/popover', () => ({
  Popover: ({
    children,
    open,
    onOpenChange,
  }: {
    children?: ReactNode;
    open?: boolean;
    onOpenChange?: (o: boolean) => void;
  }) => (
    <PopoverStateContext value={{ open: !!open, onOpenChange: onOpenChange ?? (() => {}) }}>
      {children}
    </PopoverStateContext>
  ),
  PopoverTrigger: ({ children }: { children?: ReactNode }) => {
    const { open, onOpenChange } = use(PopoverStateContext);
    if (!isValidElement(children)) return <>{children}</>;
    const child = children as ReactElement<{ onClick?: (e: unknown) => void }>;
    return cloneElement(child, {
      onClick: (e: unknown) => {
        child.props.onClick?.(e);
        onOpenChange(!open);
      },
    });
  },
  PopoverContent: ({
    children,
    side: _side,
    align: _align,
    sideOffset: _sideOffset,
    onPointerDownOutside: _onPointerDownOutside,
    onFocusOutside: _onFocusOutside,
    onOpenAutoFocus,
    ...props
  }: ItemProps & { onOpenAutoFocus?: (e: Event) => void }) => {
    const { open } = use(PopoverStateContext);
    useEffect(() => {
      if (open) onOpenAutoFocus?.(new Event('focus'));
    }, [open, onOpenAutoFocus]);
    if (!open) return null;
    return <div {...props}>{children}</div>;
  },
}));

mock.module('@/components/ui/input-group', () => ({
  InputGroup: ({ children, ...props }: ItemProps) => <div {...props}>{children}</div>,
  InputGroupAddon: ({ children }: { children?: ReactNode }) => <span>{children}</span>,
  InputGroupInput: (props: React.InputHTMLAttributes<HTMLInputElement>) => <input {...props} />,
}));

const refreshWorktrees = mock(() => {});
mock.module('@/lib/worktree-store', () => ({ refreshWorktrees }));
const toastError = mock((_msg: string) => {});
mock.module('sonner', () => ({ toast: { error: toastError, success: mock(() => {}) } }));

function main(path: string, commonDir: string): RecentProjectEntry {
  return {
    path,
    name: path.split('/').pop() ?? path,
    lastOpenedAt: '2026-07-01',
    gitCommonDir: commonDir,
    mainRoot: path,
    isLinkedWorktree: false,
    branch: 'main',
  };
}
function worktree(
  path: string,
  commonDir: string,
  mainRoot: string,
  branch: string,
  lastOpenedAt = '2026-07-01',
): RecentProjectEntry {
  return {
    path,
    name: path.split('/').pop() ?? path,
    lastOpenedAt,
    gitCommonDir: commonDir,
    mainRoot,
    isLinkedWorktree: true,
    branch,
  };
}
function nonGit(path: string): RecentProjectEntry {
  return { path, name: path.split('/').pop() ?? path, lastOpenedAt: '2026-07-01' };
}

function model(
  entries: WorktreeSelectorModel['entries'],
  mainRoot = '/repo',
): WorktreeSelectorModel {
  return { mainRoot, currentBranch: 'main', entries, remoteBranches: [] };
}

function createBridge() {
  return {
    project: { open: mock(() => Promise.resolve()) },
    worktree: {
      create: mock(() =>
        Promise.resolve({
          ok: true as const,
          path: '/repo/.ok/worktrees/feature-x',
          created: true,
        }),
      ),
    },
  };
}

const noGuard = () => false;

function Host({
  bridge,
  recents,
  currentPath,
  query,
  worktreeModel,
  closeMenu,
  openNewWorktreeWith,
}: {
  bridge: ReturnType<typeof createBridge>;
  recents: RecentProjectEntry[];
  currentPath: string;
  query: string;
  worktreeModel: WorktreeSelectorModel | null;
  closeMenu: () => void;
  openNewWorktreeWith: (name: string) => void;
}) {
  const [flyoutPath, setFlyoutPath] = useState<string | null>(null);
  return (
    <RecentProjectsMenu
      bridge={bridge as never}
      recents={recents}
      currentPath={currentPath}
      query={query}
      worktreeModel={worktreeModel}
      closeMenu={closeMenu}
      guardStaleSelect={noGuard}
      flyoutPath={flyoutPath}
      setFlyoutPath={setFlyoutPath}
      openNewWorktreeWith={openNewWorktreeWith}
    />
  );
}

function renderMenu(
  overrides: Partial<{
    bridge: ReturnType<typeof createBridge>;
    recents: RecentProjectEntry[];
    currentPath: string;
    query: string;
    worktreeModel: WorktreeSelectorModel | null;
    closeMenu: () => void;
    openNewWorktreeWith: (name: string) => void;
  }> = {},
) {
  const bridge = overrides.bridge ?? createBridge();
  const closeMenu = overrides.closeMenu ?? mock(() => {});
  const openNewWorktreeWith = overrides.openNewWorktreeWith ?? mock((_name: string) => {});
  render(
    <Host
      bridge={bridge}
      recents={overrides.recents ?? []}
      currentPath={overrides.currentPath ?? '/other'}
      query={overrides.query ?? ''}
      worktreeModel={overrides.worktreeModel ?? null}
      closeMenu={closeMenu}
      openNewWorktreeWith={openNewWorktreeWith}
    />,
  );
  return { bridge, closeMenu, openNewWorktreeWith };
}

describe('RecentProjectsMenu — grouped browse (no query)', () => {
  beforeEach(cleanup);

  test('project rows carry NO folder icon (switcher stays focused on names)', () => {
    renderMenu({ recents: [nonGit('/notes')] });
    const row = screen.getByTestId('project-switcher-recent-/notes');
    expect(row.querySelector('svg')).toBeNull();
  });

  test('the expander opens the worktree flyout (does not open the project)', async () => {
    const { bridge } = renderMenu({
      recents: [
        main('/repo', '/repo/.git'),
        worktree('/repo/.ok/worktrees/dev', '/repo/.git', '/repo', 'dev'),
      ],
    });

    const groupRow = screen.getByTestId('project-switcher-group-/repo');
    expect(groupRow.textContent).toContain('/repo');
    expect(screen.queryByTestId('project-switcher-flyout-/repo')).toBeNull();

    const toggle = screen.getByTestId('project-switcher-toggle-/repo');
    expect(toggle.querySelectorAll('svg').length).toBe(1);
    expect(toggle.textContent).toContain('1 worktree');
    expect(toggle.textContent).not.toContain('1 worktrees');

    fireEvent.click(screen.getByTestId('project-switcher-toggle-/repo'));
    await waitFor(() => {
      expect(screen.getByTestId('project-switcher-flyout-/repo')).not.toBeNull();
    });
    expect(bridge.project.open).not.toHaveBeenCalled();
  });

  test('hovering the expander opens the flyout (hover-open, not click-only) without opening the project', async () => {
    const { bridge } = renderMenu({
      recents: [
        main('/repo', '/repo/.git'),
        worktree('/repo/.ok/worktrees/dev', '/repo/.git', '/repo', 'dev'),
      ],
    });
    expect(screen.queryByTestId('project-switcher-flyout-/repo')).toBeNull();
    fireEvent.mouseEnter(screen.getByTestId('project-switcher-toggle-/repo'));
    await waitFor(() => {
      expect(screen.getByTestId('project-switcher-flyout-/repo')).not.toBeNull();
    });
    expect(bridge.project.open).not.toHaveBeenCalled();
  });

  test('keyboard: ArrowRight on the group row opens its flyout; ArrowLeft and Escape close it (a11y C7)', async () => {
    const { bridge } = renderMenu({
      recents: [
        main('/repo', '/repo/.git'),
        worktree('/repo/.ok/worktrees/dev', '/repo/.git', '/repo', 'dev'),
      ],
    });
    const row = screen.getByTestId('project-switcher-group-/repo');
    expect(screen.queryByTestId('project-switcher-flyout-/repo')).toBeNull();

    fireEvent.keyDown(row, { key: 'ArrowRight' });
    await waitFor(() => {
      expect(screen.getByTestId('project-switcher-flyout-/repo')).not.toBeNull();
    });
    expect(bridge.project.open).not.toHaveBeenCalled();

    await waitFor(() => {
      expect(document.activeElement).toBe(
        screen.getByTestId('project-switcher-flyout-search-/repo'),
      );
    });

    fireEvent.keyDown(row, { key: 'ArrowLeft' });
    await waitFor(() => {
      expect(screen.queryByTestId('project-switcher-flyout-/repo')).toBeNull();
    });

    fireEvent.keyDown(row, { key: 'ArrowRight' });
    await waitFor(() => {
      expect(screen.getByTestId('project-switcher-flyout-/repo')).not.toBeNull();
    });
    fireEvent.keyDown(row, { key: 'Escape' });
    await waitFor(() => {
      expect(screen.queryByTestId('project-switcher-flyout-/repo')).toBeNull();
    });
  });

  test('the flyout lists the default (main) first, then the opened worktree; opening one opens its window', async () => {
    const { bridge } = renderMenu({
      recents: [
        main('/repo', '/repo/.git'),
        worktree('/repo/.ok/worktrees/dev', '/repo/.git', '/repo', 'dev'),
      ],
    });
    fireEvent.click(screen.getByTestId('project-switcher-toggle-/repo'));

    const mainEntry = await screen.findByTestId('project-switcher-flyout-entry-/repo');
    expect(mainEntry.textContent).toContain('main');
    expect(mainEntry.textContent).toContain('default');
    const devEntry = screen.getByTestId('project-switcher-flyout-entry-/repo/.ok/worktrees/dev');
    expect(devEntry.textContent).toContain('dev');

    expect(mainEntry.querySelector('svg')).toBeNull();
    expect(devEntry.querySelector('svg')).toBeNull();
    const flyoutSearch = screen.getByTestId('project-switcher-flyout-search-/repo');
    expect(flyoutSearch.parentElement?.querySelectorAll('svg').length).toBe(2);

    fireEvent.click(devEntry);
    await waitFor(() => {
      expect(bridge.project.open).toHaveBeenCalledWith({
        path: '/repo/.ok/worktrees/dev',
        target: 'new-window',
        entryPoint: 'worktree',
      });
    });
  });

  test('opened worktrees sort by recency (most-recently-opened first)', async () => {
    renderMenu({
      recents: [
        main('/repo', '/repo/.git'),
        worktree('/repo/.ok/worktrees/older', '/repo/.git', '/repo', 'older', '2026-06-01'),
        worktree('/repo/.ok/worktrees/newer', '/repo/.git', '/repo', 'newer', '2026-06-30'),
      ],
    });
    expect(screen.getByTestId('project-switcher-toggle-/repo').textContent).toContain(
      '2 worktrees',
    );
    fireEvent.click(screen.getByTestId('project-switcher-toggle-/repo'));

    const flyout = await screen.findByTestId('project-switcher-flyout-/repo');
    const ids = [...flyout.querySelectorAll('[data-testid^="project-switcher-flyout-entry-"]')].map(
      (el) => el.getAttribute('data-testid'),
    );
    expect(ids).toEqual([
      'project-switcher-flyout-entry-/repo',
      'project-switcher-flyout-entry-/repo/.ok/worktrees/newer',
      'project-switcher-flyout-entry-/repo/.ok/worktrees/older',
    ]);
  });

  test('the flyout search filters that project’s worktrees + branches; a create-on-demand branch creates its worktree', async () => {
    const { bridge } = renderMenu({
      recents: [
        main('/repo', '/repo/.git'),
        worktree('/repo/.ok/worktrees/dev', '/repo/.git', '/repo', 'dev'),
      ],
      currentPath: '/repo',
      worktreeModel: model([
        { branch: 'main', worktreePath: '/repo', isCurrent: true, isMain: true, locked: false },
        {
          branch: 'dev',
          worktreePath: '/repo/.ok/worktrees/dev',
          isCurrent: false,
          isMain: false,
          locked: false,
        },
        { branch: 'feature-x', worktreePath: null, isCurrent: false, isMain: false, locked: false },
      ]),
    });
    fireEvent.click(screen.getByTestId('project-switcher-toggle-/repo'));
    await screen.findByTestId('project-switcher-flyout-/repo');

    const createRow = screen.getByTestId('project-switcher-flyout-entry-branch:feature-x');
    expect(createRow.textContent).toContain('feature-x');
    expect(createRow.textContent).toContain('create worktree');

    const searchBox = screen.getByTestId(
      'project-switcher-flyout-search-/repo',
    ) as HTMLInputElement;
    expect(searchBox.placeholder).toBe('Search worktrees');
    fireEvent.change(searchBox, { target: { value: 'feature' } });
    await waitFor(() => {
      expect(
        screen.queryByTestId('project-switcher-flyout-entry-/repo/.ok/worktrees/dev'),
      ).toBeNull();
    });
    expect(screen.getByTestId('project-switcher-flyout-entry-branch:feature-x')).not.toBeNull();

    fireEvent.click(screen.getByTestId('project-switcher-flyout-entry-branch:feature-x'));
    await waitFor(() => {
      expect(bridge.worktree.create).toHaveBeenCalledWith({
        branch: 'feature-x',
        createBranch: false,
      });
    });
    await waitFor(() => {
      expect(bridge.project.open).toHaveBeenCalledWith({
        path: '/repo/.ok/worktrees/feature-x',
        target: 'new-window',
        entryPoint: 'worktree',
      });
    });
    expect(refreshWorktrees).toHaveBeenCalled();
  });

  test('the current project flyout offers "Create worktree <query>" when nothing matches; clicking it opens the pre-filled dialog', async () => {
    const openNewWorktreeWith = mock((_name: string) => {});
    renderMenu({
      recents: [
        main('/repo', '/repo/.git'),
        worktree('/repo/.ok/worktrees/dev', '/repo/.git', '/repo', 'dev'),
      ],
      currentPath: '/repo',
      worktreeModel: model([
        { branch: 'main', worktreePath: '/repo', isCurrent: true, isMain: true, locked: false },
        {
          branch: 'dev',
          worktreePath: '/repo/.ok/worktrees/dev',
          isCurrent: false,
          isMain: false,
          locked: false,
        },
      ]),
      openNewWorktreeWith,
    });
    fireEvent.click(screen.getByTestId('project-switcher-toggle-/repo'));
    await screen.findByTestId('project-switcher-flyout-/repo');

    const searchBox = screen.getByTestId(
      'project-switcher-flyout-search-/repo',
    ) as HTMLInputElement;
    fireEvent.change(searchBox, { target: { value: '  new-thing  ' } });
    await waitFor(() => {
      expect(screen.getByText('No matching worktrees or branches.')).not.toBeNull();
    });
    const createOption = screen.getByTestId('project-switcher-flyout-create');
    expect(createOption.textContent).toContain('Create worktree');
    expect(createOption.textContent).toContain('new-thing');

    fireEvent.click(createOption);
    expect(openNewWorktreeWith).toHaveBeenCalledWith('new-thing');
  });

  test('the create option is absent when the query is only whitespace (nothing to name)', async () => {
    renderMenu({
      recents: [
        main('/repo', '/repo/.git'),
        worktree('/repo/.ok/worktrees/dev', '/repo/.git', '/repo', 'dev'),
      ],
      currentPath: '/repo',
      worktreeModel: model([
        { branch: 'main', worktreePath: '/repo', isCurrent: true, isMain: true, locked: false },
        {
          branch: 'dev',
          worktreePath: '/repo/.ok/worktrees/dev',
          isCurrent: false,
          isMain: false,
          locked: false,
        },
      ]),
    });
    fireEvent.click(screen.getByTestId('project-switcher-toggle-/repo'));
    await screen.findByTestId('project-switcher-flyout-/repo');
    const searchBox = screen.getByTestId(
      'project-switcher-flyout-search-/repo',
    ) as HTMLInputElement;
    fireEvent.change(searchBox, { target: { value: '   ' } });
    expect(screen.queryByTestId('project-switcher-flyout-create')).toBeNull();
  });

  test('a NON-current project flyout does NOT offer the create option (creation anchors to the current project)', async () => {
    renderMenu({
      recents: [
        main('/repo', '/repo/.git'),
        worktree('/repo/.ok/worktrees/dev', '/repo/.git', '/repo', 'dev'),
      ],
      currentPath: '/elsewhere',
      worktreeModel: model(
        [
          {
            branch: 'other-branch',
            worktreePath: null,
            isCurrent: false,
            isMain: false,
            locked: false,
          },
        ],
        '/elsewhere',
      ),
    });
    fireEvent.click(screen.getByTestId('project-switcher-toggle-/repo'));
    await screen.findByTestId('project-switcher-flyout-/repo');
    const searchBox = screen.getByTestId(
      'project-switcher-flyout-search-/repo',
    ) as HTMLInputElement;
    fireEvent.change(searchBox, { target: { value: 'zzz-no-match' } });
    await waitFor(() => {
      expect(screen.getByText('No matching worktrees or branches.')).not.toBeNull();
    });
    expect(screen.queryByTestId('project-switcher-flyout-create')).toBeNull();
  });

  test('a non-current project flyout shows only its opened worktrees (no branch model)', async () => {
    renderMenu({
      recents: [
        main('/repo', '/repo/.git'),
        worktree('/repo/.ok/worktrees/dev', '/repo/.git', '/repo', 'dev'),
      ],
      currentPath: '/elsewhere',
      worktreeModel: model(
        [
          {
            branch: 'other-branch',
            worktreePath: null,
            isCurrent: false,
            isMain: false,
            locked: false,
          },
        ],
        '/elsewhere',
      ),
    });
    fireEvent.click(screen.getByTestId('project-switcher-toggle-/repo'));
    const flyout = await screen.findByTestId('project-switcher-flyout-/repo');
    expect(flyout.textContent).not.toContain('other-branch');
    expect(screen.getByTestId('project-switcher-flyout-entry-/repo')).not.toBeNull();
    expect(
      screen.getByTestId('project-switcher-flyout-entry-/repo/.ok/worktrees/dev'),
    ).not.toBeNull();
  });

  test('clicking the project name opens the bare project (root), not the flyout', async () => {
    const { bridge } = renderMenu({
      recents: [
        main('/repo', '/repo/.git'),
        worktree('/repo/.ok/worktrees/dev', '/repo/.git', '/repo', 'dev'),
      ],
    });
    fireEvent.click(screen.getByTestId('project-switcher-group-/repo'));
    await waitFor(() => {
      expect(bridge.project.open).toHaveBeenCalledWith({
        path: '/repo',
        target: 'new-window',
        entryPoint: 'recents',
      });
    });
  });

  test('a non-git recent is a flat row that opens with the recents entry point', async () => {
    const { bridge } = renderMenu({ recents: [nonGit('/notes')] });
    expect(screen.queryByTestId('project-switcher-group-/notes')).toBeNull();
    fireEvent.click(screen.getByTestId('project-switcher-recent-/notes'));
    await waitFor(() => {
      expect(bridge.project.open).toHaveBeenCalledWith({
        path: '/notes',
        target: 'new-window',
        entryPoint: 'recents',
      });
    });
  });

  test('the current project row no-ops on select and just closes the menu', async () => {
    const { bridge, closeMenu } = renderMenu({
      recents: [nonGit('/notes')],
      currentPath: '/notes',
    });
    fireEvent.click(screen.getByTestId('project-switcher-recent-/notes'));
    expect(bridge.project.open).not.toHaveBeenCalled();
    expect(closeMenu).toHaveBeenCalled();
  });

  test('a repo present only via a worktree synthesizes the project row', async () => {
    renderMenu({
      recents: [worktree('/repo/.ok/worktrees/dev', '/repo/.git', '/repo', 'dev')],
    });
    const groupRow = screen.getByTestId('project-switcher-group-/repo');
    expect(groupRow.textContent).toContain('/repo');
    fireEvent.click(screen.getByTestId('project-switcher-toggle-/repo'));
    await screen.findByTestId('project-switcher-flyout-/repo');
    expect(
      screen.getByTestId('project-switcher-flyout-entry-/repo/.ok/worktrees/dev'),
    ).not.toBeNull();
    expect(screen.queryByTestId('project-switcher-flyout-entry-/repo')).toBeNull();
  });
});

describe('RecentProjectsMenu — flyout keyboard navigation (item 29)', () => {
  beforeEach(cleanup);

  function openThreeRowFlyout() {
    const utils = renderMenu({
      recents: [
        main('/repo', '/repo/.git'),
        worktree('/repo/.ok/worktrees/older', '/repo/.git', '/repo', 'older', '2026-06-01'),
        worktree('/repo/.ok/worktrees/newer', '/repo/.git', '/repo', 'newer', '2026-06-30'),
      ],
    });
    fireEvent.keyDown(screen.getByTestId('project-switcher-group-/repo'), { key: 'ArrowRight' });
    return utils;
  }

  const row = (key: string) => screen.getByTestId(`project-switcher-flyout-entry-${key}`);

  test('ArrowDown from the search input moves focus to the first entry row', async () => {
    openThreeRowFlyout();
    const search = await screen.findByTestId('project-switcher-flyout-search-/repo');
    await waitFor(() => expect(document.activeElement).toBe(search));

    fireEvent.keyDown(search, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(row('/repo'));
  });

  test('ArrowDown / ArrowUp rove through the entry rows and clamp at the ends', async () => {
    openThreeRowFlyout();
    const search = await screen.findByTestId('project-switcher-flyout-search-/repo');
    await waitFor(() => expect(document.activeElement).toBe(search));

    fireEvent.keyDown(search, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(row('/repo'));

    fireEvent.keyDown(row('/repo'), { key: 'ArrowDown' });
    expect(document.activeElement).toBe(row('/repo/.ok/worktrees/newer'));
    fireEvent.keyDown(row('/repo/.ok/worktrees/newer'), { key: 'ArrowDown' });
    expect(document.activeElement).toBe(row('/repo/.ok/worktrees/older'));

    fireEvent.keyDown(row('/repo/.ok/worktrees/older'), { key: 'ArrowDown' });
    expect(document.activeElement).toBe(row('/repo/.ok/worktrees/older'));

    fireEvent.keyDown(row('/repo/.ok/worktrees/older'), { key: 'ArrowUp' });
    expect(document.activeElement).toBe(row('/repo/.ok/worktrees/newer'));
    fireEvent.keyDown(row('/repo/.ok/worktrees/newer'), { key: 'ArrowUp' });
    expect(document.activeElement).toBe(row('/repo'));
  });

  test('ArrowUp from the first entry row returns focus to the search input', async () => {
    openThreeRowFlyout();
    const search = await screen.findByTestId('project-switcher-flyout-search-/repo');
    await waitFor(() => expect(document.activeElement).toBe(search));

    fireEvent.keyDown(search, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(row('/repo'));

    fireEvent.keyDown(row('/repo'), { key: 'ArrowUp' });
    expect(document.activeElement).toBe(search);
  });

  test('Enter on a focused entry row opens that worktree (same action as a click)', async () => {
    const { bridge } = openThreeRowFlyout();
    const search = await screen.findByTestId('project-switcher-flyout-search-/repo');
    await waitFor(() => expect(document.activeElement).toBe(search));

    fireEvent.keyDown(search, { key: 'ArrowDown' });
    fireEvent.keyDown(row('/repo'), { key: 'ArrowDown' });
    expect(document.activeElement).toBe(row('/repo/.ok/worktrees/newer'));

    fireEvent.keyDown(row('/repo/.ok/worktrees/newer'), { key: 'Enter' });
    await waitFor(() => {
      expect(bridge.project.open).toHaveBeenCalledWith({
        path: '/repo/.ok/worktrees/newer',
        target: 'new-window',
        entryPoint: 'worktree',
      });
    });
  });

  test('typing in the search still filters the list, and ArrowDown enters the filtered rows', async () => {
    openThreeRowFlyout();
    const search = (await screen.findByTestId(
      'project-switcher-flyout-search-/repo',
    )) as HTMLInputElement;
    await waitFor(() => expect(document.activeElement).toBe(search));

    fireEvent.change(search, { target: { value: 'newer' } });
    await waitFor(() => {
      expect(
        screen.queryByTestId('project-switcher-flyout-entry-/repo/.ok/worktrees/older'),
      ).toBeNull();
    });
    fireEvent.keyDown(search, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(row('/repo/.ok/worktrees/newer'));
  });
});

describe('RecentProjectsMenu — search (cross-project)', () => {
  beforeEach(cleanup);

  test('project search rows carry NO folder icon', () => {
    renderMenu({ recents: [main('/repo', '/repo/.git')], query: 'repo' });
    const row = screen.getByTestId('project-switcher-recent-/repo');
    expect(row.querySelector('svg')).toBeNull();
  });

  test('matches an opened worktree by branch name and opens it as a worktree', async () => {
    const { bridge } = renderMenu({
      recents: [
        main('/repo', '/repo/.git'),
        worktree('/repo/.ok/worktrees/dev', '/repo/.git', '/repo', 'dev'),
      ],
      query: 'dev',
    });
    const row = screen.getByTestId('project-switcher-worktree-/repo/.ok/worktrees/dev');
    expect(row.textContent).toContain('dev');
    expect(row.textContent).toContain('repo');
    fireEvent.click(row);
    await waitFor(() => {
      expect(bridge.project.open).toHaveBeenCalledWith({
        path: '/repo/.ok/worktrees/dev',
        target: 'new-window',
        entryPoint: 'worktree',
      });
    });
  });

  test('matches an un-opened branch from the cached model and creates its worktree on demand', async () => {
    const { bridge } = renderMenu({
      query: 'feature',
      worktreeModel: model([
        { branch: 'feature-x', worktreePath: null, isCurrent: false, isMain: false, locked: false },
      ]),
    });
    expect(screen.getByTestId('project-switcher-branch-feature-x').textContent).toContain('repo');
    fireEvent.click(screen.getByTestId('project-switcher-branch-feature-x'));
    await waitFor(() => {
      expect(bridge.worktree.create).toHaveBeenCalledWith({
        branch: 'feature-x',
        createBranch: false,
      });
    });
    await waitFor(() => {
      expect(bridge.project.open).toHaveBeenCalledWith({
        path: '/repo/.ok/worktrees/feature-x',
        target: 'new-window',
        entryPoint: 'worktree',
      });
    });
    expect(refreshWorktrees).toHaveBeenCalled();
  });

  test('does not double-list a branch already shown as an opened worktree', () => {
    renderMenu({
      recents: [worktree('/repo/.ok/worktrees/dev', '/repo/.git', '/repo', 'dev')],
      query: 'dev',
      worktreeModel: model([
        {
          branch: 'dev',
          worktreePath: '/repo/.ok/worktrees/dev',
          isCurrent: false,
          isMain: false,
          locked: false,
        },
      ]),
    });
    expect(screen.getByTestId('project-switcher-worktree-/repo/.ok/worktrees/dev')).not.toBeNull();
    expect(screen.queryByTestId('project-switcher-branch-dev')).toBeNull();
  });

  test('announces when nothing matches', () => {
    renderMenu({ recents: [main('/repo', '/repo/.git')], query: 'zzz-nothing' });
    expect(screen.getByRole('status').textContent).toBe('No matching projects.');
  });

  test('a failed create-on-demand toasts and does not open a window', async () => {
    toastError.mockClear();
    const bridge = createBridge();
    bridge.worktree.create = mock(() =>
      Promise.resolve({ ok: false as const, reason: 'branch-exists' as const }),
    );
    renderMenu({
      bridge,
      query: 'feature',
      worktreeModel: model([
        { branch: 'feature-x', worktreePath: null, isCurrent: false, isMain: false, locked: false },
      ]),
    });
    fireEvent.click(screen.getByTestId('project-switcher-branch-feature-x'));
    await waitFor(() => expect(bridge.worktree.create).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(toastError).toHaveBeenCalled());
    expect(bridge.project.open).not.toHaveBeenCalled();
  });
});
