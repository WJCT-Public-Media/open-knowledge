---
"@inkeep/open-knowledge": patch
---

Fix the update "Relaunch" notice so it propagates to every open window. Previously, clicking "Relaunch" on the "Version X ready to install" banner swapped only that one window to "Relaunching to install the update…"; any other open windows kept showing the stale, still-clickable "ready to install" banner for the several seconds it takes to tear down each project's server before the app quits and reinstalls. Now the relaunch fans out to all windows the instant it commits in the main process, so every window swaps to the in-progress "Relaunching…" card in lockstep and the Relaunch button can't be fired a second time from another window.
