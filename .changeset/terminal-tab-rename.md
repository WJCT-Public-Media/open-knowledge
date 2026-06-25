---
"@inkeep/open-knowledge": patch
---

Terminal tabs now show the title the running program sets. Programs name the terminal through the standard `OSC 0` / `OSC 2` escape sequences (`ESC ] 0 ; <title> BEL`) — shells via `PROMPT_COMMAND`, `vim`, and the `claude` TUI all do this — and the docked terminal now picks that up and uses it as the tab label, the same way other terminals do. Each tab falls back to its positional `Terminal N` default until its program sets a title, reverts to that default if the program clears the title (e.g. on exit), and updates live as the title changes. This makes a strip of several shells (a few for a monorepo, a few Claude Code instances) navigable at a glance. Desktop only.
