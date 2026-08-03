---
"@barefootjs/blade": patch
"@barefootjs/erb": patch
"@barefootjs/go-template": patch
"@barefootjs/jinja": patch
"@barefootjs/mojolicious": patch
"@barefootjs/rust": patch
"@barefootjs/twig": patch
"@barefootjs/xslate": patch
---

Re-point render-divergence citations from the now-closed #2460 to its open per-adapter trackers (#2524/#2525)

No behavior change — this only updates `renderDivergences` reason strings
(published to `ui/compat.lock.json` and the docs compatibility matrix). The
shared-layer defect these entries originally cited (#2460, an aliased
destructured prop `{ n: count }` losing its rename) is now FIXED
(b4f5075) for the shared compiler layer and the Hono reference adapter.
The `aliased-destructured-prop` / `composite-row-child-aliased-prop`
divergences remain live per-adapter:

- The 7 template-string adapters (`blade`, `erb`, `jinja`, `mojolicious`,
  `rust`/minijinja, `twig`, `xslate`) still silently drop the rename in
  their emitted templates — tracked by #2524.
- `go-template`'s generated Go fails `go run` outright (unknown Input
  struct field) — tracked by #2525.

Each entry's docstring is rewritten to stop claiming Hono still emits the
broken form (it doesn't) and to point at the correct open tracker.
