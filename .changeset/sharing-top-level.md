---
"@inkeep/open-knowledge": patch
---

The "Share this setup with your team?" choice in both onboarding dialogs (Open-folder and Create-new-project) now sits at the top level as two side-by-side cards — Shared vs Local only — instead of being buried under "Advanced settings." The copy is shorter and plain-language; the technical detail (which files, git mechanics) stays in the info tooltip next to the question. Both dialogs render the same selector via a new shared `SharingModeField` component.
