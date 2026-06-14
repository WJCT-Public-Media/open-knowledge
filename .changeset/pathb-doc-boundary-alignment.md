---
"@inkeep/open-knowledge": patch
---

Editing near the top of a frontmatter document can no longer duplicate the first paragraph or silently delete the blank line after the frontmatter. When a WYSIWYG edit raced an unabsorbed source-mode edit, the server's three-way merge received inputs from two different byte-spaces — the editor-derived input structurally lacks the blank line between the frontmatter close fence and the body — so the line-based merge misread the user's edited first paragraph as replacing that blank line and resurrected a second copy of it, deleted the blank line from the document, and could double a trailing-whitespace keystroke on the close fence. All three merge inputs are now projected into one doc-boundary byte-space before merging, and the document's own boundary bytes are re-attached to the result verbatim — blank lines you typed (or deleted) after the frontmatter survive merges byte-exactly.
