---
"@inkeep/open-knowledge": patch
---

When the desktop app can't reach a project's collab server, the "couldn't reach
server" banner now offers a **Restart server** button alongside Retry. Retry only
re-attempts the same server, which never succeeds once that server has stopped
(for example after an idle-shutdown); Restart spawns a fresh one so the window
recovers instead of retrying a server that will never answer.

Also routes the desktop keepalive's connect / disconnect / reconnect lifecycle
through the logs. That keepalive is what keeps a project's server alive while its
window is open — when it silently fails to hold the connection the server can
idle-shut-down with the window still open, and there was previously nothing in
the logs to explain why.
