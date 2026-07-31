---
"@barefootjs/router": minor
---

Reconcile `<head>` page metadata across a soft navigation

A swap used to write `document.title` and nothing else in `<head>` — and only
because the route announcement reads it. So a soft navigation left the previous
route's `<meta name="description">`, `og:`/`twitter:` cards, and
`<link rel="canonical">` in place: wrongness you cannot see in development,
unlike the tab title.

A swap now brings a **closed allowlist** of page metadata in line with the
incoming document. It always runs — there is no flag to disable it. Present in
both → replaced
(skipped when the nodes are already equal, so metadata shared across routes
causes no DOM churn); only incoming → added; only current → removed, so nothing
leaks forward into later routes.

| head node | key |
| --- | --- |
| `<meta name="description \| keywords \| robots \| author \| theme-color">` | `name` |
| `<meta property="og:*">` / `<meta name="twitter:*">` | `name` or `property` |
| `<link rel="canonical \| alternate \| prev \| next">` | `rel` + `hreflang`/`type`/`media` |

Anything outside that table is never read, replaced, or removed — runtime-
injected analytics tags, CSP `<meta http-equiv>`, `<link rel=preconnect>`, and a
multi-token `rel="alternate stylesheet"` are all safe by construction. Opt a
node out with `data-bf-head="false"`.

Head **resources** (`<link rel="stylesheet">`, `<script>`, `<style>`) remain
untouched: a resource's lifetime isn't derivable from the incoming document, so
route-scoped CSS belongs inside the region, where it enters and leaves with the
swap.
