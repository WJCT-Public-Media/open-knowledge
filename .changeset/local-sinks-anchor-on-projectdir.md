---
"@inkeep/open-knowledge-server": patch
"@inkeep/open-knowledge": patch
---

Fix the log and telemetry file-sinks writing into a second `.ok/` when `content.dir` is a sub-folder. Both per-machine sinks (`.ok/local/logs/server-current.jsonl`, `.ok/local/telemetry/spans-current.jsonl`) now anchor on the project root like `server.lock` / `principal.json` / `state.json`, so a project with e.g. `content.dir: docs` keeps a single `.ok/` at the root instead of growing a second one buried inside the content sub-folder where backups, git, sync, and visual inspection wouldn't expect it. `ok diagnose bundle` reads the sinks and `server.lock` from the same project-root-anchored `.ok/local/` so it keeps harvesting them after the move.
