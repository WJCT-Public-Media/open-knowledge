'use client';

import { ArrowRightIcon, DownloadIcon, ExternalLinkIcon } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

interface SplashCtaClusterProps {
  downloadUrl: string;
  customSchemeUrl: string;
  githubUrl: string;
}

const FALLBACK_REVEAL_DELAY_MS = 2500;

export function SplashCtaCluster({
  downloadUrl,
  customSchemeUrl,
  githubUrl,
}: SplashCtaClusterProps) {
  const [attempting, setAttempting] = useState(false);
  const [handoffFailed, setHandoffFailed] = useState(false);
  const [downloadClicked, setDownloadClicked] = useState(false);
  const [showReopen, setShowReopen] = useState(false);
  const attemptCleanupRef = useRef<(() => void) | null>(null);
  const fallbackCtaRef = useRef<HTMLAnchorElement | null>(null);
  const reopenCtaRef = useRef<HTMLAnchorElement | null>(null);

  useEffect(() => () => attemptCleanupRef.current?.(), []);

  useEffect(() => {
    if (!downloadClicked) return;
    function onRefocus() {
      if (document.visibilityState === 'visible') setShowReopen(true);
    }
    window.addEventListener('focus', onRefocus);
    document.addEventListener('visibilitychange', onRefocus);
    return () => {
      window.removeEventListener('focus', onRefocus);
      document.removeEventListener('visibilitychange', onRefocus);
    };
  }, [downloadClicked]);

  useEffect(() => {
    if (showReopen) reopenCtaRef.current?.focus();
  }, [showReopen]);

  const handleDownloadClick = () => {
    setDownloadClicked(true);
  };

  useEffect(() => {
    if (handoffFailed) fallbackCtaRef.current?.focus();
  }, [handoffFailed]);

  const handleOpenClick = () => {
    attemptCleanupRef.current?.();
    setHandoffFailed(false);
    setAttempting(true);

    function cleanup() {
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('pagehide', onHandoffSignal);
      window.removeEventListener('blur', onHandoffSignal);
      attemptCleanupRef.current = null;
      setAttempting(false);
    }

    function onHandoffSignal() {
      cleanup();
    }

    function onVisibilityChange() {
      if (document.visibilityState === 'hidden') cleanup();
    }

    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('pagehide', onHandoffSignal);
    window.addEventListener('blur', onHandoffSignal);

    const timer = setTimeout(() => {
      cleanup();
      if (document.visibilityState === 'visible') setHandoffFailed(true);
    }, FALLBACK_REVEAL_DELAY_MS);

    attemptCleanupRef.current = cleanup;
  };

  return (
    <div className="mt-12">
      {showReopen ? (
        <div
          className="mb-6 rounded-lg border border-[var(--slide-border,rgba(0,0,0,0.08))] p-4"
          data-testid="splash-reopen-prompt"
        >
          <p className="text-sm text-[var(--slide-muted)]">
            Installed Open Knowledge? Open it to land on this share.
          </p>
          <a
            ref={reopenCtaRef}
            href={customSchemeUrl}
            onClick={handleOpenClick}
            data-testid="splash-reopen-cta"
            className="slide-btn-primary mt-3 inline-flex touch-manipulation items-center gap-2 rounded-lg px-6 py-3 text-sm font-medium transition-[opacity,transform] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--slide-accent-strong)]"
          >
            {attempting ? 'Opening…' : 'Open in Open Knowledge'}
            <ArrowRightIcon className="size-4" aria-hidden="true" />
          </a>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-4">
        <a
          href={customSchemeUrl}
          onClick={handleOpenClick}
          data-testid="splash-open-cta"
          className="slide-btn-primary inline-flex touch-manipulation items-center gap-2 rounded-lg px-6 py-3 text-sm font-medium transition-[opacity,transform] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--slide-accent-strong)]"
        >
          {attempting ? 'Opening…' : 'Open in Open Knowledge'}
          <ArrowRightIcon className="size-4" aria-hidden="true" />
        </a>

        <a
          href={githubUrl}
          data-testid="splash-github-cta"
          rel="noopener noreferrer"
          target="_blank"
          className="inline-flex touch-manipulation items-center gap-1.5 text-sm font-medium text-[var(--slide-muted)] transition-colors hover:text-[var(--slide-accent)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--slide-accent)] focus-visible:rounded"
        >
          View on GitHub
          <ExternalLinkIcon className="size-3.5" aria-hidden="true" />
        </a>
      </div>

      <div aria-live="polite">
        {handoffFailed ? (
          <div className="mt-6" data-testid="splash-handoff-fallback">
            <p className="text-sm text-[var(--slide-muted)]">
              Looks like Open Knowledge isn&rsquo;t installed yet.
            </p>
            <a
              ref={fallbackCtaRef}
              href={downloadUrl}
              onClick={handleDownloadClick}
              data-testid="splash-download-fallback-cta"
              className="slide-btn-primary mt-3 inline-flex touch-manipulation items-center gap-2 rounded-lg px-6 py-3 text-sm font-medium transition-[opacity,transform] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--slide-accent-strong)]"
            >
              <DownloadIcon className="size-4" aria-hidden="true" />
              Download Open Knowledge for macOS
            </a>
          </div>
        ) : (
          <p className="mt-4 text-sm text-[var(--slide-muted)]">
            Don&rsquo;t have the app?{' '}
            <a
              href={downloadUrl}
              onClick={handleDownloadClick}
              data-testid="splash-download-cta"
              className="touch-manipulation font-medium text-[var(--slide-text)] underline underline-offset-4 transition-colors hover:text-[var(--slide-accent)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--slide-accent)] focus-visible:rounded"
            >
              Download for macOS
            </a>
          </p>
        )}
      </div>
    </div>
  );
}
