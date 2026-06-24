import Link from 'next/link';
import { DiscordIcon } from '@/components/icons/discord';
import { GitHubIcon } from '@/components/icons/github';
import { XIcon } from '@/components/icons/x';
import { InkeepWordmark } from '@/components/inkeep-wordmark';

const socialLinks = [
  { href: 'https://github.com/inkeep/open-knowledge', label: 'GitHub', Icon: GitHubIcon },
  { href: 'https://discord.com/invite/YujKpFN49', label: 'Discord', Icon: DiscordIcon },
  { href: 'https://x.com/OpenKnowledgeAI', label: 'X', Icon: XIcon },
];

const legalLinks = [
  { href: 'https://inkeep.com/policies/terms-of-service', label: 'Terms of Service' },
  { href: 'https://inkeep.com/policies/privacy', label: 'Privacy' },
];

export function SiteFooter() {
  return (
    <footer className="px-6 py-10">
      <div className="container mx-auto grid grid-cols-1 items-center gap-6 min-[24rem]:grid-cols-[auto_auto] min-[24rem]:justify-between sm:grid-cols-3 sm:justify-normal">
        <div className="flex items-center justify-center gap-5 min-[24rem]:justify-start">
          {socialLinks.map(({ href, label, Icon }) => (
            <Link
              key={href}
              href={href}
              target="_blank"
              rel="noreferrer"
              aria-label={label}
              className="rounded-sm text-slide-muted/60 outline-none transition-colors hover:text-slide-text focus-visible:ring-2 focus-visible:ring-slide-accent focus-visible:ring-offset-2"
            >
              <Icon className="size-5" />
            </Link>
          ))}
        </div>
        <Link
          href="https://inkeep.com/"
          target="_blank"
          rel="noreferrer"
          aria-label="Made by Inkeep"
          className="order-first flex items-center gap-1.5 justify-self-center rounded-sm text-sm font-medium text-slide-muted/60 outline-none transition-colors min-[24rem]:col-span-2 sm:order-0 sm:col-span-1 hover:text-slide-text focus-visible:ring-2 focus-visible:ring-slide-accent focus-visible:ring-offset-2"
        >
          <span>Made by</span>
          <InkeepWordmark className="mt-px w-14" />
        </Link>
        <div className="flex items-center justify-center gap-6 text-sm text-slide-muted min-[24rem]:justify-end">
          {legalLinks.map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              target="_blank"
              rel="noreferrer"
              className="rounded-sm outline-none transition-colors hover:text-slide-text focus-visible:ring-2 focus-visible:ring-slide-accent focus-visible:ring-offset-2"
            >
              {label}
            </Link>
          ))}
        </div>
      </div>
    </footer>
  );
}
