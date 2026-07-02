---
'@inkeep/open-knowledge': patch
---

Keep the toast stack below an open modal dialog or sheet. The previous toast fix made toasts clickable while a modal Radix layer is open, but sonner's toaster renders above the dialog, so a toast overlapping the modal (like the first-launch "Added ok to your PATH" notice over the MCP consent dialog) intercepted clicks aimed at the modal's own buttons. While a Dialog or Sheet overlay is mounted the toaster now sits under the overlay: the modal stays fully clickable, the toast shows dimmed without pretending to be interactive, and it becomes clickable again as soon as the modal closes.
