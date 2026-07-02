// biome-ignore-all lint/plugin/no-raw-html-interactive-element: pre-rule backlog — file uses raw <button>/<input>/<textarea> awaiting shadcn migration; tracked at https://github.com/inkeep/open-knowledge/blob/main/biome-plugins/README.md#no-raw-html-interactive-elementgrit
import { t } from '@lingui/core/macro';
import { Trans } from '@lingui/react/macro';
import { useEffect, useState } from 'react';
import { useDocumentContext } from '@/editor/DocumentContext';
import { restartCollabServer } from '@/lib/restart-collab-server';

const GRACE_PERIOD_MS = 500;

type BannerMode = 'hidden' | 'retrying' | 'terminal';

export function computeBannerMode(
  collabUrl: string | null,
  collabTerminal: boolean,
  graceElapsed: boolean,
): BannerMode {
  if (collabTerminal) return 'terminal';
  if (collabUrl !== null) return 'hidden';
  return graceElapsed ? 'retrying' : 'hidden';
}

type CollabError =
  | { kind: 'error'; code: number | 'network' | 'invalid-body' }
  | { kind: 'null-collab' }
  | null;

export function isNoCollabServerError(err: CollabError): boolean {
  return err?.kind === 'null-collab';
}

export function describeError(err: CollabError): string {
  if (err === null) return t`no response`;
  if (err.kind === 'null-collab') return t`ok ui responded but server.lock has no port yet`;
  if (err.code === 'network') return t`network error (is \`ok ui\` running?)`;
  if (err.code === 'invalid-body') return t`/api/config returned a malformed body`;
  const code = err.code;
  return t`/api/config returned HTTP ${code}`;
}

export function ConnectingBanner() {
  const { collabUrl, collabTerminal, collabLastError, retryCollab } = useDocumentContext();
  const [graceElapsed, setGraceElapsed] = useState(false);
  const [restarting, setRestarting] = useState(false);
  const [restartError, setRestartError] = useState<string | null>(null);
  const bridge = typeof window !== 'undefined' ? window.okDesktop : undefined;

  useEffect(() => {
    if (collabUrl !== null || collabTerminal) {
      setGraceElapsed(false);
      return;
    }
    const timer = setTimeout(() => setGraceElapsed(true), GRACE_PERIOD_MS);
    return () => clearTimeout(timer);
  }, [collabUrl, collabTerminal]);

  const mode = computeBannerMode(collabUrl, collabTerminal, graceElapsed);

  if (mode === 'hidden') return null;

  if (mode === 'terminal') {
    const isNoCollabServer = isNoCollabServerError(collabLastError);
    const errorDetail = describeError(collabLastError);
    const handleRestart = async () => {
      if (!bridge) return;
      setRestartError(null);
      setRestarting(true);
      try {
        const result = await restartCollabServer(bridge);
        if (!result.ok) {
          setRestartError(result.message);
          setRestarting(false);
        }
      } catch {
        setRestarting(false);
      }
    };
    return (
      <div
        role="alert"
        aria-live="assertive"
        className="fixed top-0 inset-x-0 z-50 bg-red-500/95 text-red-950 text-sm text-center py-2 px-4 pl-[var(--ok-titlebar-reserve-left,1rem)] shadow-md flex items-center justify-center gap-3 flex-wrap"
      >
        <span>
          {isNoCollabServer ? (
            <Trans>
              No collab server for this worktree — run{' '}
              <code className="bg-red-100/60 px-1 rounded">ok start</code> here, or reopen the
              project.
            </Trans>
          ) : (
            <Trans>
              Couldn't reach collab server — {errorDetail}. Try{' '}
              <code className="bg-red-100/60 px-1 rounded">ok status</code> or check{' '}
              <code className="bg-red-100/60 px-1 rounded">.ok/local/last-spawn-error.log</code>.
            </Trans>
          )}
        </span>
        <button
          type="button"
          onClick={() => {
            setRestartError(null);
            retryCollab();
          }}
          disabled={restarting}
          className="bg-red-950 text-red-50 px-2 py-0.5 rounded text-xs font-medium hover:bg-red-900 disabled:opacity-60"
        >
          <Trans>Retry</Trans>
        </button>
        {bridge ? (
          <button
            type="button"
            onClick={handleRestart}
            disabled={restarting}
            className="bg-red-950 text-red-50 px-2 py-0.5 rounded text-xs font-medium hover:bg-red-900 disabled:opacity-60"
          >
            {restarting ? <Trans>Restarting</Trans> : <Trans>Restart server</Trans>}
          </button>
        ) : null}
        {restartError !== null ? (
          <span className="w-full text-red-950 text-xs">{restartError}</span>
        ) : null}
      </div>
    );
  }

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed top-0 inset-x-0 z-50 bg-amber-500/95 text-amber-950 text-sm text-center py-2 px-4 pl-[var(--ok-titlebar-reserve-left,1rem)] shadow-md"
    >
      <Trans>Connecting — waiting for collab server</Trans>
    </div>
  );
}
