---
"@inkeep/open-knowledge": patch
---

Fix the FILES sidebar showing "Documents response did not match expected shape." when a documents refresh is superseded during a long initial load of a large project. A refresh aborted mid-response now propagates as a cancellation instead of being mistaken for a malformed server payload, so the sidebar keeps its loading state (or the previous tree) until a completed refresh arrives.
