---
"@inkeep/open-knowledge-core": patch
"@inkeep/open-knowledge-server": patch
---

fix: `OK_BRIDGE_TOLERANCE_TELEMETRY=1` now produces output — the tolerance-telemetry writer is wired into server boot (it was previously documented but never initialized), and writes through a rotating sink (~16 MB cap) instead of an unbounded append. The JSONL receives the full un-rate-limited fire stream (bounded on disk by rotation) so aggregate counts reflect real fire frequency; the console event and metric counter stay rate-limited per (site, class). Bridge drains on large documents also got cheaper: the residual-merge classification now runs its full-document normalize passes only on the drains where the classification can matter.
