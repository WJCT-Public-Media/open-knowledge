---
"@inkeep/open-knowledge-desktop": patch
"@inkeep/open-knowledge-core": patch
"@inkeep/open-knowledge": patch
---

feat(desktop): dev sessions auto-reclaim a stale foreign server (dev-only)

When a desktop dev session (`electron-vite dev` / `bun run dev` — `!app.isPackaged`)
opens a project whose contentDir already has a live Open Knowledge server it did
not spawn — a leftover from a prior packaged-app run, a `ok start` CLI, or another
instance — it previously **attached** to that server. Devs then ran their editor
against a stale server + core build instead of their working tree, with no signal
anything was wrong.

The dev attach path now **terminates that foreign server and spawns a fresh
own-build server in its place** (reusing the same SIGTERM → grace → SIGKILL ladder
as the user-initiated restart, then falling through the existing `runClean` + spawn
path). It is gated strictly to dev: packaged builds still attach to a live server,
which is the intended shared-server behavior. A server this session spawned itself
is never reclaimed (pid guard), and if termination fails (e.g. EPERM, cross-user
server) the session falls back to attaching rather than leaving the project
window-less.

Because no user action initiated the teardown, the freshly-spawned window surfaces
an **act-then-inform** notice (new `ok:server-reclaimed` bridge event) naming the
side effect: connected agents (Claude Code, Codex, Cursor) just lost their Open
Knowledge MCP connection and should restart the agent — or toggle its Open
Knowledge MCP server off and on — to reconnect.

No effect on published/packaged behavior.
