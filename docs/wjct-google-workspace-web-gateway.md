# WJCT Google Workspace Web Gateway

This fork adds a public/intranet-ready web gateway for OpenKnowledge. The gateway lets WJCT run OpenKnowledge as a browser-accessible service while requiring Google Workspace sign-in before users can view or edit content.

## What changed

- Added the `ok web` CLI command for serving OpenKnowledge as a long-running web service.
- Added Google Workspace OAuth sign-in routes:
  - `/auth/login`
  - `/auth/callback`
  - `/auth/logout`
  - `/auth/me`
- Added signed, HTTP-only browser sessions.
- Added unauthenticated access protection: users who are not signed in are redirected to `/auth/login`.
- Added Workspace domain restriction with `GOOGLE_WORKSPACE_DOMAIN`.
- Added optional viewer/editor allowlists with `OK_WEB_VIEWERS` and `OK_WEB_EDITORS`.
- Added edit enforcement for mutating HTTP requests.
- Added edit enforcement for collaboration WebSocket upgrades.
- Added a `/healthz` endpoint for uptime checks.

## Intranet or internet serving

The gateway is intended to be run behind WJCT infrastructure such as an intranet DNS name, reverse proxy, TLS terminator, firewall, or internet-facing load balancer.

By default, `ok web` listens on all network interfaces:

```bash
ok web --host 0.0.0.0 --port 39849 --public-url https://openknowledge.intranet.wjct.org
```

Use an intranet hostname for an internal-only deployment, for example:

```bash
OK_WEB_PUBLIC_URL=https://openknowledge.intranet.wjct.org
```

Use an internet hostname for a public deployment, for example:

```bash
OK_WEB_PUBLIC_URL=https://openknowledge.wjct.org
```

The `--public-url` value must match the externally reachable URL users open in the browser. It is also used to build the Google OAuth callback URL.

## Required environment variables

Set these before starting the gateway:

```bash
export GOOGLE_CLIENT_ID="<google-oauth-client-id>"
export GOOGLE_CLIENT_SECRET="<google-oauth-client-secret>"
export OK_WEB_SESSION_SECRET="<long-random-session-secret>"
export GOOGLE_WORKSPACE_DOMAIN="wjct.org"
export OK_WEB_PUBLIC_URL="https://openknowledge.intranet.wjct.org"
```

Do not commit real secret values to the repository.

## Optional viewer and editor controls

If neither allowlist is set, any signed-in user from the configured Google Workspace domain can view and edit.

To separate viewers from editors, set one or both allowlists as comma-separated email addresses:

```bash
export OK_WEB_VIEWERS="viewer1@wjct.org,viewer2@wjct.org"
export OK_WEB_EDITORS="editor1@wjct.org,editor2@wjct.org"
```

Behavior:

- Users in `OK_WEB_VIEWERS` can sign in and view content, but cannot perform edit operations.
- Users in `OK_WEB_EDITORS` can sign in, view content, and make edits.
- If allowlists are configured, users outside the allowlists are denied access even if they are in the Workspace domain.

## Google OAuth configuration

In Google Cloud, configure an OAuth client for the hostname where the gateway will be served.

For the default callback path, add this authorized redirect URI:

```text
https://openknowledge.intranet.wjct.org/auth/callback
```

If the deployment uses a different hostname, port, or scheme, update the redirect URI accordingly.

If needed, the callback can be overridden with:

```bash
export GOOGLE_REDIRECT_URI="https://openknowledge.intranet.wjct.org/auth/callback"
```

## Running the gateway

Example intranet launch:

```bash
cd /path/to/open-knowledge

export GOOGLE_CLIENT_ID="<google-oauth-client-id>"
export GOOGLE_CLIENT_SECRET="<google-oauth-client-secret>"
export OK_WEB_SESSION_SECRET="<long-random-session-secret>"
export GOOGLE_WORKSPACE_DOMAIN="wjct.org"
export OK_WEB_PUBLIC_URL="https://openknowledge.intranet.wjct.org"

ok web \
  --host 0.0.0.0 \
  --port 39849 \
  --public-url "$OK_WEB_PUBLIC_URL"
```

For production use, run the command under a process manager such as systemd, Docker, or the platform's service supervisor.

## Health checks

The gateway exposes a health endpoint that does not require sign-in:

```text
GET /healthz
```

A healthy process returns HTTP `200` with a JSON body.

## Security notes

- Terminate TLS at the reverse proxy or load balancer for any non-local deployment.
- Keep `GOOGLE_CLIENT_SECRET` and `OK_WEB_SESSION_SECRET` out of source control.
- Use a strong random value for `OK_WEB_SESSION_SECRET`.
- Restrict the deployment at the network layer if the service is intended to be intranet-only.
- Keep the Google OAuth authorized redirect URI aligned with `OK_WEB_PUBLIC_URL`.
- Use `OK_WEB_EDITORS` when only a subset of Workspace users should be able to modify content.

## Verification

The gateway behavior is covered by tests in:

```text
packages/cli/src/commands/web.test.ts
```

Useful verification commands:

```bash
bun test --conditions development packages/cli/src/commands/web.test.ts
bun run check:fast
```
