# @barefootjs/perl

## 0.13.0

## 0.12.0

## 0.11.0

## 0.10.1

## 0.10.0

## 0.9.6

## 0.9.5

## 0.9.4

## 0.9.3

### Patch Changes

- 03c7a3c: Propagate SSR context (`<Ctx.Provider value>` → `useContext`) on the Mojolicious and Text::Xslate adapters, graduating the `context-provider` conformance fixture to Hono parity.

  Both adapters previously emitted a child template that read an un-seeded consumer variable (`$theme`), so the provider value never reached the descendant — the fixture was skipped (Go already implemented this in #1768; the Perl side was a deferred follow-up).

  The Perl runtime now mirrors the client `provideContext` / `useContext`:

  - `BarefootJS.pm` gains `provide_context` / `revoke_context` / `use_context`, backed by a package-level value stack. SSR rendering is synchronous and the provider's push/pop are perfectly balanced, so the stack always unwinds at the end of each provider subtree — and a package global (rather than `$c->stash` or the backend) is the one store reliably shared between a parent template and the child templates it renders via `render_child` (the Xslate backend runs with `c => undef`; the Mojo path lazily builds a backend per instance).
  - **Mojo**: `emitProvider` brackets the children with `<% bf->provide_context('Ctx', <value>); %>` … `<% bf->revoke_context('Ctx'); %>`, and each `useContext` consumer is seeded with `% my $x = bf->use_context('Ctx', <default>);`.
  - **Xslate**: same, using the inline `<: $bf.provide_context(...) :>` / `<: $bf.revoke_context(...) :>` form (both return `''`, so the interpolation emits nothing) and a `: my $x = $bf.use_context('Ctx', <default>);` line-statement seed.

  Verified end-to-end against real Mojolicious and Text::Xslate. Hono reference snapshots unchanged.

- 42e0ed9: Graduate the `toggle-shared` conformance fixture to Hono parity on the Mojolicious and Text::Xslate adapters — a keyed `.map` of sibling `ToggleItem` children, each with a per-item prop-derived signal. Three gaps were closed (#1297):

  1. **Prop-derived signal SSR seeding.** A signal whose init derives from a prop (`createSignal(props.defaultOn ?? false)`) is now seeded in-template from the passed prop (`% my $on = ($defaultOn // 0);` / `: my $on = ($defaultOn // 0);`), so a loop child honours its own per-item prop instead of the static default. The lowering is gated by `isSupported` (object/array/constant inits never reach `convertExpression*`, so they don't record a spurious BF101 and keep their existing ssr-defaults seeding) and skipped on Text::Xslate for a same-name signal (Kolon can't express `: my $x = … $x …`; those stay on the harness/manifest seeding, which already resolves them from the prop).

  2. **Loop-child scope id.** A loop child now gets a fresh `<ComponentName>_<rand>` scope id (the PascalCase component name) instead of a parent-slot id, matching the Hono reference (`normalizeHTML` canonicalises `<ComponentName>_<rand>` → `<ComponentName>_*`).

  3. **`data-key`.** The JSX `key` (a reserved prop) now lands as `data-key="…"` on the child scope root, for keyed-loop reconciliation parity. `BarefootJS.pm` gains a `_data_key` field + `data_key_attr` helper; `render_child` sets it from the `key` prop; the component root emits it (`bf->data_key_attr` / `$bf.data_key_attr()`), so non-keyed renders add nothing.

  Note: prop-derived signals/memos are now computed in-template from the props they derive from, so a host seeds the _prop_ (e.g. `initial`) rather than the signal value directly. Verified end-to-end against real Mojolicious and Text::Xslate. Hono reference snapshots unchanged.

## 0.9.2

## 0.9.1

## 0.9.0

### Minor Changes

- 848896b: Add `runAdapterConformanceTests` for the Text::Xslate adapter (with a
  `renderXslateComponent` test renderer), validated against the same shared
  fixture corpus as mojo.

  Make the adapter's runtime-helper calls consistent: every JS-semantics-sensitive
  value operation goes through a `$bf` method, so the runtime's JS-compat handling
  is always applied (rather than a raw Kolon builtin). `.filter` / `.every` /
  `.some` / `.find` / `.findIndex` / `.findLast` / `.findLastIndex`,
  `.toLowerCase` / `.toUpperCase`, `.join`, and `.length` lower to the
  corresponding `$bf` methods — new methods
  on the `BarefootJS` runtime in `@barefootjs/perl`. This also fixes a latent bug:
  `.length` previously used Kolon's array-only `.size()`, which faults on a string;
  `$bf.length` handles both arrays (element count) and strings (char count).

  The skip list is verified, not inherited: the six fixtures mojo skips for
  Perl-EP scoping faults (`logical-or-jsx`, `nullish-coalescing-jsx`,
  `branch-map`, `return-logical-or`, `return-nullish-coalescing`, `return-map`)
  all PASS on Xslate, because Kolon resolves variables from the per-render vars
  rather than Perl lexicals. `style-object-dynamic` is pinned as a `BF101`
  diagnostic (a clean refusal) rather than skipped. Eight fixtures remain skipped
  (SSR context, multi-component scope-id harness, Phase-2b `site/ui` primitives),
  each confirmed to genuinely fail.

## 0.8.0

### Minor Changes

- 3ed9659: Add `BarefootJS::DevReload` — framework-agnostic dev browser auto-reload. The
  shared module provides the browser snippet, the `<dist>/.dev/build-id` reader,
  and a ready-made PSGI streaming app (`->to_app`) for the SSE endpoint, so plain
  PSGI/Plack hosts (e.g. the Text::Xslate backend) get the same `barefoot build
--watch` auto-reload as Mojolicious. `Mojolicious::Plugin::BarefootJS::DevReload`
  now delegates its snippet and build-id logic to the shared module (no behaviour
  change).

## 0.7.0

### Minor Changes

- ac91bc6: Extract the engine-agnostic Perl runtime (`BarefootJS.pm`) into a new
  `@barefootjs/perl` package. `@barefootjs/mojolicious` now depends on it and
  keeps only the Mojo-specific pieces — `BarefootJS::Backend::Mojo`, the
  `Mojolicious::Plugin::BarefootJS` binding, and the compile-time adapter that
  emits Embedded Perl (`.html.ep`).

  The runtime is Mojo-free at load time and drives any Perl template engine
  through a pluggable backend (`encode_json` / `mark_raw` / `materialize` /
  `render_named`), with an injectable JSON encoder. SSR output is unchanged for
  the Mojolicious path.

  Note for consumers that wire Perl `@INC` by hand: `BarefootJS.pm` now ships in
  `@barefootjs/perl/lib` rather than `@barefootjs/mojolicious/lib`. Point `@INC`
  at both package `lib/` directories (the Mojolicious integration's build does
  this automatically).

- 199644e: Add `@barefootjs/xslate` — a Text::Xslate (Kolon) adapter that compiles
  BarefootJS IR to `.tx` templates and ships `BarefootJS::Backend::Xslate`. Because
  the rendering backend is framework-agnostic, it runs under any PSGI/Plack app
  (no Mojolicious required). Validated end-to-end against Text::Xslate 3.5.9 and
  served live via Plack.

  The EP→Kolon mapping is mechanical (`<%= X %>` → `<: X :>`, `<%== X %>` →
  `<: X | mark_raw :>`, `bf->m` → `$bf.m()`), so the engine-agnostic
  `BarefootJS` runtime renders through Xslate unchanged.

  Also generalizes the core `render_child` (in `@barefootjs/perl`) to accept the
  single-hashref call form that Text::Xslate Kolon (and Template Toolkit) method
  calls require, in addition to the existing Mojo list form. Backward-compatible.
