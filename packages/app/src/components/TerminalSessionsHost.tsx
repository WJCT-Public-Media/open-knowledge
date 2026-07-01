import { useLingui } from '@lingui/react/macro';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { TabsContent } from '@/components/ui/tabs';
import type { OkDesktopBridge } from '@/lib/desktop-bridge-types';
import type { TerminalDockPosition } from '@/lib/terminal-dock-store';
import type { TerminalLaunchIntent } from './EditorPane';
import { TerminalGate } from './TerminalGate';
import { TerminalTabStrip } from './TerminalTabStrip';

/** A concurrent terminal session the host keeps as a tab. `id` is a stable
 *  client-side identity (not the async PTY id — the session resolves its own PTY
 *  on mount). `launch` is the one-shot intent the session writes once it is live;
 *  sessions opened from the tab strip carry none. `title` is the latest OSC 0/2
 *  title the running program set (null → the tab shows its positional default).
 *  `adoptPtyId` is the surviving ptyId after a renderer reload — the session
 *  adopts that live shell instead of spawning a fresh one; null for new tabs. */
interface TerminalSessionDescriptor {
  readonly id: string;
  readonly launch: TerminalLaunchIntent | null;
  readonly title: string | null;
  readonly adoptPtyId: string | null;
}

function makeSessionId(counter: number): string {
  return `terminal-session-${counter}`;
}

/** Move focus into a session's terminal. xterm routes keystrokes through its
 *  helper textarea, so focusing it is equivalent to term.focus(). No-ops when
 *  the textarea has not mounted yet (xterm mounts asynchronously). */
function focusTerminalSession(id: string) {
  if (id === '') return;
  document
    .querySelector<HTMLElement>(`[data-terminal-session="${id}"] .xterm-helper-textarea`)
    ?.focus();
}

interface TerminalSessionsHostProps {
  readonly bridge: OkDesktopBridge;
  /** Controlled visibility. The host reflects this and reports close-last back
   *  through {@link onVisibleChange}; it never owns it. */
  readonly visible: boolean;
  readonly onVisibleChange: (visible: boolean) => void;
  readonly launch?: TerminalLaunchIntent | null;
  readonly container: HTMLElement | null;
  readonly isShowing: boolean;
  readonly onRequestEditorFocus: () => void;
  /** Current dock position — passed to the tab strip's dock-toggle + collapse
   *  controls so their icons/labels reflect where the terminal lives. */
  readonly dockPosition: TerminalDockPosition;
  readonly onToggleDock: () => void;
}

export function TerminalSessionsHost({
  bridge,
  visible,
  onVisibleChange,
  launch = null,
  container,
  isShowing,
  onRequestEditorFocus,
  dockPosition,
  onToggleDock,
}: TerminalSessionsHostProps) {
  const { t } = useLingui();

  const [hostEl] = useState<HTMLDivElement | null>(() => {
    if (typeof document === 'undefined') return null;
    const el = document.createElement('div');
    el.className = 'flex min-h-0 flex-1 flex-col overflow-hidden';
    return el;
  });

  useLayoutEffect(() => {
    if (hostEl == null || container == null) return;
    if (hostEl.parentElement !== container) container.appendChild(hostEl);
  }, [hostEl, container]);

  const canRehydrate = typeof bridge.terminal?.list === 'function';

  const [sessions, setSessions] = useState<readonly TerminalSessionDescriptor[]>(() =>
    !canRehydrate && visible
      ? [{ id: makeSessionId(1), launch, title: null, adoptPtyId: null }]
      : [],
  );
  const [activeSessionId, setActiveSessionId] = useState(() =>
    !canRehydrate && visible ? makeSessionId(1) : '',
  );
  const [rehydrationSettled, setRehydrationSettled] = useState(!canRehydrate);
  const rehydratedRef = useRef(false);
  const activeSessionIdRef = useRef(activeSessionId);
  const sessionsRef = useRef(sessions);
  const sessionCounterRef = useRef(!canRehydrate && visible ? 1 : 0);
  const lastHandledLaunchNonceRef = useRef<number | null>(visible && launch ? launch.nonce : null);
  const prevVisibleRef = useRef(visible);

  function openSession(launchForSession: TerminalLaunchIntent | null) {
    sessionCounterRef.current += 1;
    const id = makeSessionId(sessionCounterRef.current);
    setSessions((prev) => [
      ...prev,
      { id, launch: launchForSession, title: null, adoptPtyId: null },
    ]);
    setActiveSessionId(id);
  }

  function setSessionTitle(id: string, title: string) {
    const next = title.trim() === '' ? null : title.trim();
    setSessions((prev) => {
      if (!prev.some((session) => session.id === id && session.title !== next)) return prev;
      return prev.map((session) => (session.id === id ? { ...session, title: next } : session));
    });
  }
  const openSessionRef = useRef(openSession);

  function closeSession(id: string) {
    const current = sessionsRef.current;
    const index = current.findIndex((session) => session.id === id);
    if (index === -1) return;
    const next = current.filter((session) => session.id !== id);
    if (id === activeSessionId) {
      const neighbor = current[index - 1] ?? current[index + 1];
      const neighborId = neighbor?.id ?? '';
      setActiveSessionId(neighborId);
      if (neighborId !== '') queueMicrotask(() => focusTerminalSession(neighborId));
    }
    setSessions(next);
    if (next.length === 0) {
      onVisibleChange(false);
      onRequestEditorFocus();
    }
  }
  const closeActiveRef = useRef(() => {});

  useEffect(() => {
    openSessionRef.current = openSession;
    activeSessionIdRef.current = activeSessionId;
    sessionsRef.current = sessions;
    closeActiveRef.current = () => {
      if (activeSessionId !== '') closeSession(activeSessionId);
    };
  });

  useEffect(() => {
    if (!rehydrationSettled) return;

    const wasVisible = prevVisibleRef.current;
    prevVisibleRef.current = visible;

    if (launch != null && launch.nonce !== lastHandledLaunchNonceRef.current) {
      lastHandledLaunchNonceRef.current = launch.nonce;
      openSessionRef.current(launch);
      return;
    }
    if (visible && !wasVisible && sessions.length === 0) {
      openSessionRef.current(null);
    }
  }, [visible, launch, sessions.length, rehydrationSettled]);

  useEffect(() => {
    if (typeof bridge.terminal?.list !== 'function') return;
    if (rehydratedRef.current) return;
    rehydratedRef.current = true;
    let cancelled = false;
    void (async () => {
      let survivors: readonly { ptyId: string }[] = [];
      try {
        survivors = (await bridge.terminal.list()) ?? [];
      } catch (err) {
        console.error('[terminal] reload session list() failed; cold-starting:', err);
        survivors = [];
      }
      if (cancelled) return;
      if (survivors.length > 0) {
        const recovered = survivors.map((entry, index) => ({
          id: makeSessionId(index + 1),
          launch: null,
          title: null,
          adoptPtyId: entry.ptyId,
        }));
        sessionCounterRef.current = recovered.length;
        setSessions(recovered);
        setActiveSessionId(recovered[0]?.id ?? '');
      }
      setRehydrationSettled(true);
    })();
    return () => {
      cancelled = true;
      rehydratedRef.current = false;
    };
  }, [bridge]);

  useEffect(() => {
    return bridge.onMenuAction((action) => {
      if (action === 'new-terminal') openSessionRef.current(null);
      else if (action === 'kill-terminal') closeActiveRef.current();
    });
  }, [bridge]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (!event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
      if (!/^[1-9]$/.test(event.key)) return;
      if (hostEl == null || !hostEl.contains(document.activeElement)) return;
      const target = sessionsRef.current[Number(event.key) - 1];
      if (target == null) return;
      event.preventDefault();
      event.stopPropagation();
      setActiveSessionId(target.id);
      queueMicrotask(() => focusTerminalSession(target.id));
    }
    window.addEventListener('keydown', onKeyDown, { capture: true });
    return () => window.removeEventListener('keydown', onKeyDown, { capture: true });
  }, [hostEl]);

  useEffect(() => {
    bridge.editor.notifyViewMenuStateChanged({ terminalLive: sessions.length > 0 });
  }, [bridge, sessions.length]);

  useLayoutEffect(() => {
    if (isShowing || visible) return;
    if (hostEl == null || !hostEl.contains(document.activeElement)) return;
    onRequestEditorFocus();
  }, [isShowing, visible, hostEl, onRequestEditorFocus]);

  useEffect(() => {
    if (!isShowing) return;
    focusTerminalSession(activeSessionIdRef.current);
  }, [isShowing]);

  const tabDescriptors = sessions.map((session, index) => ({
    id: session.id,
    label: session.title ?? t`Terminal ${index + 1}`,
  }));

  const sessionViews =
    sessions.length > 0 ? (
      <TerminalTabStrip
        sessions={tabDescriptors}
        activeSessionId={activeSessionId}
        onSelect={setActiveSessionId}
        onTabActivate={(id) => queueMicrotask(() => focusTerminalSession(id))}
        onNew={() => openSession(null)}
        onClose={closeSession}
        dockPosition={dockPosition}
        onToggleDock={onToggleDock}
        onCollapse={() => onVisibleChange(false)}
        className="h-full"
      >
        {sessions.map((session) => (
          <TabsContent
            key={session.id}
            value={session.id}
            forceMount
            data-terminal-session={session.id}
            className="m-0 flex min-h-0 flex-1 flex-col overflow-hidden data-[state=inactive]:hidden"
          >
            <TerminalGate
              bridge={bridge}
              launch={session.launch}
              adoptPtyId={session.adoptPtyId}
              onTitleChange={(title) => setSessionTitle(session.id, title)}
              onClose={() => closeSession(session.id)}
            />
          </TabsContent>
        ))}
      </TerminalTabStrip>
    ) : null;

  return hostEl != null ? createPortal(sessionViews, hostEl) : null;
}
