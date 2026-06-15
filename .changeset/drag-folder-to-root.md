---
"@inkeep/open-knowledge": patch
---

Fix drag-and-drop so a nested folder can be moved back to the project root. Dragging a folder (or file) onto the empty space in the sidebar file tree now promotes it to the top level, with a highlight showing where it will land. Previously you could only drop items onto another folder, so there was no way to undo unwanted nesting by dragging.
