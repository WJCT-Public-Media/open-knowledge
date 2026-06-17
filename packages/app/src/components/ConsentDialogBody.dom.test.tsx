import { afterEach, describe, expect, mock, test } from 'bun:test';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import type { ConsentStore } from '@/lib/consent-store';
import type {
  OkDesktopBridge,
  OkOnboardingConfirmRequest,
  OkOnboardingShowPayload,
} from '@/lib/desktop-bridge-types';
import { renderLinguiTemplate } from '@/test-utils/lingui-mock';
import ConsentDialogBody from './ConsentDialogBody';

mock.module('@lingui/core/macro', () => ({
  msg: renderLinguiTemplate,
}));

mock.module('@lingui/react/macro', () => ({
  Trans: ({ children }: { children: ReactNode }) => <>{children}</>,
  useLingui: () => ({ t: renderLinguiTemplate }),
}));

const payload: OkOnboardingShowPayload = {
  pickedPath: '/project',
  projectDir: '/project',
  defaultContentDir: 'docs',
  gitState: 'present',
  gitRootPromoted: false,
  warnings: [],
  editorOptions: [
    { id: 'claude-desktop', label: 'Claude Desktop', hasProjectConfig: true },
    { id: 'codex', label: 'Codex', hasProjectConfig: false },
  ],
};

function setBridge(bridge: unknown) {
  Object.defineProperty(window, 'okDesktop', {
    configurable: true,
    writable: true,
    value: bridge,
  });
}

function makeStore() {
  const confirmCalls: OkOnboardingConfirmRequest[] = [];
  const cancelCalls: string[] = [];
  const store: ConsentStore = {
    install: () => undefined,
    getSnapshot: () => payload,
    subscribe: () => () => {},
    confirm: async (request) => {
      confirmCalls.push(request);
      return { ok: true };
    },
    cancel: async () => {
      cancelCalls.push('cancel');
      return { ok: true };
    },
    dismiss: () => {},
  };
  return { store, confirmCalls, cancelCalls };
}

function renderConsentDialog() {
  const harness = makeStore();
  render(<ConsentDialogBody payload={payload} store={harness.store} />);
  return harness;
}

async function expandAdvanced() {
  await userEvent.click(screen.getByTestId('consent-advanced-trigger'));
}

describe('ConsentDialogBody runtime form behavior', () => {
  afterEach(() => {
    cleanup();
    setBridge(undefined);
  });

  test('exports the default component', () => {
    expect(typeof ConsentDialogBody).toBe('function');
  });

  test('advanced controls are collapsed by default and reveal on expand', async () => {
    renderConsentDialog();

    expect(screen.queryByTestId('consent-content-dir')).toBeNull();
    expect(screen.queryByTestId('consent-additional-ignores')).toBeNull();
    expect(screen.queryByTestId('consent-sharing')).toBeNull();

    await expandAdvanced();

    expect(screen.getByTestId('consent-content-dir')).not.toBeNull();
    expect(screen.getByTestId('consent-additional-ignores')).not.toBeNull();
    expect(screen.getByTestId('consent-sharing')).not.toBeNull();
  });

  test('an invalid default content dir force-opens Advanced settings and shows the error without expanding', () => {
    const harness = makeStore();
    const invalidPayload = { ...payload, defaultContentDir: '../secrets' };
    render(<ConsentDialogBody payload={invalidPayload} store={harness.store} />);

    expect(screen.getByTestId('consent-content-dir')).not.toBeNull();
    expect(screen.getByTestId('consent-content-dir-error')).not.toBeNull();
    expect((screen.getByTestId('consent-start') as HTMLButtonElement).disabled).toBe(true);
  });

  test('Cancel is a non-submit button and invokes cancel without confirming', async () => {
    const { confirmCalls, cancelCalls } = renderConsentDialog();

    const cancel = screen.getByTestId('consent-cancel');
    expect(cancel.getAttribute('type')).toBe('button');
    await userEvent.click(cancel);

    await waitFor(() => {
      expect(cancelCalls).toEqual(['cancel']);
    });
    expect(confirmCalls).toEqual([]);
  });

  test('Start is bound to the body form and form submit prevents default before confirming', async () => {
    const { confirmCalls } = renderConsentDialog();

    const form = screen.getByTestId('consent-form') as HTMLFormElement;
    const start = screen.getByTestId('consent-start');
    expect(start.getAttribute('type')).toBe('submit');
    expect(start.getAttribute('form')).toBe(form.id);

    expect(fireEvent.submit(form)).toBe(false);
    await waitFor(() => {
      expect(confirmCalls).toHaveLength(1);
    });
    expect(confirmCalls[0]).toEqual({
      initGit: true,
      contentDir: 'docs',
      additionalIgnores: '',
      editorIds: ['claude-desktop', 'codex'],
      sharing: 'shared',
    });
  });

  test('invalid contentDir submit is default-prevented and does not confirm', async () => {
    const { confirmCalls } = renderConsentDialog();
    await expandAdvanced();

    fireEvent.change(screen.getByTestId('consent-content-dir'), {
      target: { value: '../secrets' },
    });

    const form = screen.getByTestId('consent-form');
    const start = screen.getByTestId('consent-start') as HTMLButtonElement;
    expect(start.disabled).toBe(true);
    expect(fireEvent.submit(form)).toBe(false);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(confirmCalls).toEqual([]);
  });

  test('Browse seeds the folder picker with the project directory', async () => {
    const openFolderCalls: Array<{ defaultPath?: string } | undefined> = [];
    setBridge({
      dialog: {
        openFolder: async (opts?: { defaultPath?: string }) => {
          openFolderCalls.push(opts);
          return '/project/docs/notes';
        },
      },
    } as Pick<OkDesktopBridge, 'dialog'>);
    renderConsentDialog();
    await expandAdvanced();

    await userEvent.click(screen.getByTestId('consent-content-dir-browse'));

    await waitFor(() => {
      expect(openFolderCalls).toEqual([{ defaultPath: '/project' }]);
    });
    expect((screen.getByTestId('consent-content-dir') as HTMLInputElement).value).toBe(
      'docs/notes',
    );
  });
});
