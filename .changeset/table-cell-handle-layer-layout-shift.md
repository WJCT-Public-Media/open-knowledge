---
"@inkeep/open-knowledge": patch
---

Fixed: placing the cursor in a table cell no longer pushes the whole document down. The invisible positioning layer for the table's column/row handle pills (`ok-table-cell-handle-layer`) claimed its own row in the editor's layout grid, and on documents shorter than the window that empty row was stretched to an equal share of the leftover height — a blank band appeared above the document whenever a table was focused. The layer is now pinned into the content's own grid row at zero height, so the handle pills render in exactly the same place with no layout shift.

For maintainers — mechanism: `.tiptap-editor` is a CSS grid with implicit auto rows, and the default `align-content: stretch` distributes leftover block-size equally across in-flow auto tracks; any zero-height direct child still generates a stretchable track. The layer now carries `grid-row: 1; align-self: start`, and `.tiptap-editor-portal-content` declares `grid-row: 1` explicitly so auto-placement doesn't bump the editor body to row 2.
