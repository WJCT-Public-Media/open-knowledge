import type { MessageDescriptor } from '@lingui/core';
import { msg } from '@lingui/core/macro';
import { Trans, useLingui } from '@lingui/react/macro';
import { BookOpen, CircleHelp } from 'lucide-react';
import type { ComponentProps, FC } from 'react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { dispatchExternalLinkClick } from '@/lib/external-link';
import { cn } from '@/lib/utils';
import { DiscordIcon } from './icons/discord';
import { GithubIcon } from './icons/github';
import { OkIcon } from './icons/ok';
import { XTwitterIcon } from './icons/x-twitter';

const links: Array<{
  label: string | MessageDescriptor;
  href: string;
  icon: FC<ComponentProps<'svg'>>;
  iconClassName?: string;
}> = [
  { label: msg`Docs`, href: 'https://openknowledge.ai/docs', icon: BookOpen },
  { label: 'GitHub', href: 'https://github.com/inkeep/open-knowledge', icon: GithubIcon },
  { label: 'Discord', href: 'https://discord.com/invite/YujKpFN49', icon: DiscordIcon },
  { label: 'X', href: 'https://x.com/OpenKnowledgeAI', icon: XTwitterIcon },
  {
    label: 'Open Knowledge',
    href: 'https://openknowledge.ai/',
    icon: OkIcon,
    iconClassName: 'scale-125 grayscale transition-[filter] group-hover:grayscale-0',
  },
];

export const HelpPopover: FC = () => {
  const { t } = useLingui();
  const [popoverOpen, setPopoverOpen] = useState(false);

  return (
    <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="size-7 hover:bg-accent text-muted-foreground"
            >
              <CircleHelp className="size-4" />
              <span className="sr-only">
                <Trans>Resources</Trans>
              </span>
            </Button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent>
          <Trans>Resources</Trans>
        </TooltipContent>
      </Tooltip>
      <PopoverContent align="end" className="w-48 p-3">
        <p className="font-mono tracking-wide uppercase text-muted-foreground text-xs mb-1">
          <Trans>Resources</Trans>
        </p>
        <nav aria-label={t`Resources`}>
          <ul className="space-y-0.5">
            {links.map(({ label, href, icon: Icon, iconClassName }) => (
              <li key={href}>
                <a
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => dispatchExternalLinkClick(e, href)}
                  onAuxClick={(e) => dispatchExternalLinkClick(e, href)}
                  className="group flex items-center gap-2.5 rounded-md px-2 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-azure-900/5 dark:hover:bg-white/20 hover:text-primary"
                >
                  <Icon aria-hidden="true" className={cn('size-4 shrink-0', iconClassName)} />
                  {typeof label === 'string' ? label : t(label)}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      </PopoverContent>
    </Popover>
  );
};
