import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';
import { act, cleanup, render, screen } from '@testing-library/react';
import { type ReactNode, useEffect } from 'react';

type SettingsDialogShellProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

let settingsRouteOpen = false;
let closeSettingsRouteMock = mock(() => {});
let shellProps: SettingsDialogShellProps[] = [];

mock.module('@/lib/perf', () => ({
  mark: () => {},
  ProfilerBoundary: ({ children }: { children: ReactNode }) => children,
}));

mock.module('@/components/PropertyContext', () => ({
  PropertyProvider: ({ children }: { children: ReactNode }) => children,
  useProperties: () => ({ requestAddProperty: () => {} }),
}));

const FOLDER_DOC_CTX = {
  activeDocName: 'folder/index',
  activeProvider: null,
  activeTarget: { kind: 'folder', target: 'folder', folderPath: 'folder' },
  recycleDocument: () => {},
  docPanelMode: 'timeline',
  docPanelAgentId: null,
  docPanelExpandSignal: 0,
};
const EMPTY_DOC_CTX = {
  activeDocName: null,
  activeProvider: null,
  activeTarget: null,
  recycleDocument: () => {},
  docPanelMode: 'timeline',
  docPanelAgentId: null,
  docPanelExpandSignal: 0,
};
const LARGE_FILE_DOC_CTX = {
  activeDocName: 'big',
  activeProvider: null,
  activeTarget: { kind: 'large-file', docName: 'big', size: 9_999_999, limit: 1_000_000 },
  recycleDocument: () => {},
  docPanelMode: 'timeline',
  docPanelAgentId: null,
  docPanelExpandSignal: 0,
};
const ASSET_DOC_CTX = {
  activeDocName: null,
  activeProvider: null,
  activeTarget: { kind: 'asset', assetPath: 'images/diagram.png', mediaKind: 'image' },
  recycleDocument: () => {},
  docPanelMode: 'timeline',
  docPanelAgentId: null,
  docPanelExpandSignal: 0,
};
const FOLDER_LIVE_CTX = { ...FOLDER_DOC_CTX, activeProvider: {} as never };
const DOC_COLD_CTX = {
  activeDocName: null,
  activeProvider: null,
  activeTarget: { kind: 'doc', target: 'some-doc', docName: 'some-doc' },
  recycleDocument: () => {},
  docPanelMode: 'timeline',
  docPanelAgentId: null,
  docPanelExpandSignal: 0,
};
let docCtx:
  | typeof FOLDER_DOC_CTX
  | typeof FOLDER_LIVE_CTX
  | typeof EMPTY_DOC_CTX
  | typeof LARGE_FILE_DOC_CTX
  | typeof ASSET_DOC_CTX
  | typeof DOC_COLD_CTX = FOLDER_DOC_CTX;
mock.module('@/editor/DocumentContext', () => ({
  useDocumentContext: () => docCtx,
  useDocumentTransition: () => ({ openDocumentTransition: null }),
}));

mock.module('@/components/EmptyEditorState', () => ({
  EmptyEditorState: ({ terminalVisible }: { terminalVisible?: boolean }) => (
    <div data-testid="empty-editor-state" data-terminal-visible={String(terminalVisible)} />
  ),
}));

let terminalDockMounts = 0;
mock.module('@/components/EditorSkeleton', () => ({
  EditorSkeleton: () => <div data-testid="editor-skeleton" />,
}));

mock.module('./TerminalDock', () => ({
  TerminalDock: ({ children, visible }: { children: ReactNode; visible?: boolean }) => {
    useEffect(() => {
      terminalDockMounts += 1;
    }, []);
    return (
      <div data-testid="terminal-dock" data-visible={String(visible)}>
        {children}
      </div>
    );
  },
}));

mock.module('react-resizable-panels', () => ({
  usePanelRef: () => ({
    current: {
      collapse: () => {},
      expand: () => {},
    },
  }),
}));

mock.module('@/components/ui/resizable', () => ({
  ResizablePanelGroup: ({ children }: { children: ReactNode }) => (
    <div data-testid="resizable-group">{children}</div>
  ),
  ResizablePanel: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  ResizableHandle: () => <div data-testid="resizable-handle" />,
}));

mock.module('@/hooks/use-doc-panel-layout', () => ({
  useDocPanelLayout: () => ({ layout: 'panel', autoCollapse: false }),
}));

mock.module('@/hooks/use-document-stats', () => ({
  useDocumentStats: () => null,
}));

mock.module('@/hooks/use-lifecycle-status', () => ({
  useLifecycleStatus: () => 'ready',
}));

mock.module('@/presence/use-sync-status', () => ({
  useSyncStatus: () => 'synced',
}));

mock.module('@/components/FolderOverview', () => ({
  FolderOverview: ({ folderPath }: { folderPath: string }) => (
    <div data-testid="folder-overview">{folderPath}</div>
  ),
}));

mock.module('@/components/AssetPreview', () => ({
  AssetPreview: ({ assetPath }: { assetPath: string }) => (
    <div data-testid="asset-preview">{assetPath}</div>
  ),
}));

mock.module('@/components/LargeFileEditorState', () => ({
  LargeFileEditorState: ({ docName }: { docName: string }) => (
    <div data-testid="large-file-state">{docName}</div>
  ),
}));

mock.module('@/components/settings/SettingsDialogShell', () => ({
  SettingsDialogShell: (props: SettingsDialogShellProps) => {
    shellProps.push(props);
    return <div data-testid="settings-shell" data-open={String(props.open)} />;
  },
}));

mock.module('@/lib/use-settings-route', () => ({
  useSettingsRoute: () => ({
    open: settingsRouteOpen,
    close: closeSettingsRouteMock,
  }),
}));

const { EditorArea } = await import('./EditorArea');

function renderEditorArea() {
  return render(
    <EditorArea
      editorMode="wysiwyg"
      onModeChange={() => {}}
      activeTab="timeline"
      onActiveTabChange={() => {}}
    />,
  );
}

describe('EditorArea SettingsDialogPortal runtime wiring', () => {
  beforeEach(() => {
    cleanup();
    docCtx = FOLDER_DOC_CTX;
    settingsRouteOpen = false;
    closeSettingsRouteMock = mock(() => {});
    shellProps = [];
  });

  test('mounts the Settings shell while closed and delegates close to useSettingsRoute', () => {
    renderEditorArea();

    expect(screen.getByTestId('folder-overview').textContent).toBe('folder');
    expect(screen.getByTestId('settings-shell').getAttribute('data-open')).toBe('false');
    expect(shellProps.at(-1)?.open).toBe(false);

    act(() => {
      shellProps.at(-1)?.onOpenChange(true);
    });
    expect(closeSettingsRouteMock).not.toHaveBeenCalled();

    act(() => {
      shellProps.at(-1)?.onOpenChange(false);
    });
    expect(closeSettingsRouteMock).toHaveBeenCalledTimes(1);
  });
});

describe('EditorArea empty-state terminal host', () => {
  beforeEach(() => {
    cleanup();
    docCtx = EMPTY_DOC_CTX;
  });

  test('hosts the docked terminal on the empty state when a terminal bridge is present', () => {
    render(
      <EditorArea
        editorMode="wysiwyg"
        onModeChange={() => {}}
        activeTab="timeline"
        onActiveTabChange={() => {}}
        terminalBridge={{} as never}
        terminalVisible
        onTerminalVisibleChange={() => {}}
        terminalDock="bottom"
      />,
    );

    const dock = screen.getByTestId('terminal-dock');
    expect(dock.getAttribute('data-visible')).toBe('true');
    const emptyState = dock.querySelector('[data-testid="empty-editor-state"]');
    expect(emptyState).not.toBeNull();
    expect(emptyState?.getAttribute('data-terminal-visible')).toBe('true');
  });

  test('keeps the empty-state mascot full-size when the terminal is right-docked', () => {
    render(
      <EditorArea
        editorMode="wysiwyg"
        onModeChange={() => {}}
        activeTab="timeline"
        onActiveTabChange={() => {}}
        terminalBridge={{} as never}
        terminalVisible
        onTerminalVisibleChange={() => {}}
        terminalDock="right"
      />,
    );

    const dock = screen.getByTestId('terminal-dock');
    expect(dock.getAttribute('data-visible')).toBe('true');
    const emptyState = dock.querySelector('[data-testid="empty-editor-state"]');
    expect(emptyState).not.toBeNull();
    expect(emptyState?.getAttribute('data-terminal-visible')).toBe('false');
  });

  test('renders the empty state with no terminal dock on the web host (no bridge)', () => {
    render(
      <EditorArea
        editorMode="wysiwyg"
        onModeChange={() => {}}
        activeTab="timeline"
        onActiveTabChange={() => {}}
      />,
    );

    expect(screen.queryByTestId('terminal-dock')).toBeNull();
    expect(screen.getByTestId('empty-editor-state')).toBeTruthy();
  });
});

describe('EditorArea folder-view terminal host', () => {
  beforeEach(() => {
    cleanup();
    docCtx = FOLDER_DOC_CTX;
  });

  test('hosts the docked terminal in folder view when a terminal bridge is present', () => {
    render(
      <EditorArea
        editorMode="wysiwyg"
        onModeChange={() => {}}
        activeTab="timeline"
        onActiveTabChange={() => {}}
        terminalBridge={{} as never}
        terminalVisible
        onTerminalVisibleChange={() => {}}
      />,
    );

    const dock = screen.getByTestId('terminal-dock');
    expect(dock.getAttribute('data-visible')).toBe('true');
    expect(dock.querySelector('[data-testid="folder-overview"]')).not.toBeNull();
  });

  test('renders the folder view with no terminal dock on the web host (no bridge)', () => {
    renderEditorArea();

    expect(screen.queryByTestId('terminal-dock')).toBeNull();
    expect(screen.getByTestId('folder-overview').textContent).toBe('folder');
  });
});

describe('EditorArea large-file-view terminal host', () => {
  beforeEach(() => {
    cleanup();
    docCtx = LARGE_FILE_DOC_CTX;
  });

  test('hosts the docked terminal in the large-file view when a bridge is present', () => {
    render(
      <EditorArea
        editorMode="wysiwyg"
        onModeChange={() => {}}
        activeTab="timeline"
        onActiveTabChange={() => {}}
        terminalBridge={{} as never}
        terminalVisible
        onTerminalVisibleChange={() => {}}
      />,
    );

    const dock = screen.getByTestId('terminal-dock');
    expect(dock.getAttribute('data-visible')).toBe('true');
    expect(dock.querySelector('[data-testid="large-file-state"]')).not.toBeNull();
  });

  test('renders the large-file view with no terminal dock on the web host (no bridge)', () => {
    renderEditorArea();

    expect(screen.queryByTestId('terminal-dock')).toBeNull();
    expect(screen.getByTestId('large-file-state')).toBeTruthy();
  });
});

describe('EditorArea asset-view terminal host', () => {
  beforeEach(() => {
    cleanup();
    docCtx = ASSET_DOC_CTX;
  });

  test('hosts the docked terminal in the asset view when a bridge is present', () => {
    render(
      <EditorArea
        editorMode="wysiwyg"
        onModeChange={() => {}}
        activeTab="timeline"
        onActiveTabChange={() => {}}
        terminalBridge={{} as never}
        terminalVisible
        onTerminalVisibleChange={() => {}}
      />,
    );

    const dock = screen.getByTestId('terminal-dock');
    expect(dock.getAttribute('data-visible')).toBe('true');
    expect(dock.querySelector('[data-testid="asset-preview"]')).not.toBeNull();
  });

  test('renders the asset view with no terminal dock on the web host (no bridge)', () => {
    renderEditorArea();

    expect(screen.queryByTestId('terminal-dock')).toBeNull();
    expect(screen.getByTestId('asset-preview')).toBeTruthy();
  });
});

describe('EditorArea terminal persists across view-kind switches', () => {
  beforeEach(() => {
    cleanup();
    terminalDockMounts = 0;
    docCtx = FOLDER_DOC_CTX;
  });

  test('keeps a single TerminalDock instance mounted while the active view kind changes', () => {
    const props = {
      editorMode: 'wysiwyg' as const,
      onModeChange: () => {},
      activeTab: 'timeline' as const,
      onActiveTabChange: () => {},
      terminalBridge: {} as never,
      terminalVisible: true,
      onTerminalVisibleChange: () => {},
    };
    const { rerender } = render(<EditorArea {...props} />);
    const mountsAfterInitial = terminalDockMounts;
    expect(mountsAfterInitial).toBeGreaterThan(0);
    expect(
      screen.getByTestId('terminal-dock').querySelector('[data-testid="folder-overview"]'),
    ).not.toBeNull();

    docCtx = ASSET_DOC_CTX;
    rerender(<EditorArea {...props} />);
    expect(
      screen.getByTestId('terminal-dock').querySelector('[data-testid="asset-preview"]'),
    ).not.toBeNull();

    docCtx = LARGE_FILE_DOC_CTX;
    rerender(<EditorArea {...props} />);
    expect(
      screen.getByTestId('terminal-dock').querySelector('[data-testid="large-file-state"]'),
    ).not.toBeNull();

    expect(terminalDockMounts).toBe(mountsAfterInitial);
  });
});

describe('EditorArea hash-load skeleton renders outside the panel group (cold start)', () => {
  beforeEach(() => {
    cleanup();
    docCtx = DOC_COLD_CTX;
  });
  afterEach(() => {
    window.location.hash = '';
  });

  test('renders the load skeleton directly, not inside the terminal dock or panel group', () => {
    window.location.hash = '#/some-doc';
    render(
      <EditorArea
        editorMode="wysiwyg"
        onModeChange={() => {}}
        activeTab="timeline"
        onActiveTabChange={() => {}}
        terminalBridge={{} as never}
        terminalVisible
        onTerminalVisibleChange={() => {}}
      />,
    );

    expect(screen.getByTestId('editor-skeleton')).toBeTruthy();
    expect(screen.queryByTestId('resizable-group')).toBeNull();
    expect(screen.queryByTestId('terminal-dock')).toBeNull();
  });
});

describe('EditorArea terminal persists across a mid-session cold navigation', () => {
  beforeEach(() => {
    cleanup();
    terminalDockMounts = 0;
    window.location.hash = '';
    docCtx = FOLDER_LIVE_CTX;
  });
  afterEach(() => {
    window.location.hash = '';
  });

  test('keeps the dock mounted when a tab close/switch transiently nulls the provider', () => {
    const props = {
      editorMode: 'wysiwyg' as const,
      onModeChange: () => {},
      activeTab: 'timeline' as const,
      onActiveTabChange: () => {},
      terminalBridge: {} as never,
      terminalVisible: true,
      onTerminalVisibleChange: () => {},
    };
    const { rerender } = render(<EditorArea {...props} />);
    const mountsAfterInitial = terminalDockMounts;
    expect(mountsAfterInitial).toBeGreaterThan(0);
    expect(
      screen.getByTestId('terminal-dock').querySelector('[data-testid="folder-overview"]'),
    ).not.toBeNull();

    act(() => {
      docCtx = DOC_COLD_CTX;
      window.location.hash = '#/some-doc';
    });
    rerender(<EditorArea {...props} />);

    const dock = screen.getByTestId('terminal-dock');
    expect(dock.querySelector('[data-testid="editor-skeleton"]')).not.toBeNull();
    expect(terminalDockMounts).toBe(mountsAfterInitial);
    expect(screen.getByTestId('resizable-group')).toBeTruthy();
  });

  test('web host keeps the bare early-return on mid-session cold nav (no dock to preserve)', () => {
    const webProps = {
      editorMode: 'wysiwyg' as const,
      onModeChange: () => {},
      activeTab: 'timeline' as const,
      onActiveTabChange: () => {},
    };
    const { rerender } = render(<EditorArea {...webProps} />);
    act(() => {
      docCtx = DOC_COLD_CTX;
      window.location.hash = '#/some-doc';
    });
    rerender(<EditorArea {...webProps} />);

    expect(screen.getByTestId('editor-skeleton')).toBeTruthy();
    expect(screen.queryByTestId('resizable-group')).toBeNull();
    expect(screen.queryByTestId('terminal-dock')).toBeNull();
  });
});
