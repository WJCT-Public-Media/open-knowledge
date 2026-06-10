---
"@inkeep/open-knowledge": patch
---

Fix silent loss of unchanged content after a document editor opens. The editor's pre-warm fast path built its node cache against a throwaway internal schema instance; because the editor matches content by schema-instance identity, the first incremental collaborative or agent edit after opening could silently drop unchanged sibling paragraphs from the visible editor, and the next click or keystroke could republish that truncated copy over the shared document — erasing the content for every peer and on disk. The pre-warm walk now runs during editor construction against the editor's own schema, so cached nodes always match and unchanged content survives incremental updates.
