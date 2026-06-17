---
"@inkeep/open-knowledge": patch
---

Both onboarding dialogs now lead with their primary action and tuck configuration behind an "Advanced settings" section. The Open-folder dialog reads as a confirmation screen, with content directory, ignore patterns, AI-tool connections, and config sharing collapsed under Advanced settings. Create-new-project keeps the Location field front and center and collapses the AI-tool and sharing controls; its Create button now stays enabled even before a folder is picked and shows a "Please select a folder" toast on click instead of sitting disabled with no explanation. The config-sharing copy across both dialogs and Settings is rewritten in plain language — what gets shared with your team versus kept on your computer — instead of listing config filenames and CLI commands.
