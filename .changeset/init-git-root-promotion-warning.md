---
"@inkeep/open-knowledge": patch
---

fix(open-knowledge): make `ok init` git-root promotion visible + add `--content-dir`

When `ok init` runs in a sub-folder of a git repo, it scaffolds `.ok/` at the
git root and scopes the whole repo as content (one `.ok/` per git repo). That
promotion previously surfaced only as a single `console.log` line on stdout,
which `ok init 2>&1 | tail` / `| head` silently dropped — so a large repo could
get whole-repo-scoped without the user noticing.

- The promotion is now disclosed as a styled warning on stderr at decision
  time, and repeated in the init summary directly next to the "Found N markdown
  files" preview, naming the sub-folder and how to narrow scope.
- New `ok init --content-dir <path>` flag scopes content to `<path>` (resolved
  relative to the current directory, written to `.ok/config.yml` as
  `content.dir`). `--content-dir .` from a promoted sub-folder scopes the
  project to that folder. Paths outside the project root, missing paths, or
  files are rejected with a clear usage error (exit 64). Supplying the flag
  suppresses the whole-repo promotion warning (the scope choice was explicit).
- New `ok init --json` flag prints a machine-readable summary to stdout
  (`projectRoot`, `gitRootPromoted`, `promotedFromDir`, `contentDir`,
  `contentDirRequested`, `contentDirApplied`, `contentFileCount`, `didGitInit`,
  `mcpAction`, `editors[]`) so scripts and agents read the promotion + scope
  signals as fields instead of scraping log text. Diagnostics stay on stderr;
  stdout carries only the JSON document.

Behavior of the promotion itself is unchanged.
