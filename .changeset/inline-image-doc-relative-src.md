---
"@inkeep/open-knowledge-app": patch
---

Fix inline markdown images with a doc-relative path (`![](./assets/x.jpg)` mid-prose) resolving against the SPA root instead of the document's folder. The inline image node-view now applies the same doc-folder base resolution the block image render path already uses, so a relative `src` no longer 404s until a hard reload.
