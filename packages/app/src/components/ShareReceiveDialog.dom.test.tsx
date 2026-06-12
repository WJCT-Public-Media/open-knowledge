import { afterEach, beforeEach, describe, expect, mock, spyOn, test } from 'bun:test';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import type { OkShareReceivedPayload } from '@/lib/desktop-bridge-types';
import { renderLinguiTemplate } from '@/test-utils/lingui-mock';

type SharePayload = OkShareReceivedPayload | null;

function createTestStore(initial: SharePayload) {
  let current = initial;
  const listeners = new Set<() => void>();
  return {
    dismiss: mock(() => {
      current = null;
      for (const listener of listeners) listener();
    }),
    getSnapshot: () => current,
    install: () => undefined,
    set(next: SharePayload) {
      current = next;
      for (const listener of listeners) listener();
    },
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

function okPayload(
  overrides: Partial<Extract<OkShareReceivedPayload, { kind: 'launcher-miss' }>['share']> = {},
): Extract<OkShareReceivedPayload, { kind: 'launcher-miss' }> {
  return {
    kind: 'launcher-miss',
    share: {
      owner: 'inkeep',
      repo: 'open-knowledge',
      branch: 'main',
      sharedUrl: 'https://github.com/inkeep/open-knowledge/blob/main/docs/guide.md',
      target: { kind: 'doc', docPath: 'docs/guide.md' },
      ...overrides,
    },
  };
}

const toast = {
  error: mock((_message: string, _opts?: unknown) => {}),
  info: mock((_message: string, _opts?: unknown) => {}),
  success: mock((_message: string, _opts?: unknown) => {}),
};

mock.module('@lingui/react/macro', () => ({
  Trans: ({ children }: { children?: ReactNode }) => <>{children}</>,
  useLingui: () => ({ t: renderLinguiTemplate }),
}));

mock.module('sonner', () => ({
  toast,
}));

mock.module('@/components/ui/button', () => ({
  Button: ({
    children,
    className: _className,
    variant: _variant,
    ...props
  }: {
    children?: ReactNode;
    className?: string;
    variant?: string;
    [key: string]: unknown;
  }) => (
    <button type="button" {...props}>
      {children}
    </button>
  ),
}));

mock.module('@/components/ui/dialog', () => ({
  Dialog: ({ children, open }: { children?: ReactNode; open?: boolean }) =>
    open ? <div data-testid="dialog-root">{children}</div> : null,
  DialogBody: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  DialogContent: ({
    children,
    onInteractOutside: _onInteractOutside,
    onPointerDownOutside: _onPointerDownOutside,
    ...props
  }: {
    children?: ReactNode;
    onInteractOutside?: unknown;
    onPointerDownOutside?: unknown;
    [key: string]: unknown;
  }) => <section {...props}>{children}</section>,
  DialogDescription: ({ children, ...props }: { children?: ReactNode; [key: string]: unknown }) => (
    <p {...props}>{children}</p>
  ),
  DialogFooter: ({ children }: { children?: ReactNode }) => <footer>{children}</footer>,
  DialogHeader: ({ children }: { children?: ReactNode }) => <header>{children}</header>,
  DialogTitle: ({ children }: { children?: ReactNode }) => <h2>{children}</h2>,
}));

function createBridge() {
  const folderPicks: Array<string | null> = [];
  const validationResults: unknown[] = [];
  return {
    __folderPicks: folderPicks,
    __validationResults: validationResults,
    dialog: {
      openFolder: mock(() => Promise.resolve(folderPicks.shift() ?? null)),
    },
    navigator: {
      open: mock(() => Promise.resolve()),
    },
    project: {
      awaitBranchSwitched: mock(() => Promise.resolve({ ok: true as const })),
      checkDocExists: mock(() => Promise.resolve('exists')),
      fetchBranchInfo: mock(() =>
        Promise.resolve({
          branchIsLocal: true,
          currentBranch: 'main',
          currentHeadSha: null,
          detached: false,
          dirtyConflicts: { conflicts: false, files: [] },
          shareFileExists: true,
        }),
      ),
      listRecent: mock(() => Promise.resolve([])),
      open: mock(() => Promise.resolve()),
      readHeadBranch: mock(() =>
        Promise.resolve({ currentBranch: 'main', detached: false, headSha: null }),
      ),
      runCheckout: mock(() => Promise.resolve({ ok: true as const })),
    },
    share: {
      validateLocalFolder: mock(() =>
        Promise.resolve(validationResults.shift() ?? { kind: 'ok', gitRemoteUrl: '' }),
      ),
    },
  };
}

async function renderDialog({
  bridge = createBridge(),
  cloneController,
  store = createTestStore(okPayload()),
}: {
  bridge?: ReturnType<typeof createBridge>;
  cloneController?: {
    getAuthStatus: () => Promise<{ authenticated: boolean; host: string; login?: string }>;
    runClone: (args: { url: string; branch?: string | null }) => Promise<unknown>;
    startSignIn: () => Promise<{ authenticated: boolean; host: string; login?: string } | null>;
  };
  store?: ReturnType<typeof createTestStore>;
} = {}) {
  const { ShareReceiveDialog } = await import('./ShareReceiveDialog');
  render(
    <ShareReceiveDialog
      bridge={bridge as never}
      cloneController={cloneController as never}
      store={store as never}
    />,
  );
  return { bridge, store };
}

describe('ShareReceiveDialog runtime behavior', () => {
  let consoleLogSpy: ReturnType<typeof spyOn>;
  let consoleWarnSpy: ReturnType<typeof spyOn>;

  beforeEach(() => {
    for (const fn of [toast.error, toast.info, toast.success]) fn.mockClear();
    consoleLogSpy = spyOn(console, 'log').mockImplementation(() => {});
    consoleWarnSpy = spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    cleanup();
    consoleLogSpy.mockRestore();
    consoleWarnSpy.mockRestore();
  });

  test('exports the named component through a runtime import', async () => {
    const mod = await import('./ShareReceiveDialog');
    expect(typeof mod.ShareReceiveDialog).toBe('function');
  });

  test('clone failure leaves the dialog mounted and the sign-in affordance visible', async () => {
    const cloneController = {
      getAuthStatus: mock(() => Promise.resolve({ authenticated: false, host: 'github.com' })),
      runClone: mock(() => Promise.resolve({ kind: 'error' })),
      startSignIn: mock(() => Promise.resolve(null)),
    };

    await renderDialog({ cloneController });

    await waitFor(() =>
      expect((screen.getByTestId('share-receive-clone') as HTMLButtonElement).disabled).toBe(false),
    );

    fireEvent.click(screen.getByTestId('share-receive-clone'));
    await waitFor(() => expect(cloneController.runClone).toHaveBeenCalled());

    expect(screen.getByTestId('share-receive-dialog')).toBeTruthy();
    expect(screen.getByTestId('share-receive-signin')).toBeTruthy();
  });

  test('non-ok payloads toast and dismiss without mounting the dialog', async () => {
    const store = createTestStore({ kind: 'invalid' });
    await renderDialog({ store });

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Invalid share URL.'));
    expect(store.dismiss).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('share-receive-dialog')).toBeNull();
  });

  test('Q2 miss renders metadata, anonymous clone without sign-in, sign-in affordance, clone success, and local picker recovery', async () => {
    const bridge = createBridge();
    const store = createTestStore(okPayload({ branch: 'feat/share' }));
    const cloneController = {
      getAuthStatus: mock(() => Promise.resolve({ authenticated: false, host: 'github.com' })),
      runClone: mock(() => Promise.resolve({ kind: 'ok', dir: '/cloned/open-knowledge' })),
      startSignIn: mock(() =>
        Promise.resolve({ authenticated: true, host: 'github.com', login: 'alice' }),
      ),
    };
    bridge.__folderPicks.push('/wrong', '/right');
    bridge.__validationResults.push(
      { kind: 'wrong-repo', actualOwner: 'fork', actualRepo: 'repo' },
      { kind: 'ok', gitRemoteUrl: 'https://github.com/inkeep/open-knowledge.git' },
    );

    await renderDialog({ bridge, cloneController, store });

    expect(await screen.findByTestId('share-receive-dialog')).toBeTruthy();
    expect(screen.getByTestId('share-receive-metadata').textContent).toContain(
      'inkeep/open-knowledge',
    );
    expect(screen.getByTestId('share-receive-metadata').textContent).toContain('docs/guide.md');
    expect(screen.getByTestId('share-receive-metadata-branch').textContent).toBe('feat/share');
    await waitFor(() =>
      expect(screen.getByTestId('share-receive-clone').textContent).toContain(
        'Clone to a new folder',
      ),
    );
    expect((screen.getByTestId('share-receive-clone') as HTMLButtonElement).disabled).toBe(false);
    expect(await screen.findByTestId('share-receive-signin')).toBeTruthy();

    fireEvent.click(screen.getByTestId('share-receive-clone'));
    await waitFor(() =>
      expect(cloneController.runClone).toHaveBeenCalledWith({
        branch: 'feat/share',
        url: 'https://github.com/inkeep/open-knowledge.git',
      }),
    );
    await waitFor(() =>
      expect(bridge.project.open).toHaveBeenCalledWith({
        entryPoint: 'share-receive',
        path: '/cloned/open-knowledge',
        pendingDeepLinkTarget: { kind: 'doc', path: 'docs/guide.md' },
        target: 'new-window',
      }),
    );

    act(() => {
      store.set(okPayload({ branch: 'feat/share' }));
    });
    await screen.findByTestId('share-receive-dialog');
    fireEvent.click(screen.getByTestId('share-receive-local'));
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        'This folder is a clone of fork/repo, not inkeep/open-knowledge. Pick a different folder?',
      ),
    );
    await waitFor(() =>
      expect(bridge.project.open).toHaveBeenCalledWith({
        entryPoint: 'share-receive',
        path: '/right',
        pendingDeepLinkTarget: { kind: 'doc', path: 'docs/guide.md' },
        target: 'new-window',
      }),
    );
  });
});
