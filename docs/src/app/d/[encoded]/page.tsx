import { ChevronDown, FolderIcon, GitBranchIcon } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { OkWordmark } from '@/components/ok-wordmark';
import {
  buildCloneCommand,
  buildShareDescription,
  buildSplashViewModel,
  SPLASH_DOWNLOAD_URL,
  SPLASH_INSTALL_COMMAND,
} from '@/lib/share-splash';
import { metaDescription, SITE_NAME, SITE_URL, TWITTER_HANDLE } from '@/lib/site';
import { cn } from '@/lib/utils';
import { DotTexture } from '../../(home)/dot-texture';
import { SplashButtonLabel, splashOutlineButton, splashPrimaryButton } from './splash-buttons';
import { SplashCtaPanel } from './splash-cta-panel';

export const dynamic = 'force-static';

interface SplashPageProps {
  params: Promise<{ encoded: string }>;
}

export async function generateMetadata({ params }: SplashPageProps): Promise<Metadata> {
  const { encoded } = await params;
  const view = buildSplashViewModel(encoded);

  if (view.kind !== 'ok') {
    const fallbackDescription = metaDescription(
      'Open shared documents and folders with Open Knowledge, the AI-native markdown editor.',
    );
    return {
      title: { absolute: SITE_NAME },
      description: fallbackDescription,
      robots: { index: false, follow: true },
      openGraph: {
        siteName: SITE_NAME,
        title: SITE_NAME,
        description: fallbackDescription,
        url: `${SITE_URL}/d/${encoded}`,
        type: 'website',
      },
      twitter: {
        card: 'summary_large_image',
        site: TWITTER_HANDLE,
        creator: TWITTER_HANDLE,
        title: SITE_NAME,
        description: fallbackDescription,
      },
    };
  }

  const description = metaDescription(buildShareDescription(view));

  return {
    title: view.filename,
    description,
    robots: { index: false, follow: true },
    openGraph: {
      siteName: SITE_NAME,
      title: view.filename,
      description,
      url: `${SITE_URL}/d/${encoded}`,
      type: 'article',
    },
    twitter: {
      card: 'summary_large_image',
      site: TWITTER_HANDLE,
      creator: TWITTER_HANDLE,
      title: view.filename,
      description,
    },
  };
}

export default async function SplashPage({ params }: SplashPageProps) {
  const { encoded } = await params;
  const view = buildSplashViewModel(encoded);

  if (view.kind === 'unsupported-version') {
    return <SplashFallback heading="Update Open Knowledge to open this share." />;
  }

  if (view.kind === 'invalid') {
    return <SplashFallback heading="Invalid share URL." />;
  }

  return (
    <main className="relative min-h-screen overflow-hidden bg-slide-bg font-[family-name:var(--font-dm-sans)]">
      <SplashChrome />

      <section className="relative z-10 px-4 pt-16 pb-16 md:pt-24 md:pb-20">
        <div className="mx-auto max-w-5xl">
          <p className="mb-6 font-mono text-base font-medium uppercase tracking-wide text-primary">
            {view.target === 'folder' ? 'Shared folder' : 'Shared'}
          </p>

          <h1
            className="text-3xl font-light tracking-tight text-slide-text sm:text-4xl lg:text-[3.25rem] lg:leading-[1.1]"
            data-testid="splash-filename"
          >
            <span className="relative inline-block break-words">
              {view.filename}
              <svg
                className="absolute -bottom-2 left-0 h-3 w-full"
                viewBox="0 0 286 14"
                fill="none"
                preserveAspectRatio="none"
                aria-hidden="true"
              >
                <path
                  d="M3 11C45 3.5 91.5 1.5 143 5.5C194.5 9.5 241 7 283 3"
                  stroke="var(--slide-accent)"
                  strokeWidth="4"
                  strokeLinecap="round"
                />
              </svg>
            </span>
          </h1>

          <p
            className="mt-8 text-lg leading-relaxed text-slide-muted"
            data-testid="splash-repo-path"
          >
            {view.repoPath}
          </p>

          {view.target === 'folder' ? (
            <p
              className="mt-2 inline-flex items-center gap-2 text-sm text-slide-muted"
              data-testid="splash-folder-indicator"
            >
              <FolderIcon className="size-4" aria-hidden="true" />
              <span>Folder</span>
            </p>
          ) : null}

          {view.isDefaultBranch ? null : (
            <p
              className="mt-2 inline-flex items-center gap-2 text-sm text-slide-muted"
              data-testid="splash-branch-indicator"
            >
              <GitBranchIcon className="size-4" aria-hidden="true" />
              <span>
                on <span className="font-medium text-slide-text">{view.branch}</span>
              </span>
            </p>
          )}

          <SplashCtaPanel
            downloadUrl={`/d/${encoded}/download`}
            customSchemeUrl={view.customSchemeUrl}
            githubUrl={view.githubUrl}
            installCommand={SPLASH_INSTALL_COMMAND}
            cloneCommand={buildCloneCommand({
              owner: view.owner,
              repo: view.repo,
              branch: view.branch,
            })}
          />
        </div>
      </section>
    </main>
  );
}

function SplashChrome() {
  return (
    <>
      <DotTexture
        variant="right"
        priority
        className="top-0 right-0 w-60 dark:opacity-30 sm:w-[680px]"
      />
      <DotTexture
        variant="left"
        className="bottom-0 left-0 w-40 dark:opacity-30 sm:w-72 lg:w-[515px]"
      />
      <header className="relative z-10 px-4">
        <div className="mx-auto flex max-w-5xl pt-8 md:pt-10">
          <Link href="/" aria-label="Open Knowledge home" className="inline-flex items-center">
            {/* Link already names the control; hide the wordmark's own label to
                avoid a doubled "Open Knowledge" announcement. */}
            <OkWordmark aria-hidden="true" className="h-8 w-auto text-slide-text" />
          </Link>
        </div>
      </header>
    </>
  );
}

function SplashFallback({ heading }: { heading: string }) {
  return (
    <main className="relative min-h-screen overflow-hidden bg-slide-bg font-[family-name:var(--font-dm-sans)]">
      <SplashChrome />

      <section className="relative z-10 px-4 pt-16 pb-16 md:pt-24 md:pb-20">
        <div className="mx-auto max-w-5xl">
          <h1 className="text-3xl font-light tracking-tight text-slide-text sm:text-4xl">
            {heading}
          </h1>

          <div className="mt-10 flex flex-wrap items-center gap-4">
            <a href={SPLASH_DOWNLOAD_URL} className={splashPrimaryButton}>
              <SplashButtonLabel direction="down">Download for macOS</SplashButtonLabel>
            </a>
            <Link href="/" className={splashOutlineButton}>
              <SplashButtonLabel iconStyle="plain">Learn more</SplashButtonLabel>
            </Link>
          </div>

          <p className="mt-8 text-sm text-slide-muted">
            The desktop app runs on macOS. The CLI is cross-platform on macOS and Linux.
          </p>

          <SplashFallbackCli />
        </div>
      </section>
    </main>
  );
}

function SplashFallbackCli() {
  return (
    <details className="group mt-6" data-testid="splash-fallback-cli-disclosure">
      <summary
        className={cn(
          'inline-flex cursor-pointer list-none items-center gap-2 rounded-full border border-azure-blue px-5 py-[13px]',
          'bg-transparent font-mono text-sm font-medium uppercase leading-[115%] tracking-[-0.64px] text-azure-blue sm:text-base',
          'transition duration-200 ease-in-out outline-none',
          'hover:bg-azure-blue hover:text-white',
          'focus-visible:ring-2 focus-visible:ring-slide-accent focus-visible:ring-offset-2',
          '[&::-webkit-details-marker]:hidden',
        )}
        data-testid="splash-fallback-cli-summary"
      >
        <span>Install the CLI</span>
        <ChevronDown
          className="size-4 shrink-0 transition-transform duration-200 group-open:rotate-180 motion-reduce:transition-none"
          aria-hidden="true"
        />
      </summary>
      <div
        className="not-prose mt-3 rounded-lg border border-slide-border bg-slide-bg-elevated p-4"
        data-testid="splash-fallback-cli-body"
      >
        <pre className="overflow-x-auto whitespace-pre rounded bg-black/5 p-3 font-mono text-sm leading-relaxed text-slide-text dark:bg-white/10">
          <code className="block">{SPLASH_INSTALL_COMMAND}</code>
        </pre>
        <p className="mt-3 text-sm text-slide-muted">
          See the{' '}
          <Link
            href="/docs/reference/cli"
            className="font-medium text-slide-text underline underline-offset-4 transition-colors hover:text-slide-accent-strong focus-visible:rounded focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slide-accent"
          >
            CLI reference
          </Link>{' '}
          for `ok clone &lt;owner/repo&gt;` and other commands.
        </p>
      </div>
    </details>
  );
}
