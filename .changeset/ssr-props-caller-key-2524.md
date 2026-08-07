---
"@barefootjs/jsx": patch
"@barefootjs/blade": patch
"@barefootjs/erb": patch
"@barefootjs/jinja": patch
"@barefootjs/mojolicious": patch
"@barefootjs/rust": patch
"@barefootjs/twig": patch
"@barefootjs/xslate": patch
"@barefootjs/php": patch
"@barefootjs/cli": patch
---

Template-adapter SSR seeding now honors an aliased destructured prop's caller-facing key (#2524 SSR half)

A renaming destructure (`{ n: count }`) keys template variables by the LOCAL
binding (`count`, correctly — the template body reads `count`) but the
caller only ever supplies the CALLER-facing name (`n`). `extractSsrDefaults`
already emitted that mapping as `SsrDefault.propName`
(`{"count":{"propName":"n","value":null}}`), but nothing consumed it: every
template-string adapter's conformance harness (and 3 shipped production
sites) either discarded `propName` outright or keyed its seeding loop off
the local name, so a renamed prop's caller value was silently dropped and
the slot rendered its static default (`null`/`undefined`/`0`) instead.

- New shared helper `deriveStashFromDefaults` (`@barefootjs/jsx`) — the TS
  twin of the runtime `derive_vars_from_defaults` /
  `_derive_stash_from_defaults` family that already ships in the Ruby,
  Python, PHP, Perl, and Rust runtime ports. For each defaults entry, prefers
  `props[propName]` when the caller supplied a non-nullish value, else the
  static fallback; `isRestProps` entries pass the caller's assembled rest bag
  through; propName-less entries (signal/memo locals) always use the static
  value.
- All 7 template-string adapters' conformance harnesses (blade, erb, jinja,
  mojolicious, rust/minijinja, twig, xslate) now derive both root-level and
  child-component seeding through this helper (or the matching PRODUCTION
  runtime function, when the harness already drives one) instead of
  hand-flattening `SsrDefault.value`. Child-defaults seeding now carries the
  FULL `{value, propName?, isRestProps?}` shape into the generated render
  script/payload and resolves it per-call against the real caller props, the
  same way `@barefootjs/erb`'s harness already did.
- Rest-bag "keep" sets (which caller-supplied keys are declared params vs.
  undeclared extras routed into `...rest`) now key off `sourceName ?? name`
  (the caller-facing spelling) instead of the local binding.
- Three shipped PRODUCTION sites had the same defect class and are fixed
  too: `@barefootjs/rust`'s runtime (`register_components_from_manifest`
  used to flatten `ssrDefaults` with an EMPTY props document at
  registration time, before any caller was known — resolution now happens
  per-call, inside `render_child`, against the real caller props);
  `@barefootjs/mojolicious`'s plugin (`before_render` hook's top-level
  stash seeding); and `@barefootjs/cli`'s Text::Xslate scaffold
  (`app.psgi`'s `ssr_defaults`/`render_component` helpers). All three now
  route through the corresponding runtime's `derive_stash_from_defaults` /
  `_derive_stash_from_defaults`.
- `Barefoot\BarefootJS::deriveStashFromDefaults` (`@barefootjs/php`) is now
  `public` (was `private`) so the blade/twig conformance harnesses — and any
  caller composing a render by hand, mirroring the Ruby port's own public
  `derive_vars_from_defaults` — can route through the real production logic
  instead of re-deriving it.

`sourceName ?? name` is an identity for every un-aliased prop, so the rename
visibility fix itself has no effect on the non-aliased corpus. The merge
ORDER flip that makes `propName` resolution possible (defaults-derived
`extra` now applies LAST, over the caller's raw props, instead of first)
does have two deliberate, narrower behavior changes even for non-aliased
props — both intentional alignments with the semantics every other runtime
port (`derive_vars_from_defaults` / `_derive_stash_from_defaults` /
`derive_stash_from_defaults`) already had, not regressions introduced here:

- A caller prop passed as explicit `null`/`undefined` now loses to the
  static default, instead of the explicit nullish value winning. This
  matches `deriveStashFromDefaults`'s (and every runtime port's)
  "present and non-nullish" check on `props[propName]` — a flat
  `{...defaults, ...callerProps}` merge can't express that distinction (any
  own key wins, nullish or not); routing through the shared helper can.
- A caller prop whose name collides with a `propName`-less entry (a
  signal/memo local, e.g. a prop happens to be named the same as an
  internal signal getter) now loses to the signal/memo's static value
  instead of overriding it — `propName`-less entries are, by construction,
  never sourced from `props` in any port; a flat merge accidentally let a
  same-named caller prop shadow one anyway.

Both changes only bite an existing caller relying on one of these two
narrow, previously-inconsistent-with-every-other-port behaviors; the common
case (a caller prop with a concrete, non-nullish value and no name
collision with an internal signal/memo) is unaffected. Graduates the
`aliased-destructured-prop` / `composite-row-child-aliased-prop`
render-divergence pins for all 7 adapters (erb graduates
`aliased-destructured-prop` only — its child-seeding path was already
correct). Go's `go run` exit-1 failure (#2525) is untouched by this change
and stays pinned.
