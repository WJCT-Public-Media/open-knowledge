import { detectEmbeddedHostFromBrowser } from '@inkeep/open-knowledge-core';
import { Trans, useLingui } from '@lingui/react/macro';
import {
  lazy,
  type ReactNode,
  Suspense,
  useDeferredValue,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { usePanelRef } from 'react-resizable-panels';
import { AssetPreview } from '@/components/AssetPreview';
import { DocPanel, type PanelTab } from '@/components/DocPanel';
import {
  consumePendingDocPanelTabRequest,
  subscribeToDocPanelTabRequests,
} from '@/components/doc-panel-events';
import { EditorSkeleton } from '@/components/EditorSkeleton';
import { EmptyEditorState } from '@/components/EmptyEditorState';
import { FolderOverview } from '@/components/FolderOverview';
import { LargeFileEditorState } from '@/components/LargeFileEditorState';
import { MountStalledAffordance } from '@/components/MountStalledAffordance';
import { PropertyProvider, useProperties } from '@/components/PropertyContext';
import { SettingsDialogShell } from '@/components/settings/SettingsDialogShell';
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable';
import { useDocumentContext, useDocumentTransition } from '@/editor/DocumentContext';
import { FindReplaceController } from '@/editor/find-replace/FindReplaceController';
import { mountPromiseHasResolved } from '@/editor/mount-promise';
import { syncPromiseHasResolved } from '@/editor/sync-promise';
import { useDocumentStats } from '@/hooks/use-document-stats';
import { useLifecycleStatus } from '@/hooks/use-lifecycle-status';
import { useSelectionStats } from '@/hooks/use-selection-stats';
import type { OkDesktopBridge } from '@/lib/desktop-bridge-types';
import { docNameFromHash, hashFromDocName } from '@/lib/doc-hash';
import { getInitialDocPanelWidth, writeDocPanelWidth } from '@/lib/doc-panel-width-store';
import { matchesKeyboardShortcut } from '@/lib/keyboard-shortcuts';
import { ProfilerBoundary } from '@/lib/perf';
import { RIGHT_COLLAPSE_THRESHOLD, resolvePartition } from '@/lib/sidebar-partition';
import { applyToggle, readPins, resolveEffectiveState } from '@/lib/sidebar-pin-store';
import { useSettingsRoute } from '@/lib/use-settings-route';
import { cn } from '@/lib/utils';
import { useSyncStatus } from '@/presence/use-sync-status';
import { EditorActivityPool } from './EditorActivityPool';
import { EditorFooter } from './EditorFooter';
import type { EditorMode, TerminalLaunchIntent } from './EditorPane';
import { EditorToolbar } from './EditorToolbar';
import { shouldPaintOverlay } from './editor-area-overlay';
import { TerminalDock } from './TerminalDock';

const LazyActivityModeContent = lazy(async () => {
  const mod = await import('@/components/ActivityModeContent');
  return { default: mod.ActivityModeContent };
});

const DOC_PANEL_MIN_SIZE = '300px';
const DOC_PANEL_MAX_SIZE = '600px';

interface EditorAreaProps {
  editorMode: EditorMode;
  onModeChange: (mode: EditorMode) => void;
  activeTab: PanelTab;
  onActiveTabChange: (tab: PanelTab) => void;
  terminalBridge?: OkDesktopBridge | null;
  terminalVisible?: boolean;
  onTerminalVisibleChange?: (visible: boolean) => void;
  /** "Open in terminal" launch intent — carried to the terminal session, which
   *  writes the `claude` launch once per nonce. Null until a UI click. */
  terminalLaunch?: TerminalLaunchIntent | null;
}

export function EditorArea(props: EditorAreaProps) {
  return (
    <ProfilerBoundary name="editor-area">
      {/* PropertyProvider scopes the cross-tree property-panel signal bus
          to the editor surface — both the toolbar (button → dispatcher)
          and EditorActivityPool's PropertyPanel mounts (consumers) live
          underneath. Replaces the prior `BEGIN_ADD_EVENT` window event,
          whose global broadcast leaked across hidden Activity boundaries.
          See PropertyContext.tsx for the design notes. */}
      <PropertyProvider>
        <EditorAreaInner {...props} />
        <SettingsDialogPortal />
      </PropertyProvider>
    </ProfilerBoundary>
  );
}

function SettingsDialogPortal() {
  const settingsRoute = useSettingsRoute();
  return (
    <SettingsDialogShell
      open={settingsRoute.open}
      onOpenChange={(next) => {
        if (!next) settingsRoute.close();
      }}
    />
  );
}

function EditorAreaInner({
  editorMode,
  onModeChange,
  activeTab,
  onActiveTabChange,
  terminalBridge,
  terminalVisible = false,
  onTerminalVisibleChange,
  terminalLaunch = null,
}: EditorAreaProps) {
  const { t } = useLingui();
  const {
    activeDocName,
    activeProvider,
    activeTarget,
    recycleDocument,
    docPanelMode,
    docPanelAgentId,
    docPanelExpandSignal,
  } = useDocumentContext();
  const { openDocumentTransition } = useDocumentTransition();
  const { requestAddProperty } = useProperties();
  const stats = useDocumentStats(activeProvider, activeDocName);
  const selectionStats = useSelectionStats(
    activeDocName,
    editorMode === 'source' ? 'source' : 'wysiwyg',
  );
  const syncStatus = useSyncStatus(activeProvider);
  const isConnected = syncStatus === 'connected' || syncStatus === 'synced';
  const lifecycleStatus = useLifecycleStatus(activeDocName);
  const isConflict = lifecycleStatus === 'conflict';
  const [everHadProvider, setEverHadProvider] = useState(false);
  useEffect(() => {
    if (activeProvider != null && !everHadProvider) setEverHadProvider(true);
  }, [activeProvider, everHadProvider]);
  const deferredActiveDocName = useDeferredValue(activeDocName);
  const isNewDoc = activeTarget?.kind === 'missing';
  const showStats = !!activeDocName && activeTarget?.kind !== 'folder';
  const editorPlaceholder = isNewDoc ? t`Start writing to create this page` : undefined;

  const [embeddedHost] = useState(() => detectEmbeddedHostFromBrowser());
  const isEmbedded = embeddedHost !== null;
  const [rightPartition, setRightPartition] = useState(() =>
    resolvePartition(embeddedHost, window.innerWidth, 'right'),
  );
  const rightPartitionRef = useRef(rightPartition);
  useEffect(() => {
    rightPartitionRef.current = rightPartition;
  }, [rightPartition]);
  const panelRef = usePanelRef();
  const [initialRightCollapsed] = useState(() => {
    const pins = readPins();
    return resolveEffectiveState('right', rightPartition, pins) === 'collapsed';
  });
  const [isCollapsed, setIsCollapsed] = useState(initialRightCollapsed);
  const isCollapsedRef = useRef(isCollapsed);
  useEffect(() => {
    isCollapsedRef.current = isCollapsed;
  }, [isCollapsed]);
  const [isDraggingDocHandle, setIsDraggingDocHandle] = useState(false);
  const isDraggingDocHandleRef = useRef(false);

  const [initialDocPanelWidthPx] = useState(() => getInitialDocPanelWidth());
  const docPanelWidthPxRef = useRef(initialDocPanelWidthPx);
  const writeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  function debouncedWriteDocPanelWidth(px: number) {
    if (writeTimerRef.current != null) clearTimeout(writeTimerRef.current);
    writeTimerRef.current = setTimeout(() => {
      writeDocPanelWidth(px);
      writeTimerRef.current = null;
    }, 100);
  }
  useEffect(
    () => () => {
      if (writeTimerRef.current != null) clearTimeout(writeTimerRef.current);
    },
    [],
  );

  const [groupContainerEl, setGroupContainerEl] = useState<HTMLDivElement | null>(null);

  function togglePanel() {
    if (panelRef.current == null) return;
    const partition = rightPartitionRef.current;
    if (isCollapsed) {
      applyToggle('right', partition, 'open');
      panelRef.current?.expand();
    } else {
      applyToggle('right', partition, 'collapsed');
      panelRef.current?.collapse();
    }
  }

  useEffect(() => {
    const mql = window.matchMedia(`(min-width: ${RIGHT_COLLAPSE_THRESHOLD}px)`);
    const onChange = () => {
      const newPartition = resolvePartition(embeddedHost, window.innerWidth, 'right');
      setRightPartition(newPartition);
      const pins = readPins();
      const effective = resolveEffectiveState('right', newPartition, pins);
      const nextCollapsed = effective === 'collapsed';
      setIsCollapsed(nextCollapsed);
      if (nextCollapsed) {
        panelRef.current?.collapse();
      } else {
        panelRef.current?.expand();
      }
    };
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, [embeddedHost, panelRef]);

  useEffect(() => {
    if (groupContainerEl == null) return;
    if (isEmbedded) return;
    const ro = new ResizeObserver(() => {
      if (isCollapsedRef.current) return;
      if (isDraggingDocHandleRef.current) return;
      panelRef.current?.resize(`${docPanelWidthPxRef.current}px`);
    });
    ro.observe(groupContainerEl);
    return () => ro.disconnect();
  }, [groupContainerEl, isEmbedded, panelRef]);

  useEffect(() => {
    const openRequestedTab = (tab: PanelTab) => {
      onActiveTabChange(tab);
      panelRef.current?.expand();
    };

    const pendingTab = consumePendingDocPanelTabRequest();
    if (pendingTab) {
      openRequestedTab(pendingTab);
    }

    return subscribeToDocPanelTabRequests((tab) => {
      consumePendingDocPanelTabRequest();
      openRequestedTab(tab);
    });
  }, [onActiveTabChange, panelRef]);

  useEffect(() => {
    if (docPanelExpandSignal === 0) return;
    panelRef.current?.expand();
  }, [docPanelExpandSignal, panelRef]);

  useLayoutEffect(() => {
    if (!isCollapsed) return;
    const panelEl = document.getElementById('doc-panel');
    if (!panelEl?.contains(document.activeElement)) return;
    const toggle = document.querySelector<HTMLElement>('[data-doc-panel-toggle]');
    if (toggle) {
      toggle.focus();
      return;
    }
    document.querySelector<HTMLElement>('[data-sidebar="trigger"]')?.focus();
  }, [isCollapsed]);

  useEffect(() => {
    if (window.okDesktop == null) return;
    window.okDesktop.editor.notifyViewMenuStateChanged({ docPanelVisible: !isCollapsed });
  }, [isCollapsed]);

  useEffect(() => {
    if (window.okDesktop == null) return;
    return window.okDesktop.onMenuAction((action) => {
      if (action === 'toggle-doc-panel') {
        togglePanel();
      }
    });
  }, [
    // biome-ignore lint/correctness/useExhaustiveDependencies: togglePanel is render-bound; re-subscribing keeps the handler fresh (mirrors sidebar.tsx ⌥⌘S effect)
    togglePanel,
  ]);

  useEffect(() => {
    if (window.okDesktop != null) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (matchesKeyboardShortcut(event, 'toggle-document-panel')) {
        event.preventDefault();
        togglePanel();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    // biome-ignore lint/correctness/useExhaustiveDependencies: togglePanel is render-bound; re-subscribing keeps the handler fresh (mirrors sidebar.tsx ⌥⌘S effect)
    togglePanel,
  ]);

  const previousDocNameRef = useRef<string | null>(null);
  const [previousDocName, setPreviousDocName] = useState<string | null>(null);
  const activeDocumentHistoryName =
    activeTarget?.kind === 'large-file' ? activeTarget.docName : activeDocName;
  useEffect(() => {
    if (activeDocumentHistoryName && activeDocumentHistoryName !== previousDocNameRef.current) {
      const prior = previousDocNameRef.current;
      previousDocNameRef.current = activeDocumentHistoryName;
      setPreviousDocName(prior);
    }
  }, [activeDocumentHistoryName]);

  function navigateBackToDoc(prev: string) {
    const nextHash = hashFromDocName(prev);
    if (window.location.hash === nextHash) {
      openDocumentTransition(prev);
    } else {
      window.location.hash = nextHash;
    }
  }

  let viewContent: ReactNode;
  let rightPanel: ReactNode = null;

  if (activeTarget?.kind === 'large-file') {
    viewContent = (
      <LargeFileEditorState
        docName={activeTarget.docName}
        size={activeTarget.size}
        limit={activeTarget.limit}
        backNav={
          previousDocName ? { previousDocName, onNavigateBack: navigateBackToDoc } : undefined
        }
      />
    );
  } else if (activeTarget?.kind === 'folder') {
    viewContent = <FolderOverview folderPath={activeTarget.folderPath} />;
    const showAgentPanel = docPanelMode === 'agent' && docPanelAgentId !== null;
    if (showAgentPanel) {
      rightPanel = (
        <>
          <ResizableHandle withHandle />
          {/* Non-collapsible — folder view has no toolbar toggle; dismiss via avatar re-click. */}
          <ResizablePanel
            id="agent-panel"
            defaultSize="25%"
            minSize="300px"
            maxSize="40%"
            className="flex flex-col bg-muted/20"
          >
            <Suspense
              fallback={
                <div
                  role="status"
                  aria-busy="true"
                  className="flex h-full items-center justify-center text-sm text-muted-foreground"
                >
                  <Trans>Loading agent activity</Trans>
                </div>
              }
            >
              <LazyActivityModeContent showBackButton={false} />
            </Suspense>
          </ResizablePanel>
        </>
      );
    }
  } else if (activeTarget?.kind === 'asset') {
    viewContent = (
      <AssetPreview
        key={activeTarget.assetPath}
        assetPath={activeTarget.assetPath}
        mediaKind={activeTarget.mediaKind}
      />
    );
  } else if (!activeProvider || !activeDocName) {
    const hashDoc = typeof window !== 'undefined' ? docNameFromHash(window.location.hash) : null;
    if (hashDoc !== null) {
      if (terminalBridge != null && everHadProvider) {
        viewContent = <EditorSkeleton />;
        rightPanel = (
          <>
            <ResizableHandle withHandle disabled />
            <ResizablePanel
              id="doc-panel"
              defaultSize={initialRightCollapsed ? 0 : `${initialDocPanelWidthPx}px`}
              minSize={DOC_PANEL_MIN_SIZE}
              maxSize={DOC_PANEL_MAX_SIZE}
              collapsible
              collapsedSize={0}
              inert
              className="flex flex-col bg-muted/20"
            >
              {/* Visual-only filler. `inert` removes this subtree from the a11y
                  tree + focus order, so a live-region role/aria-busy here would
                  be dead ARIA — the skeleton in the left column is the announced
                  loading state. Mirrors the real doc-panel (no ARIA on children
                  under its own `inert`). */}
              <div className="min-h-0 flex-1" />
            </ResizablePanel>
          </>
        );
      } else {
        return <EditorSkeleton />;
      }
    } else {
      viewContent = <EmptyEditorState terminalVisible={terminalVisible} />;
    }
  } else {
    const isSourceMode = editorMode === 'source';
    const sourceDisabled = !isConnected;

    const isPanelCollapsed = isCollapsed;

    function openAddPropertyForm() {
      if (!activeDocName) return;
      requestAddProperty(activeDocName);
    }

    const editorContent = (
      <div className="relative flex h-full flex-col">
        <div className="relative min-h-0 flex-1">
          {/* Hybrid Activity + Suspense + ErrorBoundary render tree.
          EditorActivityPool keeps Tiptap eager and lazy-loads SourceEditor on
          the first source-mode visit for each doc, then preserves the per-doc
          display:none toggle after that initial load. Each Activity entry owns
          its own scroll container so scroll position is DOM-local to that
          doc's subtree and survives the Activity hidden-mode mount/unmount cycle.

          Error + Suspense scoping lives INSIDE EditorActivityPool — each
          Activity wraps its own DocumentErrorBoundary + Suspense so a
          hidden doc's cached rejected syncPromise cannot re-throw into
          the visible UI (QA-023/024). See EditorActivityPool.tsx file
          docstring "ERROR + SUSPENSE SCOPING" for rationale. */}
          <div className="relative h-full">
            <EditorActivityPool
              activeDocName={deferredActiveDocName ?? activeDocName}
              isSourceMode={isSourceMode}
              editorPlaceholder={editorPlaceholder}
              previousDocName={previousDocName ?? undefined}
              onNavigateBack={navigateBackToDoc}
              onRecycle={recycleDocument}
            />
            <FindReplaceController activeDocName={activeDocName} isSourceMode={isSourceMode} />
            {/* Nav-pending skeleton overlay. Rendered when the urgent
            `activeDocName` (shell state — driving sidebar highlight +
            header title) has moved past `deferredActiveDocName` (editor
            subtree prop), AND the upcoming deferred commit will pay a
            real Suspense suspension. The delta window is the interval
            between shell-snap and the editor subtree's deferred commit
            completing — 1-3s on mark-heavy docs that refuse V2 cache
            admission, sub-frame on warm reopens (both mount-promise
            and sync-promise resolved).
            Without this overlay the user sees the PREVIOUS doc's editor
            linger through a slow mount window, which looks like a
            "flash of the old editor" and contradicts the sidebar's
            now-updated highlight. The overlay is absolute + inset-0 on
            the positioned parent so it paints over the pool without
            unmounting it — Activity state (scroll, selection, editor
            instances) survives underneath.
            Warm-reopen bypass: skip the overlay when both the mount-
            promise and sync-promise caches have resolved entries for
            the new docName. In that state `use()` short-circuits
            synchronously, the deferred commit lands in 1 frame, and
            painting a skeleton during the urgent-paint → deferred-
            commit gap creates a perceptible "cold load" flash on a
            genuinely warm reopen. Reading module state during render
            is safe because resolution is a terminal cache-entry state
            (only invalidate clears it, and invalidate runs from
            park-uncached / evict effects that have already committed
            before this render reads the flag).
            Regression tests: docs-open.e2e.ts F0b (warm V2-admit
            reopen, no skeleton). V2-refuse path is unit-tier only
            (mount-promise.test.ts `mountPromiseHasResolved (warm-
            reopen overlay gate)` + editor-cache.test.ts mount-
            promise-cancellation describes). */}
            {shouldPaintOverlay({
              activeDocName,
              deferredActiveDocName,
              mountResolved: activeDocName !== null && mountPromiseHasResolved(activeDocName),
              syncResolved: activeDocName !== null && syncPromiseHasResolved(activeDocName),
            }) ? (
              <div className="absolute inset-0 z-10 bg-background">
                <EditorSkeleton />
                {/* Mount-stalled affordance — surfaces a "Cancel" link
                  when the mount-promise substrate emits `ok/mount/stalled`
                  past MOUNT_STALLED_THRESHOLD_MS (10s default). Only
                  shown when the skeleton is already overlay-active, so a
                  fast mount never sees the affordance. */}
                {activeDocName !== null ? <MountStalledAffordance docName={activeDocName} /> : null}
              </div>
            ) : null}
          </div>
          {!isConflict && (
            <EditorToolbar
              activeDocName={activeDocName}
              isSourceMode={isSourceMode}
              sourceDisabled={sourceDisabled}
              onModeChange={onModeChange}
              showAddPropertyButton={!isSourceMode}
              onAddProperty={openAddPropertyForm}
              isPanelCollapsed={isPanelCollapsed}
              onTogglePanel={togglePanel}
            />
          )}
        </div>
        <EditorFooter stats={stats} selectionStats={selectionStats} showStats={showStats} />
      </div>
    );

    viewContent = editorContent;
    rightPanel = (
      <>
        <ResizableHandle
          withHandle
          disabled={isEmbedded && isCollapsed}
          onPointerDown={() => {
            setIsDraggingDocHandle(true);
            isDraggingDocHandleRef.current = true;
            const handleUp = () => {
              setIsDraggingDocHandle(false);
              isDraggingDocHandleRef.current = false;
              window.removeEventListener('pointerup', handleUp);
            };
            window.addEventListener('pointerup', handleUp);
          }}
        />
        <ResizablePanel
          id="doc-panel"
          panelRef={panelRef}
          defaultSize={initialRightCollapsed ? 0 : `${initialDocPanelWidthPx}px`}
          minSize={DOC_PANEL_MIN_SIZE}
          maxSize={DOC_PANEL_MAX_SIZE}
          collapsible
          collapsedSize={0}
          onResize={(size) => {
            setIsCollapsed(size.asPercentage === 0);
            if (size.inPixels > 0 && isDraggingDocHandleRef.current) {
              docPanelWidthPxRef.current = size.inPixels;
              debouncedWriteDocPanelWidth(size.inPixels);
            }
          }}
          inert={isCollapsed}
          className={cn(
            'flex flex-col bg-muted/20',
            !isDraggingDocHandle &&
              'transition-[flex-grow] duration-200 ease-out motion-reduce:transition-none motion-reduce:duration-0',
          )}
        >
          <DocPanel
            docName={activeDocName}
            isSourceMode={isSourceMode}
            activeTab={activeTab}
            onActiveTabChange={onActiveTabChange}
            mode={docPanelMode}
          />
        </ResizablePanel>
      </>
    );
  }

  const leftColumn =
    terminalBridge != null ? (
      <TerminalDock
        bridge={terminalBridge}
        visible={terminalVisible}
        onVisibleChange={onTerminalVisibleChange ?? (() => {})}
        launch={terminalLaunch}
      >
        {viewContent}
      </TerminalDock>
    ) : (
      viewContent
    );

  return (
    <div className="flex min-h-0 flex-1" ref={setGroupContainerEl}>
      <ResizablePanelGroup
        orientation="horizontal"
        data-dragging={isDraggingDocHandle || undefined}
      >
        <ResizablePanel
          minSize="30%"
          {...(rightPanel != null && !initialRightCollapsed ? {} : { defaultSize: '100%' })}
          className={
            isDraggingDocHandle
              ? undefined
              : 'transition-[flex-grow] duration-200 ease-out motion-reduce:transition-none motion-reduce:duration-0'
          }
        >
          {leftColumn}
        </ResizablePanel>
        {rightPanel}
      </ResizablePanelGroup>
    </div>
  );
}
