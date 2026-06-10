---
"@inkeep/open-knowledge-core": minor
"@inkeep/open-knowledge-server": minor
---

feat(markdown): end-to-end byte fidelity — markdown round-trips byte-exact, agents' untouched bytes survive concurrent edits

The markdown engine no longer canonicalizes source formatting on the WYSIWYG/cross-surface edit path. Every producer-fixable byte-residual axis now round-trips byte-exact through `serialize(parse(x))`: table outer pipes, delimiter-row dashes and alignment padding, ordered-list numbering (`1. 1. 1.` stays), list marker spacing and continuation indents, fence length and info-string padding, strikethrough delimiter (`~` vs `~~`), task-checkbox case, wiki-link inner padding, opaque-extension embeds (`![[notes.foo]]` no longer downcasts to a plain link), inline math (`$x$` stays `$x$` instead of rewriting to `$$x$$`, with currency safety preserved), doc-start `---` thematic breaks (no longer rewritten to `***`, and a doc-start `---` no longer corrupts adjacent blocks), BOM, leading/trailing blank lines, inter-block blank-line counts, and tab-indented code. One visible consequence: a literal frontmatter-shaped block (`---`/`key: val`/`---`) ingested directly into the parse engine now renders as visible markdown (thematic break + setext heading) instead of being silently dropped.

Silent data-loss fixes: boundary-whitespace emphasis (`<em>foo </em>`) now serializes to a re-parseable form instead of degrading to plain text; entity references in a fenced-code info string survive instead of being stripped; `[link](</my uri>)` parses as a link instead of literal text; inline code containing `|` inside a table cell keeps its escape instead of corrupting the table. The serializer also stops escaping bare `*`/`_`/`~` and line-start `=` where CommonMark does not require it.

Agent find-fidelity (PRD-6654): a concurrent human WYSIWYG edit no longer rewrites an agent's untouched blocks in `Y.Text` — the map-driven Observer A splice is now the default path and a parse-equivalent `row-no-trailing-pipe` divergence no longer forces a canonicalizing write-back — so exact-match find-and-replace on previously written content keeps succeeding.

Clipboard/export rendering: `img`/`video`/`audio` compat components render as real HTML elements instead of placeholders, and entity references and `<>` destinations in link/image URLs and titles decode correctly (with URL sanitization preserved).
