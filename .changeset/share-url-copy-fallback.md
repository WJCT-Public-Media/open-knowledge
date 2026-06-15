---
"@inkeep/open-knowledge": patch
---

Make share-link copying work in embedded previews.

Clicking "Copy share link" inside an embedding host that blocks the modern
clipboard API (for example the Claude preview pane) now falls back to the
browser's legacy copy path instead of showing "couldn't copy" — the link lands
on your clipboard on the first click. When the embedding host blocks both
paths, the failure message now correctly explains the preview limitation.
