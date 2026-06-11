---
"@inkeep/open-knowledge-core": patch
---

fix: documents containing CommonMark lazy-continuation lines (an indented line continuing the paragraph above it) no longer rest in a permanent bridge-divergence state. `normalizeBridge` gained a `paragraph-continuation-indent` tolerance class that treats the parser's indent-stripping on paragraph continuation lines as a comparison-equivalence, ending the perpetual split-brain telemetry, fuzz stalls, and stale-witness block duplication this construct could trigger. Comparison-only — stored bytes are never rewritten.
