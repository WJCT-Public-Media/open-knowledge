import type { TerminalCli } from '@inkeep/open-knowledge-core';
import { useEffect, useRef, useState } from 'react';
import { TagDialog } from '@/editor/components/TagDialog';
import { useDocumentContext } from '@/editor/DocumentContext';
import { RAW_MDX_NAV_EVENT, type RawMdxNavDetail } from '@/editor/extensions/raw-mdx-nav-event';
import { rememberPendingSourceNavigation } from '@/editor/source-editor-navigation';
import { type EditorModeValue, useEditorMode } from '@/editor/use-editor-mode';
import { useGitSyncStatus } from '@/hooks/use-git-sync-status';
import { useNoPushPermissionToast } from '@/hooks/use-no-push-permission-toast';
import { useConfigContext } from '@/lib/config-provider';
import { matchesKeyboardShortcut } from '@/lib/keyboard-shortcuts';
import {
  getInitialTerminalDock,
  type TerminalDockPosition,
  writeTerminalDock,
} from '@/lib/terminal-dock-store';
import { recordTerminalOpened } from '@/lib/terminal-telemetry';
import { AuthModal } from './AuthModal';
import { AutoSyncOnboardingDialog } from './AutoSyncOnboardingDialog';
import { shouldShowAutoSyncOnboarding } from './auto-sync-onboarding-gate';
import { type PanelTab, TABS } from './DocPanel';
import { EditorArea, type TerminalPlacement } from './EditorArea';
import { EditorHeader } from './EditorHeader';
import { subscribeToTerminalLaunchRequests } from './handoff/terminal-launch-events';
import { TerminalSessionsHost } from './TerminalSessionsHost';

export interface TerminalLaunchIntent {
  readonly prompt: string;
  readonly cli: TerminalCli;
  readonly nonce: number;
}

export type EditorMode = EditorModeValue;

interface EditorPaneProps {
  onOpenSearch?: () => void;
}

export function EditorPane({ onOpenSearch }: EditorPaneProps = {}) {
  const [persistedMode, setPersistedMode] = useEditorMode();
  const [editorMode, setEditorMode] = useState<EditorMode>(persistedMode);
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [authInitialStep, setAuthInitialStep] = useState<'auth' | 'identity'>('auth');
  const [activeTab, setActiveTab] = useState<PanelTab>(TABS[0].id);
  const [autoSyncOnboardingDismissed, setAutoSyncOnboardingDismissed] = useState(false);
  const desktopBridge = typeof window !== 'undefined' ? (window.okDesktop ?? null) : null;
  const [terminalVisible, setTerminalVisible] = useState(false);
  const [dockRestoreSettled, setDockRestoreSettled] = useState(false);
  const restoreRevealRef = useRef(false);
  const [terminalLaunch, setTerminalLaunch] = useState<TerminalLaunchIntent | null>(null);
  const [terminalDock, setTerminalDockState] =
    useState<TerminalDockPosition>(getInitialTerminalDock);
  function setTerminalDock(next: TerminalDockPosition) {
    setTerminalDockState(next);
    writeTerminalDock(next);
    setTerminalVisible(true);
  }
  function toggleTerminalDock() {
    setTerminalDock(terminalDock === 'right' ? 'bottom' : 'right');
  }
  const [terminalPlacement, setTerminalPlacement] = useState<TerminalPlacement>({
    container: null,
    isShowing: false,
    dockPosition: 'bottom',
    editorRegion: null,
  });
  const launchNonceRef = useRef(0);

  const syncStatus = useGitSyncStatus();
  const { projectConfig, projectLocalConfig, projectLocalSynced, projectSynced } =
    useConfigContext();

  const { activeDocName } = useDocumentContext();

  const showAutoSyncOnboarding = shouldShowAutoSyncOnboarding({
    autoSyncOnboardingDismissed,
    hasRemote: syncStatus?.hasRemote,
    projectLocalSynced,
    projectSynced,
    projectLocalConfig,
    projectConfig,
    pushPermissionCheckStatus: syncStatus?.pushPermission?.checkStatus,
  });

  useEffect(() => {
    function onRawMdxNav(e: Event) {
      const detail = (e as CustomEvent<RawMdxNavDetail>).detail;
      if (detail && activeDocName) {
        rememberPendingSourceNavigation(activeDocName, { kind: 'raw-mdx', detail });
      }
      setEditorMode('source');
    }
    window.addEventListener(RAW_MDX_NAV_EVENT, onRawMdxNav);
    return () => window.removeEventListener(RAW_MDX_NAV_EVENT, onRawMdxNav);
  }, [activeDocName]);

  useEffect(() => {
    const bridge = window.okDesktop;
    if (bridge == null) return;
    return bridge.onMenuAction((action) => {
      if (action === 'toggle-terminal') {
        setTerminalVisible((visible) => !visible);
      } else if (action === 'new-terminal') {
        setTerminalVisible(true);
      }
    });
  }, []);

  useEffect(() => {
    if (window.okDesktop != null) return;
    function handleKeyDown(event: KeyboardEvent) {
      if (matchesKeyboardShortcut(event, 'toggle-terminal-panel')) {
        event.preventDefault();
        setTerminalVisible((visible) => !visible);
      }
    }
    window.addEventListener('keydown', handleKeyDown, { capture: true });
    return () => window.removeEventListener('keydown', handleKeyDown, { capture: true });
  }, []);

  useEffect(() => {
    return subscribeToTerminalLaunchRequests((prompt, cli) => {
      setTerminalVisible(true);
      launchNonceRef.current += 1;
      setTerminalLaunch({ prompt, cli, nonce: launchNonceRef.current });
    });
  }, []);

  useEffect(() => {
    if (!terminalVisible) setTerminalLaunch(null);
  }, [terminalVisible]);

  useEffect(() => {
    if (window.okDesktop == null) return;
    if (!dockRestoreSettled) return;
    window.okDesktop.editor.notifyViewMenuStateChanged({ terminalVisible });
  }, [terminalVisible, dockRestoreSettled]);

  useEffect(() => {
    const bridge = window.okDesktop;
    if (bridge == null) return;
    if (typeof bridge.terminal?.getDockState !== 'function') {
      setDockRestoreSettled(true);
      return;
    }
    let cancelled = false;
    void bridge.terminal
      .getDockState()
      .then((state) => {
        if (cancelled || !state.visible) return;
        restoreRevealRef.current = true;
        setTerminalVisible(true);
      })
      .catch((err) => {
        console.error('[terminal] dock-state restore failed; staying hidden:', err);
      })
      .finally(() => {
        if (!cancelled) setDockRestoreSettled(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (window.okDesktop == null) return;
    if (restoreRevealRef.current) {
      restoreRevealRef.current = false;
      return;
    }
    if (terminalVisible) recordTerminalOpened();
  }, [terminalVisible]);

  useNoPushPermissionToast(syncStatus?.pausedReason);

  function handleModeChange(mode: EditorModeValue) {
    setEditorMode(mode);
    setPersistedMode(mode);
  }

  return (
    <>
      <EditorHeader
        onSignIn={() => {
          setAuthInitialStep('auth');
          setAuthModalOpen(true);
        }}
        onSetIdentity={() => {
          setAuthInitialStep('identity');
          setAuthModalOpen(true);
        }}
        onOpenSearch={onOpenSearch}
      />
      {/* The terminal docks to the right of the doc panel (its own column) or
          under the editor/file column. EditorArea owns the layout; the dock
          position, visibility, and the dock-toggle/collapse controls' state stay
          owned here and are threaded down — to EditorArea (placement) and to the
          session host (which renders the tab strip's controls via its portal). */}
      <EditorArea
        editorMode={editorMode}
        onModeChange={handleModeChange}
        activeTab={activeTab}
        onActiveTabChange={setActiveTab}
        terminalBridge={desktopBridge}
        terminalVisible={terminalVisible}
        onTerminalVisibleChange={setTerminalVisible}
        terminalDock={terminalDock}
        onTerminalPlacement={setTerminalPlacement}
      />
      {desktopBridge != null ? (
        <TerminalSessionsHost
          bridge={desktopBridge}
          visible={terminalVisible}
          onVisibleChange={setTerminalVisible}
          launch={terminalLaunch}
          container={terminalPlacement.container}
          isShowing={terminalPlacement.isShowing}
          onRequestEditorFocus={() => terminalPlacement.editorRegion?.focus()}
          dockPosition={terminalDock}
          onToggleDock={toggleTerminalDock}
        />
      ) : null}
      <AuthModal
        open={authModalOpen}
        onOpenChange={setAuthModalOpen}
        identityPrompt={authInitialStep === 'identity'}
        onSuccess={() => {
          setAuthModalOpen(false);
        }}
      />
      <AutoSyncOnboardingDialog
        open={showAutoSyncOnboarding}
        onResolved={() => setAutoSyncOnboardingDismissed(true)}
      />
      <TagDialog />
      {/*
        Agent Activity Panel now lives inside DocPanel as the `'agent'` mode
        content (SPEC 2026-04-24-activity-panel-to-docpanel-mode-toggle).
        No longer mounted here — the mode toggle + DocumentContext
        (`docPanelMode` / `docPanelAgentId`) drive visibility. Presence-bar
        avatar clicks flip the DocPanel's mode + scope + trigger expand.
      */}
    </>
  );
}
