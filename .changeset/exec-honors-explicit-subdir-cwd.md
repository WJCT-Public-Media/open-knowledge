---
"@inkeep/open-knowledge-server": patch
---

The MCP `exec` tool now runs commands in the explicit `cwd` you pass, even when it points at a subdirectory of an OK project. Previously the resolver walked `cwd` up to the enclosing `.ok/config.yml` and ran bash from the project root, so a subdir-relative command like `cat notes.md` (cwd `<project>/subdir`) failed with a spurious "No such file or directory" and `structuredContent.cwd` reported the root instead of the directory you asked for — agents had to work around it with project-root-relative paths. The walk-up still resolves which project owns the call (config, server URL, lock, and enrichment stay project-anchored), but the execution directory is now the literal path passed. `structuredContent.cwd` reports where the command actually ran, and referenced-file enrichment resolves correctly regardless of which subdirectory bash ran in.
