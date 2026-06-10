---
"@inkeep/open-knowledge": patch
---

Fix stale-editor content resurrection (PRD-6955b). An editor whose Y→PM apply path had stopped (a "wedged" collaboration binding) could silently re-publish its frozen, minutes-old copy of a document wholesale over newer collaborative state on the next click or keystroke — erasing remote fixes. A new client-side binding staleness guard now detects the wedge the moment an external update goes unapplied, refuses to publish the stale replica (both the transaction channel and the binding's write-back seam are gated), and transparently recycles the editor so it remounts from current document state. Healthy editors are unaffected; recovery is rate-capped per document to prevent recycle loops under a persistent fault.
