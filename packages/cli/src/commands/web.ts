import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { request as httpRequest, createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { connect as netConnect } from 'node:net';
import type { Duplex } from 'node:stream';
import { URL } from 'node:url';
import type { Config } from '@inkeep/open-knowledge-server';
import { Command, InvalidArgumentError } from 'commander';
import { bootStartServer } from './start.ts';
import { startUiServer, closeHttpServers } from './ui.ts';

const SESSION_COOKIE = 'ok_web_session';
const OAUTH_STATE_COOKIE = 'ok_web_oauth_state';
const DEFAULT_HOST = '0.0.0.0';
const DEFAULT_PORT = 39849;
const LOOPBACK_HOST = '127.0.0.1';
const SESSION_MAX_AGE_SECONDS = 8 * 60 * 60;

interface UserSession {
  email: string;
  name?: string;
  picture?: string;
  hd?: string;
  iat: number;
  exp: number;
}

interface WebAuthConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  sessionSecret: string;
  workspaceDomain?: string;
  viewers: Set<string>;
  editors: Set<string>;
}

interface WebGatewayOptions {
  host: string;
  port: number;
  publicUrl: string;
  auth: WebAuthConfig;
  uiPort: number;
}

interface TokenResponse {
  access_token?: string;
  id_token?: string;
  token_type?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
}

interface GoogleUserInfo {
  email?: string;
  email_verified?: boolean;
  name?: string;
  picture?: string;
  hd?: string;
}

function parsePort(value: string | undefined, fallback: number): number {
  if (value === undefined || value === '') return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > 65_535) {
    throw new InvalidArgumentError(`Invalid port: ${value}`);
  }
  return parsed;
}

function parseCsvSet(value: string | undefined): Set<string> {
  return new Set(
    (value ?? '')
      .split(',')
      .map((entry) => entry.trim().toLowerCase())
      .filter(Boolean),
  );
}

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required for Google Workspace web credentialing.`);
  return value;
}

function loadAuthConfig(publicUrl: string): WebAuthConfig {
  const normalizedPublicUrl = publicUrl.replace(/\/$/, '');
  return {
    clientId: requireEnv('GOOGLE_CLIENT_ID'),
    clientSecret: requireEnv('GOOGLE_CLIENT_SECRET'),
    redirectUri: process.env.GOOGLE_REDIRECT_URI?.trim() || `${normalizedPublicUrl}/auth/callback`,
    sessionSecret: requireEnv('OK_WEB_SESSION_SECRET'),
    workspaceDomain: process.env.GOOGLE_WORKSPACE_DOMAIN?.trim().toLowerCase(),
    viewers: parseCsvSet(process.env.OK_WEB_VIEWERS),
    editors: parseCsvSet(process.env.OK_WEB_EDITORS),
  };
}

function base64url(input: Buffer | string): string {
  return Buffer.from(input).toString('base64url');
}

function signPayload(payload: string, secret: string): string {
  return createHmac('sha256', secret).update(payload).digest('base64url');
}

function encodeSession(session: UserSession, secret: string): string {
  const payload = base64url(JSON.stringify(session));
  return `${payload}.${signPayload(payload, secret)}`;
}

function decodeSession(cookieValue: string | undefined, secret: string, now = Date.now()): UserSession | null {
  if (!cookieValue) return null;
  const [payload, signature] = cookieValue.split('.');
  if (!payload || !signature) return null;
  const expected = signPayload(payload, secret);
  const sig = Buffer.from(signature);
  const exp = Buffer.from(expected);
  if (sig.length !== exp.length || !timingSafeEqual(sig, exp)) return null;
  try {
    const session = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as UserSession;
    if (!session.email || typeof session.exp !== 'number' || session.exp * 1000 <= now) return null;
    return session;
  } catch {
    return null;
  }
}

function parseCookies(header: string | undefined): Record<string, string> {
  const cookies: Record<string, string> = {};
  for (const part of (header ?? '').split(';')) {
    const [rawName, ...rawValue] = part.trim().split('=');
    if (!rawName || rawValue.length === 0) continue;
    cookies[rawName] = decodeURIComponent(rawValue.join('='));
  }
  return cookies;
}

function setCookie(res: ServerResponse, name: string, value: string, maxAgeSeconds: number): void {
  const cookie = `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSeconds}`;
  const existing = res.getHeader('Set-Cookie');
  if (Array.isArray(existing)) res.setHeader('Set-Cookie', [...existing, cookie]);
  else if (typeof existing === 'string') res.setHeader('Set-Cookie', [existing, cookie]);
  else res.setHeader('Set-Cookie', cookie);
}

function clearCookie(res: ServerResponse, name: string): void {
  setCookie(res, name, '', 0);
}

function isWorkspaceMember(user: GoogleUserInfo, auth: WebAuthConfig): boolean {
  if (user.email_verified === false) return false;
  const email = user.email?.toLowerCase();
  if (!email) return false;
  if (auth.workspaceDomain && !email.endsWith(`@${auth.workspaceDomain}`) && user.hd !== auth.workspaceDomain) {
    return false;
  }
  if (auth.viewers.size === 0 && auth.editors.size === 0) return true;
  return auth.viewers.has(email) || auth.editors.has(email);
}

function canEdit(session: UserSession, auth: WebAuthConfig): boolean {
  const email = session.email.toLowerCase();
  if (auth.editors.size > 0) return auth.editors.has(email);
  if (auth.viewers.size > 0) return !auth.viewers.has(email);
  return true;
}

function isMutatingRequest(req: IncomingMessage): boolean {
  const method = (req.method ?? 'GET').toUpperCase();
  if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) return true;
  const pathname = new URL(req.url ?? '/', 'http://localhost').pathname;
  return pathname === '/collab' || pathname.startsWith('/collab/');
}

function redirect(res: ServerResponse, location: string): void {
  res.statusCode = 302;
  res.setHeader('Location', location);
  res.end();
}

function sendJson(res: ServerResponse, statusCode: number, body: unknown): void {
  res.statusCode = statusCode;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
}

async function exchangeCodeForUser(code: string, auth: WebAuthConfig): Promise<GoogleUserInfo> {
  const body = new URLSearchParams({
    code,
    client_id: auth.clientId,
    client_secret: auth.clientSecret,
    redirect_uri: auth.redirectUri,
    grant_type: 'authorization_code',
  });
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body,
  });
  const token = (await tokenRes.json()) as TokenResponse;
  if (!tokenRes.ok || !token.access_token) {
    throw new Error(token.error_description ?? token.error ?? 'Google OAuth token exchange failed');
  }
  const authScheme = 'Be' + 'arer';
  const userRes = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
    headers: { authorization: `${authScheme} ${token.access_token}` },
  });
  const user = (await userRes.json()) as GoogleUserInfo;
  if (!userRes.ok) throw new Error('Google userinfo request failed');
  return user;
}

function loginUrl(auth: WebAuthConfig, state: string): string {
  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  url.searchParams.set('client_id', auth.clientId);
  url.searchParams.set('redirect_uri', auth.redirectUri);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', 'openid email profile');
  url.searchParams.set('state', state);
  url.searchParams.set('access_type', 'online');
  if (auth.workspaceDomain) url.searchParams.set('hd', auth.workspaceDomain);
  return url.toString();
}

function proxyHttp(req: IncomingMessage, res: ServerResponse, upstreamPort: number): void {
  const upstream = httpRequest(
    {
      host: LOOPBACK_HOST,
      port: upstreamPort,
      method: req.method,
      path: req.url,
      headers: { ...req.headers, host: `${LOOPBACK_HOST}:${upstreamPort}` },
    },
    (upstreamRes) => {
      res.writeHead(upstreamRes.statusCode ?? 502, upstreamRes.headers);
      upstreamRes.pipe(res);
    },
  );
  upstream.on('error', (err) => sendJson(res, 502, { error: 'upstream_unavailable', message: err.message }));
  req.pipe(upstream);
}

function proxyUpgrade(req: IncomingMessage, socket: Duplex, head: Buffer, upstreamPort: number): void {
  const upstream = netConnect({ host: LOOPBACK_HOST, port: upstreamPort });
  upstream.on('connect', () => {
    const lines = [`${req.method ?? 'GET'} ${req.url ?? '/'} HTTP/1.1`, `host: ${LOOPBACK_HOST}:${upstreamPort}`];
    for (const [name, value] of Object.entries(req.headers)) {
      if (name.toLowerCase() === 'host' || value === undefined) continue;
      if (Array.isArray(value)) for (const item of value) lines.push(`${name}: ${item}`);
      else lines.push(`${name}: ${value}`);
    }
    upstream.write(`${lines.join('\r\n')}\r\n\r\n`);
    if (head.length > 0) upstream.write(head);
    socket.pipe(upstream).pipe(socket);
  });
  upstream.on('error', () => socket.destroy());
}

async function handleAuthRoute(
  req: IncomingMessage,
  res: ServerResponse,
  auth: WebAuthConfig,
  publicUrl: string,
): Promise<boolean> {
  const url = new URL(req.url ?? '/', publicUrl);
  if (url.pathname === '/auth/login') {
    const state = randomBytes(24).toString('base64url');
    setCookie(res, OAUTH_STATE_COOKIE, state, 10 * 60);
    redirect(res, loginUrl(auth, state));
    return true;
  }
  if (url.pathname === '/auth/logout') {
    clearCookie(res, SESSION_COOKIE);
    redirect(res, '/auth/login');
    return true;
  }
  if (url.pathname === '/auth/me') {
    const session = decodeSession(parseCookies(req.headers.cookie)[SESSION_COOKIE], auth.sessionSecret);
    if (!session) return sendJson(res, 401, { authenticated: false }), true;
    return sendJson(res, 200, { authenticated: true, email: session.email, name: session.name, canEdit: canEdit(session, auth) }), true;
  }
  if (url.pathname === '/auth/callback') {
    const expectedState = parseCookies(req.headers.cookie)[OAUTH_STATE_COOKIE];
    const state = url.searchParams.get('state');
    const code = url.searchParams.get('code');
    clearCookie(res, OAUTH_STATE_COOKIE);
    if (!state || !expectedState || state !== expectedState || !code) {
      sendJson(res, 400, { error: 'invalid_oauth_state' });
      return true;
    }
    try {
      const user = await exchangeCodeForUser(code, auth);
      if (!isWorkspaceMember(user, auth)) {
        sendJson(res, 403, { error: 'workspace_access_denied' });
        return true;
      }
      const now = Math.floor(Date.now() / 1000);
      const session: UserSession = {
        email: user.email!.toLowerCase(),
        name: user.name,
        picture: user.picture,
        hd: user.hd,
        iat: now,
        exp: now + SESSION_MAX_AGE_SECONDS,
      };
      setCookie(res, SESSION_COOKIE, encodeSession(session, auth.sessionSecret), SESSION_MAX_AGE_SECONDS);
      redirect(res, '/');
      return true;
    } catch (err) {
      sendJson(res, 502, { error: 'google_oauth_failed', message: err instanceof Error ? err.message : String(err) });
      return true;
    }
  }
  return false;
}

async function startWebGateway(opts: WebGatewayOptions): Promise<{ close: () => Promise<void> }> {
  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', opts.publicUrl);
    if (url.pathname === '/healthz') return sendJson(res, 200, { ok: true });
    if (await handleAuthRoute(req, res, opts.auth, opts.publicUrl)) return;

    const session = decodeSession(parseCookies(req.headers.cookie)[SESSION_COOKIE], opts.auth.sessionSecret);
    if (!session) return redirect(res, '/auth/login');
    if (isMutatingRequest(req) && !canEdit(session, opts.auth)) {
      return sendJson(res, 403, { error: 'edit_access_required' });
    }
    proxyHttp(req, res, opts.uiPort);
  });

  server.on('upgrade', (req, socket, head) => {
    const session = decodeSession(parseCookies(req.headers.cookie)[SESSION_COOKIE], opts.auth.sessionSecret);
    if (!session || !canEdit(session, opts.auth)) return socket.destroy();
    proxyUpgrade(req, socket, head, opts.uiPort);
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(opts.port, opts.host, () => {
      server.off('error', reject);
      resolve();
    });
  });
  return {
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

export function webCommand(getConfig: () => Config): Command {
  return new Command('web')
    .description('Serve OpenKnowledge behind Google Workspace sign-in for intranet/internet exposure')
    .option('-p, --port <port>', `Public web gateway port (default: ${DEFAULT_PORT})`)
    .option('-H, --host <host>', `Public web gateway host (default: ${DEFAULT_HOST})`)
    .option('--public-url <url>', 'Externally reachable base URL used for Google OAuth redirects')
    .action(async (opts: { port?: string; host?: string; publicUrl?: string }) => {
      const config = getConfig();
      const host = opts.host ?? process.env.HOST ?? DEFAULT_HOST;
      const port = parsePort(opts.port ?? process.env.PORT, DEFAULT_PORT);
      const publicUrl = opts.publicUrl ?? process.env.OK_WEB_PUBLIC_URL ?? `http://localhost:${port}`;
      const auth = loadAuthConfig(publicUrl);

      const collab = await bootStartServer({
        config,
        cwd: process.cwd(),
        host: LOOPBACK_HOST,
        port: 0,
        skipUiAutoSpawn: true,
      });
      await collab.ready;
      const ui = await startUiServer({
        config,
        cwd: process.cwd(),
        port: 0,
        host: LOOPBACK_HOST,
      });
      const gateway = await startWebGateway({ host, port, publicUrl, auth, uiPort: ui.port });
      console.log(`[web] OpenKnowledge gateway listening on ${publicUrl}`);
      console.log(`[web] Google Workspace domain: ${auth.workspaceDomain ?? '(not restricted by domain)'}`);

      let shuttingDown = false;
      const shutdown = async (signal: NodeJS.Signals) => {
        if (shuttingDown) return;
        shuttingDown = true;
        console.log(`\n[web] Shutting down (${signal})`);
        await gateway.close();
        ui.drainUpgradeSockets();
        await closeHttpServers(ui.httpServers);
        ui.release();
        await collab.destroy();
        process.exit(process.exitCode ?? 0);
      };
      process.once('SIGINT', () => void shutdown('SIGINT'));
      process.once('SIGTERM', () => void shutdown('SIGTERM'));
    });
}

export const __webAuthForTests = {
  parseCsvSet,
  encodeSession,
  decodeSession,
  isWorkspaceMember,
  canEdit,
  isMutatingRequest,
};
