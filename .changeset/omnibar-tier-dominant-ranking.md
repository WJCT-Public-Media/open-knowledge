---
"@inkeep/open-knowledge": patch
---

Rank the Cmd+K omnibar name-first. An exact filename match now leads the results even when many files share that basename and have stronger body-text scores — the file you typed is no longer buried below same-named siblings or pushed past the fetch limit. The omnibar still searches content, but a strong content match only reorders within a name-match tier rather than outranking the name itself; the deliberate "by meaning" search keeps content-relevance ranking. A query that matches many folders or name-only files (`evidence`, `index`) no longer fills the whole list with one kind — folders and files are bounded so content pages fill the rest.
