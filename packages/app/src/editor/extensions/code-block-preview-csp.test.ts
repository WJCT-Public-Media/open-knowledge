
import { describe, expect, test } from 'bun:test';
import {
  buildPreviewIframeHeader,
  PREVIEW_SCRIPT_SRC_CDN_ALLOWLIST,
} from './preview-iframe-header';

const POLICIES = ['cdn-allowlist', 'inline-only'] as const;

describe('buildPreviewIframeHeader — CSP directives', () => {
  for (const policy of POLICIES) {
    describe(`policy: ${policy}`, () => {
      const header = buildPreviewIframeHeader(policy, 'light');

      test('contains a CSP <meta> tag', () => {
        expect(header).toMatch(/<meta http-equiv="Content-Security-Policy" content="[^"]+">/);
      });

      test('blocks all outbound network requests', () => {
        expect(header).toContain("connect-src 'none'");
      });

      test('blocks external resource loads by default', () => {
        expect(header).toContain("default-src 'none'");
      });

      test('blocks form submission', () => {
        expect(header).toContain("form-action 'none'");
      });

      test('blocks <base> manipulation', () => {
        expect(header).toContain("base-uri 'none'");
      });

      test('blocks nested iframes', () => {
        expect(header).toContain("frame-src 'none'");
        expect(header).toContain("child-src 'none'");
      });

      test('permits inline scripts (the whole point of the preview)', () => {
        expect(header).toContain("script-src 'unsafe-inline'");
      });

      test('permits inline styles + `data:` for embedded SVG / fonts', () => {
        expect(header).toContain("style-src 'unsafe-inline' data:");
        expect(header).toContain('img-src data:');
        expect(header).toContain('font-src data:');
      });

      test('never permits `*` or a bare `https:` scheme-source in script-src', () => {
        expect(header).not.toMatch(/script-src[^;]*https:(?!\/)/);
        expect(header).not.toMatch(/script-src[^;]*\*/);
      });
    });
  }

  test('cdn-allowlist script-src permits unsafe-inline plus every allowlisted CDN origin', () => {
    const header = buildPreviewIframeHeader('cdn-allowlist', 'light');
    expect(header).toContain("script-src 'unsafe-inline'");
    for (const origin of PREVIEW_SCRIPT_SRC_CDN_ALLOWLIST) {
      expect(header).toContain(origin);
    }
  });

  test('inline-only script-src permits unsafe-inline only, no external origin', () => {
    const header = buildPreviewIframeHeader('inline-only', 'light');
    expect(header).toContain("script-src 'unsafe-inline'");
    for (const origin of PREVIEW_SCRIPT_SRC_CDN_ALLOWLIST) {
      expect(header).not.toContain(origin);
    }
    expect(header).not.toMatch(/script-src[^;]*https:/);
  });

  test('the CDN allowlist is exactly the four trusted static CDNs', () => {
    expect(PREVIEW_SCRIPT_SRC_CDN_ALLOWLIST).toEqual([
      'https://cdnjs.cloudflare.com',
      'https://cdn.jsdelivr.net',
      'https://unpkg.com',
      'https://esm.sh',
    ]);
  });
});
