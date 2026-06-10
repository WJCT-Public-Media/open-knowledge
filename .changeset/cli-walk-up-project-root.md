---
"@inkeep/open-knowledge": minor
---

Lifecycle commands (`ok start`, `stop`, `status`, `clean`, `ui`, `mcp`, `preview`, and bare `ok`) now work from any subdirectory of an initialized project. The CLI walks up to the nearest enclosing `.ok/config.yml` — the same resolution the MCP server uses, so both always agree on which project (and which `server.lock`) a directory belongs to — and boots with that root's config instead of failing with "This directory isn't set up yet." When the resolved root differs from your current directory, the CLI prints `[ok] Using Open Knowledge project at <root>` so the project scope is always visible. Nested projects compose: the walk stops at the closest ancestor, so a subtree you've separately run `ok init` in keeps its own root. Directories with no enclosing project still get the "run `ok init` first" message, and scaffolding commands (`ok init`, `seed`, `clone`) keep their existing current-directory semantics.
