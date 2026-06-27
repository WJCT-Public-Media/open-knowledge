---
"@inkeep/open-knowledge": patch
---

Desktop: add an opt-in path to fetch updates through the openknowledge.ai proxy so updates can be counted per version. When the build's channel is enabled, electron-updater's feed is pointed at `openknowledge.ai/updates/{channel}` and requests are tagged with `x-ok-from-version` / `x-ok-channel` headers. Default-off — production keeps reading the GitHub `publish:` config until the proxy is verified live, then the enabled-channel set flips to beta-first. A feed failure on the first check reverts to the GitHub provider for the session, so auto-update reliability never drops below GitHub-direct.
