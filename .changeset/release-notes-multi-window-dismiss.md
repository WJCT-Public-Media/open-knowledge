---
"@inkeep/open-knowledge-desktop": patch
---

feat(ok-desktop): show the release-notes update notice on every open project window

The "Updated to Version X" release-notes notice previously appeared on only one project window when several projects were open together, so a user looking at a different project never saw it. It now appears on every open window, and the "Relaunch now" update banner does too.

Dismissing the release-notes notice on one window (or letting it auto-expire after its one-minute window) now clears it on all of them, so the same FYI no longer needs swatting once per window. A project opened shortly after an update, while the notice is still live, also shows it.

When both a "new version ready to install" banner and the release-notes notice are armed at once, the single-card behavior is unchanged: the relaunch banner takes precedence and the release-notes notice waits behind it.
