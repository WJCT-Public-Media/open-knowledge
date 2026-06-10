---
"@inkeep/open-knowledge": patch
---

Cascade new editor windows instead of stacking them dead-center. Electron centers every window that has no explicit position, so opening several projects — most visibly the post-update relaunch, which restores every previously open project at once — produced one indistinguishable pile of windows. Each new editor window now opens offset down-right from the focused (or most recently opened) window, macOS-document-app style, wrapping back to the top-left of the work area when it would run off the screen edge. The first window of a session still opens centered.
