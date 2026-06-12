import { ArrowRightIcon, DownloadIcon } from 'lucide-react';
import { cookies } from 'next/headers';
import Image from 'next/image';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import {
  decideContinue,
  NONCE_PARAM,
  PENDING_SHARE_COOKIE,
  PORT_PARAM,
} from '@/lib/deferred-share';
import { SPLASH_DOWNLOAD_URL } from '@/lib/share-splash';

export const dynamic = 'force-dynamic';

interface ContinuePageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function firstParam(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

export default async function ContinuePage({ searchParams }: ContinuePageProps) {
  const params = await searchParams;
  const cookieStore = await cookies();

  const decision = decideContinue({
    cookieToken: cookieStore.get(PENDING_SHARE_COOKIE)?.value ?? null,
    port: firstParam(params[PORT_PARAM]),
    nonce: firstParam(params[NONCE_PARAM]),
  });

  if (decision.kind === 'redeem') {
    redirect(decision.location);
  }

  return (
    <main className="relative min-h-screen bg-[var(--slide-bg)] font-[family-name:var(--font-dm-sans)]">
      <Image
        src="/ok-logo.png"
        alt=""
        width={64}
        height={64}
        className="pointer-events-none absolute top-8 right-8 z-10 size-10 md:top-12 md:right-12 md:size-12"
        aria-hidden="true"
      />

      <section className="px-6 pt-32 pb-16 md:pt-44 md:pb-20">
        <div className="mx-auto max-w-3xl">
          <p className="mb-6 text-sm font-medium italic text-[var(--slide-accent-strong)]">
            Welcome to Open Knowledge
          </p>

          <h1 className="text-3xl font-light tracking-tight text-[var(--slide-text)] sm:text-4xl lg:text-[3.25rem] lg:leading-[1.1]">
            You&rsquo;re all set.
          </h1>

          <p className="mt-8 text-lg leading-relaxed text-[var(--slide-muted)]">
            Open Knowledge is a local-first, markdown-native knowledge base where you and your AI
            agents co-create. Open the app to create your first project, or connect an existing
            GitHub repository.
          </p>

          <div className="mt-12 flex flex-wrap items-center gap-4">
            <Link
              href="/docs"
              data-testid="continue-getting-started"
              className="slide-btn-primary inline-flex items-center gap-2 rounded-lg px-6 py-3 text-sm font-medium transition-opacity focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--slide-accent-strong)]"
            >
              Read the getting-started guide
              <ArrowRightIcon className="size-4" aria-hidden="true" />
            </Link>
          </div>

          <div
            className="mt-12 border-t border-[var(--slide-border,rgba(0,0,0,0.08))] pt-8"
            data-testid="continue-share-recovery"
          >
            <p className="text-sm font-medium text-[var(--slide-text)]">
              Were you sent a share link?
            </p>
            <p className="mt-2 text-sm leading-relaxed text-[var(--slide-muted)]">
              If you opened Open Knowledge from a shared document, click that link again and choose{' '}
              <span className="font-medium">Open in Open Knowledge</span> to jump straight to it. If
              you don&rsquo;t have the app yet,{' '}
              <a
                href={SPLASH_DOWNLOAD_URL}
                className="font-medium text-[var(--slide-text)] underline underline-offset-4 transition-colors hover:text-[var(--slide-accent)]"
              >
                download it for macOS
              </a>
              .
            </p>
            <p className="mt-3 inline-flex items-center gap-2 text-sm text-[var(--slide-muted)]">
              <DownloadIcon className="size-4" aria-hidden="true" />
              <span>Open Knowledge is macOS-only in v1.</span>
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}
