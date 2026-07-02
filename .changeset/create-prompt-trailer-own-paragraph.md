---
"@inkeep/open-knowledge": patch
---

The create composer's "Open the OK editor in web view." directive now rides
its own paragraph. It was appended to the last line of the prompt body, which
glued it onto the final line of your blockquoted brief (or the last
`@`-mention), so it read as part of your own quoted words — effectively
invisible as an instruction to the receiving agent. Bare create prompts (no
brief, no mentions) keep the same single-line shape as the other handoff
prompts, and turning `appearance.preview.autoOpen` off still drops the
directive entirely.
