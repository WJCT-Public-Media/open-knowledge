---
"@inkeep/open-knowledge": patch
---

Expose an explicit `extension` field on the MCP `write` tool's document target, so agents can reliably author `.mdx` (Markdown + JSX) docs instead of relying on an undocumented path suffix. The tool's `path` description previously said "no extension," contradicting the skill guidance and hiding a capability that already worked end to end. Precedence is `extension` field > `.md`/`.mdx` suffix in `path` > default `.md`; an existing doc keeps its on-disk extension. The supported-extension list is now single-sourced from one canonical constant shared by the HTTP schema, the MCP tool schema, and the on-disk path probes, so the accepted set can no longer drift between layers.
