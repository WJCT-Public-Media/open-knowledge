---
"@inkeep/open-knowledge": patch
---

Desktop: launching an agent CLI from the docked terminal ("Open in Claude/Codex/Cursor/OpenCode") no longer pollutes your shell history. The launch command used to be typed into an interactive shell, so every launch — prompt and all — was recorded in `~/.zsh_history`, cluttering `↑`/`Ctrl-R` and writing document content in plaintext outside `.ok/`. The launch is now baked into the tab's shell spawn (`$SHELL -l -i -c '<cmd>; exec $SHELL -l -i'`): the command runs without going through the line editor (so it is never recorded), PATH is unchanged (the same login-interactive shell is used), and the tab drops into a fresh interactive shell when the agent exits — so your own later commands still record normally. Applies to all four CLIs.
