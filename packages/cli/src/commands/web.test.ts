import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, test } from 'bun:test';
import { __webAuthForTests } from './web.ts';

const {
  decodeSession,
  buildFirstRunHelp,
  defaultWorkspaceDomain,
  encodeSession,
  isMutatingRequest,
  isWorkspaceMember,
  canEdit,
  loadEnvFile,
  parseCsvSet,
  serializeWebSettings,
  sameOriginCollabUrl,
  upstreamProxyHeaders,
} = __webAuthForTests;

describe('web gateway auth helpers', () => {
  test('round-trips signed sessions and rejects tampering', () => {
    const secret = 'test-secret-that-is-long-enough';
    const cookie = encodeSession(
      { email: 'editor@example.org', iat: 100, exp: Math.floor(Date.now() / 1000) + 60 },
      secret,
    );
    expect(decodeSession(cookie, secret)?.email).toBe('editor@example.org');
    const [payload, signature] = cookie.split('.');
    expect(decodeSession(`${payload}.${signature?.replace(/.$/, 'x')}`, secret)).toBeNull();
    expect(decodeSession(cookie, 'wrong-secret')).toBeNull();
  });

  test('enforces Google Workspace domain and allowlists', () => {
    const auth = {
      clientId: 'id',
      clientSecret: 'secret',
      redirectUri: 'http://localhost/auth/callback',
      sessionSecret: 'session',
      workspaceDomain: 'example.org',
      viewers: parseCsvSet('viewer@example.org'),
      editors: parseCsvSet('editor@example.org'),
    };
    expect(isWorkspaceMember({ email: 'viewer@example.org', email_verified: true, hd: 'example.org' }, auth)).toBe(
      true,
    );
    expect(isWorkspaceMember({ email: 'other@example.org', email_verified: true }, auth)).toBe(false);
    expect(isWorkspaceMember({ email: 'viewer@example.org', email_verified: false, hd: 'example.org' }, auth)).toBe(
      false,
    );
  });

  test('separates viewer and editor privileges', () => {
    const auth = {
      clientId: 'id',
      clientSecret: 'secret',
      redirectUri: 'http://localhost/auth/callback',
      sessionSecret: 'session',
      viewers: parseCsvSet('viewer@example.org'),
      editors: parseCsvSet('editor@example.org'),
    };
    expect(canEdit({ email: 'editor@example.org', iat: 1, exp: 2 }, auth)).toBe(true);
    expect(canEdit({ email: 'viewer@example.org', iat: 1, exp: 2 }, auth)).toBe(false);
  });

  test('classifies mutating HTTP and collaboration requests', () => {
    expect(isMutatingRequest({ method: 'GET', url: '/api/config' } as never)).toBe(false);
    expect(isMutatingRequest({ method: 'POST', url: '/api/document' } as never)).toBe(true);
    expect(isMutatingRequest({ method: 'GET', url: '/collab' } as never)).toBe(true);
  });

  test('formats first-run setup help as a welcoming clickable guide', () => {
    const help = buildFirstRunHelp('http://localhost:39849');
    expect(help).toStartWith('Welcome to OpenKnowledge web setup.');
    expect(help).toContain('First-time Google Workspace setup');
    expect(help).toContain('\u001b]8;;https://console.cloud.google.com/apis/credentials\u001b\\Google Cloud Console\u001b]8;;\u001b\\');
    expect(help).toContain('Name it "OpenKnowledge Web Server".');
    expect(help).toContain('Authorized JavaScript origins: none required.');
    expect(help.indexOf('Authorized JavaScript origins: none required.')).toBeLessThan(
      help.indexOf('Add this authorized redirect URI:'),
    );
    expect(help).toContain('http://localhost:39849/auth/callback');
    expect(help).not.toContain('[web]');
  });

  test('publishes a same-origin collaboration URL for the gateway', () => {
    expect(sameOriginCollabUrl('http://wiki.example.org')).toBe('ws://wiki.example.org/collab');
    expect(sameOriginCollabUrl('https://wiki.example.org/base')).toBe('wss://wiki.example.org/collab');
  });

  test('scrubs browser origin before proxying authenticated gateway requests to loopback API', () => {
    const headers = upstreamProxyHeaders(
      {
        host: 'wiki.example.org',
        origin: 'http://wiki.example.org',
        referer: 'http://wiki.example.org/file',
        cookie: 'ok_web_session=test',
      },
      41234,
    );
    expect(headers.host).toBe('127.0.0.1:41234');
    expect(headers.origin).toBeUndefined();
    expect(headers.referer).toBeUndefined();
    expect(headers.cookie).toBe('ok_web_session=test');
  });

  test('loads and serializes first-run web gateway settings', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ok-web-'));
    const path = join(dir, 'web.env');
    try {
      writeFileSync(
        path,
        'GOOGLE_CLIENT_ID=id\nGOOGLE_CLIENT_SECRET="secret"\nOK_WEB_SESSION_SECRET=session\nGOOGLE_WORKSPACE_DOMAIN=example.org\nOK_WEB_PUBLIC_URL=https://wiki.example.org\n',
      );
      expect(loadEnvFile(path)).toMatchObject({
        GOOGLE_CLIENT_ID: 'id',
        GOOGLE_CLIENT_SECRET: 'secret',
        OK_WEB_SESSION_SECRET: 'session',
        GOOGLE_WORKSPACE_DOMAIN: 'example.org',
        OK_WEB_PUBLIC_URL: 'https://wiki.example.org',
      });
      const serialized = serializeWebSettings({
        clientId: 'id',
        clientSecret: 'secret',
        sessionSecret: 'session',
        publicUrl: 'https://wiki.example.org',
      });
      expect(serialized).toContain('GOOGLE_CLIENT_ID=id');
      expect(serialized).toContain('OK_WEB_PUBLIC_URL=https://wiki.example.org');
      expect(defaultWorkspaceDomain('https://wiki.example.org')).toBe('example.org');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
