---
"@inkeep/open-knowledge-core": patch
---

fix(markdown): stop over-escaping phrasing-boundary whitespace character references

A space or tab at a phrasing boundary (the edge of a paragraph, list item, or blockquote's inline content) was serializing to a backslash-escaped character reference (`\&#x20;` / `\&#x9;`) instead of a bare `&#x20;` / `&#x9;`. Per CommonMark the escaped form renders as the literal visible text `&#x20;` in GitHub, the docs site, and Open Knowledge's own re-parsed editor. `escapeEntityAmpersands` now leaves character references that `mdast-util-to-markdown` synthesizes for boundary-whitespace preservation un-escaped, while continuing to escape user-authored entities.
