---
"@inkeep/open-knowledge-app": patch
---

fix(open-knowledge): explain why a shared-repo clone failed instead of a vague toast

When opening a share link to a repository that can't be cloned (most often a
private repo the recipient's GitHub account can't access), the share-receive
dialog now shows a persistent in-dialog error view instead of a transient
"clone failed" toast that disappeared before it could be read. The view shows
the GitHub error condensed to its meaningful line (e.g. `Error: "Repository
not found."`), lists the likely causes (the repo is private and you lack
access, the repo was moved/renamed/deleted, or a network or GitHub
interruption), and keeps Try-again, "I already have it locally", and
Connect-GitHub recovery actions in view. The controller now hands the raw git
message back to the dialog rather than firing its own toast.
