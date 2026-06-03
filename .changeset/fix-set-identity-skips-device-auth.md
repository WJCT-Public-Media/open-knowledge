---
"@inkeep/open-knowledge": patch
"@inkeep/open-knowledge-core": patch
"@inkeep/open-knowledge-server": patch
"@inkeep/open-knowledge-app": patch
"@inkeep/open-knowledge-desktop": patch
---

Fix the sync popover's "Set identity" button forcing a re-authentication. The auth modal now probes sign-in status on open: an already-signed-in user is taken straight to the git Name/Email fields (pre-filled from their GitHub profile) instead of through the GitHub device flow. It only falls back to sign-in when the user is genuinely not authenticated, and then still lands on the identity fields so the git identity actually gets set.
