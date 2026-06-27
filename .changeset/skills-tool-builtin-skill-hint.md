---
"@inkeep/open-knowledge": patch
---

Stop two ways agents get derailed around the skill surface.

- The `skills` MCP tool now short-circuits OpenKnowledge's own built-in skills instead of 404-ing. An agent told to "load the open-knowledge skill" would call `skills({ name: "open-knowledge" })`, hit a bare `Skill not found.`, and fall back to cat-ing the bundled SKILL.md. The built-ins (`open-knowledge`, `open-knowledge-discovery`, `open-knowledge-write-skill`) are runtime agent skills projected into editor host dirs, never KB content skills, so a READ aimed at one now returns a teaching error explaining it is already in the agent's loaded skill list and is not fetched through this tool. User-authored `open-knowledge-pack-*` skills are unaffected, and the tool description states the boundary up front.

- The project SKILL.md escape hatch now tells agents that their initial tool list is not exhaustive: some clients (notably Codex) defer MCP tools behind a lazy `tool_search` step, so `mcp__open-knowledge__*` is absent until discovered. Absence from the visible list means "not discovered yet," not "not registered" — agents must run tool discovery before invoking the native-tools escape hatch.
