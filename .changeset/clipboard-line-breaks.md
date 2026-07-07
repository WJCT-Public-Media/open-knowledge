---
"@inkeep/open-knowledge": patch
---

Fix copying from the editor dropping line breaks when you paste into other apps.

Soft line breaks — the everyday single-newline wraps inside a paragraph,
blockquote, or list item — used to be copied as a bare newline whose rendering
relied on the editor's own styling. Gmail and other rich-text destinations strip
that styling, so the lines merged into one on paste. They now copy as real line
breaks that survive everywhere. Copying a partial selection that contained a
`<br>` line break used to fail silently and paste as raw markdown source
(pipes, dashes, and literal `<br>` text); those breaks now come through as
proper line breaks too.

Multi-line table cells also copy correctly to spreadsheets: a cell with an
in-cell line break is exported as a quoted field so Excel and Google Sheets keep
both lines in one cell instead of merging them or splitting the row.

Checked items in a task list now keep their checked state when copied, so a
ticked checkbox no longer pastes as unticked in apps that preserve checkboxes.
