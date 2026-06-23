---
"@inkeep/open-knowledge": patch
---

Fix the docked terminal resetting when you close a file or switch to a not-yet-loaded tab. Navigating to a doc whose provider was still loading transiently rendered a full-screen load skeleton outside the persistent editor column, which unmounted the terminal dock and killed the running shell. The skeleton now renders inside the persistent left column on mid-session navigation, so the terminal PTY and scrollback survive tab closes and switches (the cold-start load path is unchanged).
