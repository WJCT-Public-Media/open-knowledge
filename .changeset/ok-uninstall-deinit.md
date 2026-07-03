---
"@inkeep/open-knowledge": minor
---

Add `ok uninstall` and `ok deinit` — one command each to reverse OpenKnowledge's footprint.

`ok uninstall` removes OpenKnowledge from your whole machine: it stops running servers, clears credentials (the GitHub keychain token, `auth.yml`, and the embeddings key), reverts the PATH shim (strips the managed block from your shell rc files and removes the recorded `~/.ok/bin` symlinks), surgically removes only OpenKnowledge's own entry from each editor's MCP config (keeping your other servers, comments, and formatting), tears down the installed skill bundles, deletes the app-data directories, and finally removes `~/.ok`. It offers to also clean recent projects, and detects how the app was installed to print the exact removal command — it never deletes its own binary. Your markdown content and your authored skills (`~/.ok/skills`) are kept unless you pass `--purge-content`.

`ok deinit` removes OpenKnowledge from a single project — its `.ok/`, editor MCP entries, `.claude/launch.json` entry, `.git/info/exclude` lines, and shadow repo — while leaving your markdown untouched, so re-running `ok start` re-scaffolds cleanly.

Both commands are safe by default: a `--dry-run` preview, a confirmation that defaults to **No**, `--json` output, and surgical edits that never clobber your non-OpenKnowledge config.
