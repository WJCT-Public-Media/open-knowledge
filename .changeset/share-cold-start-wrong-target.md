---
"@inkeep/open-knowledge": patch
---

Clicking an Open Knowledge share link when the app was not already running no longer opens a previously-opened project instead of the shared doc or folder. On a cold start the boot path now recognizes a valid share deep-link as claiming the launch (the same way a single-file `ok <file>` open does) and suppresses the default window-restore, so the share flow opens the shared target — or the receive prompt — directly. Invalid or unsupported share links, and `screen` deep-links, still restore the previous window as before, since they need an existing window to surface their toast or navigation. Git preflight still runs for share launches.
