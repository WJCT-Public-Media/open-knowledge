import { afterEach, describe, expect, mock, test } from 'bun:test';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { TooltipProvider } from '@/components/ui/tooltip';
import { renderLinguiTemplate } from '@/test-utils/lingui-mock';

mock.module('@lingui/core/macro', () => ({
  msg: renderLinguiTemplate,
}));

mock.module('@lingui/react/macro', () => ({
  Trans: ({ children }: { children: ReactNode }) => <>{children}</>,
  useLingui: () => ({ t: renderLinguiTemplate }),
}));

mock.module('@/lib/external-link', () => ({
  dispatchExternalLinkClick: () => {},
}));

async function renderOpenHelpPopover() {
  const { HelpPopover } = await import('./HelpPopover');
  render(
    <TooltipProvider>
      <HelpPopover />
    </TooltipProvider>,
  );
  await userEvent.click(screen.getByRole('button', { name: 'Resources' }));
}

describe('HelpPopover runtime behavior', () => {
  afterEach(() => cleanup());

  test('exports the component', async () => {
    const mod = await import('./HelpPopover');
    expect(typeof mod.HelpPopover).toBe('function');
  });

  test('opens a resources-only nav whose accessible names match the visible heading', async () => {
    await renderOpenHelpPopover();

    expect(screen.getAllByText('Resources').length).toBeGreaterThanOrEqual(2);
    const nav = screen.getByRole('navigation', { name: 'Resources' });
    expect(nav).not.toBeNull();
    expect(screen.queryByText(/Help\s*&\s*Resources/i)).toBeNull();
    expect(screen.queryByText('Setup')).toBeNull();
    expect(screen.queryByText('Settings')).toBeNull();
    expect(screen.queryByText('Install for Claude Chat')).toBeNull();
  });

  test('renders the external resource links in the required order', async () => {
    await renderOpenHelpPopover();

    const nav = screen.getByRole('navigation', { name: 'Resources' });
    const links = within(nav).getAllByRole('link');
    expect(
      links.map((link) => ({
        label: Array.from(link.childNodes)
          .filter((node) => node.nodeType === Node.TEXT_NODE)
          .map((node) => node.textContent)
          .join('')
          .trim(),
        href: link.getAttribute('href'),
        target: link.getAttribute('target'),
        rel: link.getAttribute('rel'),
        hasIcon: link.querySelector('svg') !== null,
      })),
    ).toEqual([
      {
        label: 'Docs',
        href: 'https://openknowledge.ai/docs',
        target: '_blank',
        rel: 'noopener noreferrer',
        hasIcon: true,
      },
      {
        label: 'GitHub',
        href: 'https://github.com/inkeep/open-knowledge',
        target: '_blank',
        rel: 'noopener noreferrer',
        hasIcon: true,
      },
      {
        label: 'Discord',
        href: 'https://discord.com/invite/YujKpFN49',
        target: '_blank',
        rel: 'noopener noreferrer',
        hasIcon: true,
      },
      {
        label: 'X',
        href: 'https://x.com/OpenKnowledgeAI',
        target: '_blank',
        rel: 'noopener noreferrer',
        hasIcon: true,
      },
      {
        label: 'Open Knowledge',
        href: 'https://openknowledge.ai/',
        target: '_blank',
        rel: 'noopener noreferrer',
        hasIcon: true,
      },
    ]);
  });
});
