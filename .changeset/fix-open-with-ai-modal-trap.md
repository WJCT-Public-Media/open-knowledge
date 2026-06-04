---
"@inkeep/open-knowledge": patch
"@inkeep/open-knowledge-core": patch
"@inkeep/open-knowledge-server": patch
"@inkeep/open-knowledge-app": patch
"@inkeep/open-knowledge-desktop": patch
---

Fix the editor toolbar's "Open with AI" menu freezing the rest of the app in the macOS desktop app. Once the menu became openable on the desktop host, its default modal behavior disabled pointer events on everything outside the menu while it was open. Because the menu lives in the macOS title-bar drag region — where the outside-click that normally dismisses a modal doesn't reliably reach the menu — the only way to close it was to pick an agent, and meanwhile the rest of the chrome (notably the bottom-left project switcher) couldn't be clicked. The menu is now non-modal: opening it no longer blocks the rest of the UI, and clicking anywhere outside dismisses it. Browsers (`ok ui`) are unaffected.
