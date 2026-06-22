---
"@inkeep/open-knowledge": patch
---

Fix docked-terminal behavior in OK Desktop and add Shift+Enter newline support.

- **The docked terminal is available in every view and survives navigation.** It now opens from folder, asset, and large-file views (previously it only mounted on the document editor and empty state, so "Open with AI → Claude" or ⌘J did nothing there). A single terminal is docked in the editor column — beside the doc/properties panel, which keeps its full height — and the session stays alive across tab switches, view-kind changes, and tab closes, instead of resetting each time.
- **The terminal can be resized much taller.** Drag it up to 95% of the dock height for long CLI sessions (it was capped at 50%).
- **Shift+Tab stays in the terminal.** It previously moved focus out of the terminal instead of reaching the running CLI (e.g. the Claude TUI's mode toggle); the keystroke now reaches the PTY.
- **Shift+Enter inserts a newline** instead of submitting, matching how Ghostty and Cursor map the chord.
