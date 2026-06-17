---
"@inkeep/open-knowledge": patch
---

Fix horizontal scrolling in the project switcher's recent-projects menu. Long project names and paths now truncate with an ellipsis inside the dropdown instead of forcing the menu wider than its container and introducing a horizontal scrollbar. The recents list clips overflow on the x-axis, and each row shrinks to the menu width so both the name and the path ellipsize cleanly.
