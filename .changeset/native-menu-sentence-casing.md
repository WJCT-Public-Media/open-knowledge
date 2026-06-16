---
"@inkeep/open-knowledge": patch
---

Use consistent sentence casing for the native desktop menu bar. File/View menu items like "New File", "New Folder", "Show Hidden Files", "Copy Path", "Expand All", "Create New Project…", "Switch Project…", and "Open Recent" are now sentence case ("New file", "New folder", "Show hidden files", "Copy path", "Expand all", "Create new project…", "Switch project…", "Open recent", etc.), matching the in-app menus. Proper nouns keep their capitalization (Finder, Terminal, AI), and menu titles (File/Edit/View/Window/Help) are unchanged.

The labels shared between the native menu and the in-app menus now come from a single `MENU_LABELS` constant in `@inkeep/open-knowledge-core`, with a test that keeps the renderer's translated strings in sync with it.
