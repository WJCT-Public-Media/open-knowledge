---
"@inkeep/open-knowledge": patch
---

Fix the "Download manually" link in OK Desktop's update notices. When an update fails to install (the "Update to X didn't install" card) or the app detects it hasn't received updates in a while, the manual-download link now points at the GitHub Releases page (https://github.com/inkeep/open-knowledge/releases) where the signed DMGs actually live, instead of a marketing URL that returned a 404.
