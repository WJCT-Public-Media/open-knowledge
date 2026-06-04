
import { afterEach, describe, expect, test } from 'bun:test';
import type { Config } from '@inkeep/open-knowledge-core';
import { cleanup, fireEvent, render } from '@testing-library/react';
import type { NodeViewProps } from '@tiptap/core';
import { ConfigContext, type ConfigContextValue } from '@/lib/config-context';
import { CodeBlockView } from './CodeBlockView';
import { PREVIEW_SCRIPT_SRC_CDN_ALLOWLIST } from './preview-iframe-header';

function makeConfigValue(merged: Config | null): ConfigContextValue {
  return {
    userBinding: null,
    userSynced: false,
    projectBinding: null,
    projectLocalBinding: null,
    okignoreBinding: null,
    okignoreSynced: false,
    userConfig: null,
    projectConfig: null,
    projectLocalConfig: null,
    projectLocalSynced: false,
    merged,
  };
}

function makeEditor(): NodeViewProps['editor'] {
  return {
    isEditable: true,
    isDestroyed: false,
    state: {
      doc: { nodeAt: () => ({ nodeSize: 10 }) },
      selection: { from: 0, to: 0 },
    },
    on: () => {},
    off: () => {},
  } as unknown as NodeViewProps['editor'];
}

function makeProps(): NodeViewProps {
  return {
    editor: makeEditor(),
    node: {
      attrs: { language: 'html', meta: 'preview' },
      textContent: '<div id="probe">hello</div>',
    },
    getPos: () => 0,
    selected: false,
    updateAttributes: () => {},
  } as unknown as NodeViewProps;
}

function renderSrcdoc(merged: Config | null): string {
  const { container } = render(
    <ConfigContext value={makeConfigValue(merged)}>
      <CodeBlockView {...makeProps()} />
    </ConfigContext>,
  );
  const iframe = container.querySelector('iframe');
  expect(iframe).toBeTruthy();
  return iframe?.getAttribute('srcdoc') ?? '';
}

describe('CodeBlockView preview-CSP wiring', () => {
  afterEach(() => {
    cleanup();
  });

  test('inline-only config produces a strict script-src with no CDN origins', () => {
    const srcdoc = renderSrcdoc({ preview: { scriptSrc: 'inline-only' } } as Config);
    expect(srcdoc).toContain("script-src 'unsafe-inline'");
    for (const origin of PREVIEW_SCRIPT_SRC_CDN_ALLOWLIST) {
      expect(srcdoc).not.toContain(origin);
    }
    expect(srcdoc).toContain('<div id="probe">hello</div>');
  });

  test('cdn-allowlist config admits every allowlisted CDN origin', () => {
    const srcdoc = renderSrcdoc({ preview: { scriptSrc: 'cdn-allowlist' } } as Config);
    for (const origin of PREVIEW_SCRIPT_SRC_CDN_ALLOWLIST) {
      expect(srcdoc).toContain(origin);
    }
  });

  test('falls back to cdn-allowlist when merged config is null (pre-sync)', () => {
    const srcdoc = renderSrcdoc(null);
    for (const origin of PREVIEW_SCRIPT_SRC_CDN_ALLOWLIST) {
      expect(srcdoc).toContain(origin);
    }
  });
});

describe('CodeBlockView edit-source modal language wiring', () => {
  afterEach(() => {
    cleanup();
  });

  test('html-preview fence opens edit-source modal with language="html"', () => {
    const { container } = render(
      <ConfigContext value={makeConfigValue({ preview: { scriptSrc: 'inline-only' } } as Config)}>
        <CodeBlockView {...makeProps()} />
      </ConfigContext>,
    );
    const editBtn = container.querySelector(
      'button[aria-label="Edit source"]',
    ) as HTMLButtonElement | null;
    expect(editBtn).toBeTruthy();
    fireEvent.click(editBtn as HTMLButtonElement);
    const sourceHost = document.querySelector('[data-testid="ok-code-preview-edit-modal-source"]');
    expect(sourceHost).toBeTruthy();
    expect(sourceHost?.getAttribute('data-language')).toBe('html');
  });
});
