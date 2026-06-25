---
"@inkeep/open-knowledge-app": patch
---

Improve `[[` wiki-link ("@mention") autocomplete ranking to surface the most relevant link targets first. The page you're editing and its link-graph neighbors (incoming and outgoing links) are now boosted, so opening the picker leads with the pages you're most likely to link to; docs under skill/tooling folders (`.agents`, `.claude`, `.cursor`) are deprioritized as knowledge-base noise (deprioritized, not hidden — a skill still appears when it's the best match). Both the WYSIWYG and the source-mode `[[` pickers re-rank in lockstep. Ranking for the command palette, full-text, and MCP search is unchanged.
