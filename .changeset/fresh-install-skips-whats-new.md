---
"@inkeep/open-knowledge": patch
---

Skip the "Updated to Version ..." release-notes notice on a fresh install. A brand-new install has no prior version, so everything is new — popping release notes at first launch was noise. The first launch now silently records the installed version as the baseline; the notice fires only on a real version transition (the next update).
