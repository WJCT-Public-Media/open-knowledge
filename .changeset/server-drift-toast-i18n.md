---
"@inkeep/open-knowledge": patch
---

The desktop server version-drift and restart toasts now route their copy through the Lingui translation catalog instead of hardcoded English. This covers the version-mismatch body, the agent-disruption warning, the restart loading and success messages, the dev-session reclaim notice, and the branched restart-failure copy. English output is unchanged; these strings are now translatable alongside the rest of the editor UI.
