---
"@inkeep/open-knowledge-app": patch
---

Fix the WYSIWYG `<Tabs>` strip showing phantom tab pills when a tab nests other components. A `<Tab>` containing a `<Steps>`, `<Callout>`, image, or nested `<Tabs>` used to add one extra empty pill per nested block — the quickstart's two install tabs rendered as eight pills, with the spurious pills revealing no panel. The strip now counts only the Tabs's own direct tab children, matching the CSS active-panel index space exactly.
