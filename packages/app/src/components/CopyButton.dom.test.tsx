import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

type WindowGlobals = { NodeFilter?: typeof NodeFilter };
type GlobalWithDomShims = typeof globalThis &
  WindowGlobals & { window?: WindowGlobals; ResizeObserver?: unknown };
const globalWithDomShims = globalThis as GlobalWithDomShims;
if (
  globalWithDomShims.NodeFilter === undefined &&
  globalWithDomShims.window?.NodeFilter !== undefined
) {
  globalWithDomShims.NodeFilter = globalWithDomShims.window.NodeFilter;
}
if (globalWithDomShims.ResizeObserver === undefined) {
  class NoopResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  globalWithDomShims.ResizeObserver = NoopResizeObserver;
}

const { CopyButton } = await import('./CopyButton');
const { TooltipProvider } = await import('@/components/ui/tooltip');

function renderCopyButton(props: Parameters<typeof CopyButton>[0]) {
  return render(
    <TooltipProvider>
      <CopyButton {...props} />
    </TooltipProvider>,
  );
}

describe('CopyButton', () => {
  beforeEach(() => {
    Object.defineProperty(globalThis.navigator, 'clipboard', {
      configurable: true,
      value: undefined,
    });
  });
  afterEach(() => {
    cleanup();
  });

  test('mounts in the Copy state by default', () => {
    renderCopyButton({ copyContent: 'https://openknowledge.ai/d/Share123' });

    expect(screen.getByRole('button', { name: 'Copy' })).not.toBeNull();
    expect(screen.queryByRole('button', { name: 'Copied!' })).toBeNull();
  });

  test('a successful copy flips the icon to Copied! and writes the content', async () => {
    const writes: string[] = [];
    renderCopyButton({
      copyContent: 'https://openknowledge.ai/d/Share123',
      clipboardWrite: (text) => {
        writes.push(text);
        return Promise.resolve();
      },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Copy' }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Copied!' })).not.toBeNull();
    });
    expect(writes).toEqual(['https://openknowledge.ai/d/Share123']);
  });

  test('initialCopied mounts already in the Copied! state', () => {
    renderCopyButton({
      copyContent: 'https://openknowledge.ai/d/Share123',
      initialCopied: true,
      clipboardWrite: () => Promise.resolve(),
    });

    expect(screen.getByRole('button', { name: 'Copied!' })).not.toBeNull();
  });

  test('a refused clipboard write leaves the icon as Copy', async () => {
    renderCopyButton({
      copyContent: 'https://openknowledge.ai/d/Share123',
      clipboardWrite: () => Promise.reject(new Error('permission denied')),
    });

    fireEvent.click(screen.getByRole('button', { name: 'Copy' }));

    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(screen.getByRole('button', { name: 'Copy' })).not.toBeNull();
    expect(screen.queryByRole('button', { name: 'Copied!' })).toBeNull();
  });
});
