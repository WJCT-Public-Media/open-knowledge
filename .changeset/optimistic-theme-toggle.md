---
"@inkeep/open-knowledge": patch
---

Make the appearance theme toggle in Settings → Preferences flip instantly. Clicking Light, Dark, or System now applies the new appearance optimistically on the client you clicked in, instead of waiting for the change to round-trip through the config write and re-render. The setting still saves to your user config and still propagates to other open projects and windows, and "System" keeps tracking your OS appearance live.
