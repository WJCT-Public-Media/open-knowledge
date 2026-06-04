import { describe as _bunDescribe, expect, test } from 'bun:test';

const describeCiSkippable = process.env.CI ? _bunDescribe.skip : _bunDescribe;
const describe = _bunDescribe;

import { type Config, ConfigSchema } from '../../config/schema.ts';
import { register } from './ingest.ts';
import type { ServerInstance } from './shared.ts';

const BASE_CONFIG: Config = ConfigSchema.parse({});

interface ToolResult {
  content: Array<{ type: 'text'; text: string }>;
  structuredContent?: Record<string, unknown>;
}

function captureTool() {
  let captured: ((args: { source: string; cwd?: string }) => Promise<ToolResult>) | undefined;
  const server = {
    registerTool(
      _name: string,
      _config: unknown,
      handler: (args: { source: string; cwd?: string }) => Promise<ToolResult>,
    ) {
      captured = handler;
    },
  } as unknown as ServerInstance;
  return {
    server,
    async call(source: string) {
      if (!captured) throw new Error('Tool was not registered');
      return await captured({ source });
    },
  };
}

describeCiSkippable('ingest — previewUrl emission', () => {
  test('returns structuredContent with previewUrl: null (workflow primer)', async () => {
    const { server, call } = captureTool();
    register(server, { config: BASE_CONFIG, resolveCwd: async () => process.cwd() });
    const result = await call('https://example.com/article');
    expect(result.structuredContent).toMatchObject({ previewUrl: null });
    expect(result.content[0]?.text).toContain('https://example.com/article');
  });
});

describe('ingest — binary preservation plan body (SPEC 2026-05-19)', () => {

  test('plan mentions binary-handling tokens (external-sources/, ![[, sha256, --max-filesize)', async () => {
    const { server, call } = captureTool();
    register(server, { config: BASE_CONFIG, resolveCwd: async () => process.cwd() });
    const result = await call('https://arxiv.org/pdf/2401.12345v1.pdf');
    const body = result.content[0]?.text ?? '';
    expect(body).toContain('external-sources/');
    expect(body).toContain('![[');
    expect(body).toContain('sha256');
    expect(body).toContain('--max-filesize');
  });

  test('plan names streaming-host STOP examples and the yt-dlp pointer', async () => {
    const { server, call } = captureTool();
    register(server, { config: BASE_CONFIG, resolveCwd: async () => process.cwd() });
    const result = await call('https://example.com/source');
    const body = result.content[0]?.text ?? '';
    const namesAtLeastOneStreamingHost = [
      'youtube.com',
      'youtu.be',
      'vimeo.com',
      'twitch.tv',
      'spotify.com',
    ].some((host) => body.includes(host));
    expect(namesAtLeastOneStreamingHost).toBe(true);
    expect(body).toContain('yt-dlp');
  });

  test('plan hard-blocks executable extensions (references EXECUTABLE_BLOCKLIST_EXTENSIONS)', async () => {
    const { server, call } = captureTool();
    register(server, { config: BASE_CONFIG, resolveCwd: async () => process.cwd() });
    const result = await call('https://example.com/source');
    const body = result.content[0]?.text ?? '';
    expect(body).toContain('EXECUTABLE_BLOCKLIST_EXTENSIONS');
    const namesAtLeastOneBlockedExtension = ['.exe', '.dmg', '.sh', '.html', '.webloc'].some(
      (ext) => body.includes(ext),
    );
    expect(namesAtLeastOneBlockedExtension).toBe(true);
  });

  test('plan documents shell-less fallback with preservation flag and admonition', async () => {
    const { server, call } = captureTool();
    register(server, { config: BASE_CONFIG, resolveCwd: async () => process.cwd() });
    const result = await call('https://example.com/source');
    const body = result.content[0]?.text ?? '';
    expect(body).toContain('preservation');
    expect(body).toContain('text-only');
    expect(body).toContain('Binary not preserved');
  });

  test('plan includes curl --proto scheme restriction (SSRF defense)', async () => {
    const { server, call } = captureTool();
    register(server, { config: BASE_CONFIG, resolveCwd: async () => process.cwd() });
    const result = await call('https://example.com/source');
    const body = result.content[0]?.text ?? '';
    expect(body).toContain('--proto =http,=https');
    expect(body).toContain('--proto-redir =http,=https');
  });

  test('plan documents slug shape constraint (path traversal defense)', async () => {
    const { server, call } = captureTool();
    register(server, { config: BASE_CONFIG, resolveCwd: async () => process.cwd() });
    const result = await call('https://example.com/source');
    const body = result.content[0]?.text ?? '';
    expect(body).toContain('^[a-z0-9]');
  });
});
