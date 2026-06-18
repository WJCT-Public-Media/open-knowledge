---
"@inkeep/open-knowledge": patch
---

Make the image / video / audio upload affordance discoverable on the property
panel and consolidate alignment to one surface. Three changes:

- Collapse three alignment surfaces into one. Image / video / Embed /
  CommonMarkImage previously exposed alignment in the floating bubble menu,
  in the per-block chrome bar, AND in the PropPanel `Align` Select. The
  bubble menu (`ImageAlignButtons`) is the canonical surface; the chrome-bar
  trio and PropPanel Select are removed, and the `align` PropDef carries
  `hidden: true` so the prop still travels through the registry (MCP queries,
  descriptor docs, render path) without producing a redundant control. The
  rest of the cluster (PRD-7054 origin findings) follows:

- The upload control rendered as an icon-only square next to the URL input,
  which read as decoration; users skipped it entirely and fell back to
  URL-paste as the only "working" path. Replaced with a full-width labeled
  "Upload from computer" button that pairs the icon with explicit text — the
  visible label doubles as the assistive-tech accessible name, so the screen-
  reader contract stays intact without `aria-label`.
- The asset-autocomplete dropdown bound its width with the Tailwind v3
  implicit-`var()` shorthand `w-[--radix-popover-trigger-width]`. In Tailwind
  v4 that form emits literal `width: --radix-popover-trigger-width` — invalid
  CSS, silently ignored — so the suggestion list auto-sized to its longest
  asset path (~550px-wide) and overflowed the parent prop panel, swallowing
  the upload affordance in the visual chaos. Switched to v4's parenthesized
  form `w-(--radix-popover-trigger-width)`; a DOM-level regression test pins
  the syntax so a future revert fails CI instead of users.
