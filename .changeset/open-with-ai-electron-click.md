---
"@inkeep/open-knowledge": patch
"@inkeep/open-knowledge-core": patch
"@inkeep/open-knowledge-server": patch
"@inkeep/open-knowledge-app": patch
"@inkeep/open-knowledge-desktop": patch
---

Fix the editor toolbar's "Open with AI" menu not opening in the macOS desktop app. The header sits in a macOS title-bar drag region (`-webkit-app-region: drag`), and macOS swallows the `pointerdown` event on its children — even on the `no-drag` button — before the DOM sees it. Radix's dropdown opens on `pointerdown`, so clicking the button did nothing. The synthesized `click` still fires, so on the desktop host the menu now opens from the click instead. Browsers (`ok ui`) are unaffected and keep Radix's default behavior. This regressed when the button's redundant hover tooltip was removed, which had incidentally kept pointer events flowing to the trigger.
