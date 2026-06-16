---
"@inkeep/open-knowledge-desktop": patch
---

Desktop auto-update and app-quit events are now recorded in the diagnostic logs (`~/.ok/logs/desktop.<date>.log`). Previously the auto-updater logged only to the console — which packaged builds don't persist — and its async log buffer was lost when the process was killed for an update swap, so an unexpected restart left no trace of whether it came from the "Relaunch now" prompt, an install-on-quit, or a crash. The updater now writes through the file logger; `before-quit`, `before-quit-for-update`, and `will-quit` are logged; and the buffer is flushed to disk before the process exits.
