import { describe, expect, test } from 'bun:test';
import { __webAuthForTests } from './web.ts';

const { decodeSession, encodeSession, isMutatingRequest, isWorkspaceMember, canEdit, parseCsvSet } =
  __webAuthForTests;

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
});
