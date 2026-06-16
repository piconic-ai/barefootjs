# Nested Region Derivation (Spike / Exploration)

> **Status:** Spike / exploration off the [router RFC](./router.md) **v2 north
> star** ("compiler-derived nested regions"). **Disposable** — this is a grounded
> feasibility study, not a committed design. Its job is to replace the hand-wave
> in the router RFC with something anchored in the real IR, and to correct the
> framing where it was wrong.

## TL;DR — the framing was wrong, and the corrected one is cleaner

The router RFC says the boundary is *"emitted by the compiler (`bf-region`
markers derived from the scope tree), not annotated per link and not
hand-placed."* Reading that literally — **zero author input, infer the
shell/page split from the component tree** — is **not feasible**, for one
concrete reason:

- **Compilation is strictly per file.** `bf build` discovers component files
  (`discoverComponentFiles`, `packages/cli/src/lib/build.ts`) and compiles each
  independently; there is **no cross-page build graph and no shared state across
  pages** (`combine-client-js.ts` only merges parent/child bundles *within* one
  output). The compiler never sees "page A and page B both wrap their content in
  `Shell`," so it cannot infer that `Shell` is the persistent shell and the
  divergence below it is the region. That is inherently a **cross-route**
  property; a single page's tree does not contain it.
- Even Next.js App Router does **not** derive this: `layout.tsx` is an
  *explicit* file. React Router/Remix `<Outlet/>` is *explicit*. "Derived
  persistent layouts" is, in every prior art, an **authored** boundary plus
  mechanical lowering.

So the corrected north star is:

> **The author marks the boundary once; the compiler derives everything else
> from the scope tree** — nesting, scope ownership, stable cross-page identity,
> and the runtime diff contract. "Mark once, no per-link annotation" (the
> original automatic-feel goal) is preserved; only the *inference of where* is
> handed back to the author, exactly as every comparable framework does.

Two facts found during the spike make this *more* tractable than feared:

1. **Layouts compile to a shared partial.** A component is emitted as a partial
   reference (`IRComponent.template`, `packages/jsx/src/types.ts`), while the
   JSX passed as `children` is inlined (`JsxChildrenAttr`). So a `<Region/>`
   placed inside `Shell` is emitted **once, into `Shell`'s partial**, and every
   page that composes `Shell` renders the *same* region markup. Cross-page
   identity falls out of the existing partial model — no cross-page pass needed.
2. **Marker ids are already deterministic.** Scope identity uses
   `computeFileScope` — a **FNV-1a hash of the source path**
   (`packages/jsx/src/ir-to-client-js/component-scope.ts`), not a per-run
   random. A `bf-region` id derived from the layout's file scope + structural
   position is therefore **stable across compiles and across pages** by
   construction, which is exactly what the runtime matcher needs.

## What the author writes

An explicit `<Region/>` inside a layout component marks the swappable region;
the surrounding layout persists. Nesting layouts nest regions.

```tsx
// shell.tsx — the persistent shell (compiles to one partial)
export function Shell({ children }: { children: JSX.Element }) {
  return (
    <div>
      <Nav />                {/* persists across navigation */}
      <Region>{children}</Region>   {/* swappable: page content */}
    </div>
  )
}
```

`<Region/>` is recognised by import (from `@barefootjs/client`, the same surface
that owns the runtime seams), so the compiler can lower it structurally rather
than by name-matching a string — consistent with the repo rule against
string/regex parsing of source.

## What the compiler derives (from the single-file tree)

Given the authored boundary, all of the following come from the IR the compiler
already has — no new cross-page analysis:

1. **Lowering.** `<Region>` lowers to its host element (or a wrapper) carrying a
   new `BF_REGION` marker with a stable id. This mirrors how `needsScope` and
   `slotId` already become `bf-s` / `bf` at adapter emit time
   (`renderElement` in `packages/adapter-hono/src/adapter/hono-adapter.ts`):
   markers are computed from IR fields, not stored as attributes in the IR.
2. **Stable region id.** `regionId = <layout file scope>:<structural index>`.
   Deterministic via `computeFileScope`, identical across every page that
   includes the layout partial. **This is the load-bearing requirement** — if
   region ids were per-compile random, the runtime could not match the same
   region across two page documents.
3. **Scope ownership.** A reactive scope (`bf-s`, with parent/mount encoded by
   `bf-h`/`bf-m`) is *owned* by its **nearest enclosing region**. Ownership is a
   pure walk of the existing scope tree: on swap, the router disposes exactly
   the scopes whose nearest `[bf-region]` ancestor is the one being replaced,
   then re-hydrates the incoming subtree via `rehydrateScope(root)`
   (`packages/client/src/runtime/hydrate.ts`, already O(subtree)).
4. **Nesting.** Nested `<Region/>`s produce nested `[bf-region]` elements; the
   deepest region whose content differs is the swap point. Outer regions and the
   shell keep their DOM and signal state.

## Nested vs sibling regions

`<Region/>` placement encodes the relationship; the compiler reads it from the
tree, so the author never declares "nested" or "parallel" explicitly:

- **Nested** — `<Region>…<Region/>…</Region>` (DOM ancestor/descendant). The
  deepest region whose owned content differs swaps; ancestors persist.
- **Sibling** — `<><Region/>…<Region/></>` (adjacent). Each is an *independent*
  swap region at the same level. The canonical case is **master–detail**: a list
  pane and a detail pane, where navigating the detail leaves the list pane's DOM,
  scroll, selection, and signal state intact.

Both fall out of the **same** contract — no extra mechanism:

1. fetch the full document, 2. match every `[bf-region=id]` by id, 3. swap only
the regions whose **owned content** (the DOM between a region and its descendant
regions) differs. Nesting yields "deepest differs"; siblings yield "each
independent." Siblings just need **distinct** ids, which
`regionId = <file scope>:<structural index>` provides automatically.

**Content source.** A nested region naturally wraps `{children}`
(`<Region>{children}</Region>`). Sibling regions are most natural when the
**page itself renders both regions** — the server emits one document containing
both, so no named-slot machinery is needed. (If instead a *layout* wants to host
two sibling regions fed from the page, a single `children` prop is insufficient;
that needs two content channels / named slots and is left as an open ergonomic
question.)

**Not parallel routes.** Sibling regions are multiple swap regions within a
**single navigation driven by the one current URL** — they are *not* App Router
parallel routes (`@slot` folders with per-slot route state and intercepting
routes). Independent per-region navigation state would require the client route
manifest this design rejects (see [Non-goals](#honest-limitations--what-a-true-derivation-would-still-require)
and the router RFC). All regions here are driven by the single current URL.

## IR & marker representation

- Add `BF_REGION` (e.g. `bf-region`) to `packages/shared/src/markers.ts`
  alongside `BF_SCOPE`/`BF_HOST`/`BF_AT`. (#1910 added this to `@barefootjs/shared`
  too; that work is not on main.)
- Add `IRElement.regionId?: string` (the boundary flag + id). Computed in
  `jsx-to-ir.ts` when a `<Region/>` import is lowered. No new IR node type is
  strictly required — a region is "an element that also carries a region id,"
  the same shape `needsScope` already uses.
- Each adapter's `renderElement` emits `bf-region="{regionId}"` when the field
  is set. The value is a static string, so cross-adapter support (Hono, Go,
  Perl) is a one-line addition per adapter with no per-backend logic.

## Runtime / router contract

- Match regions by id between the current document and the fetched document:
  `current[bf-region=id]` ↔ `incoming[bf-region=id]`.
- The **deepest** region present in both whose inner content differs is the swap
  point; ancestors are untouched (their `bf-s` scopes are never disposed).
- Dispose the swap point's owned scopes (nearest-enclosing-region set), then
  `replaceChildren` + `rehydrateScope` on the incoming subtree. This is the same
  lifecycle the router RFC's [lifecycle model](./router.md#lifecycle-model)
  describes, now with a *derived* boundary instead of a hand-authored one.
- If a region id present on the current page is **absent** in the incoming
  document (layout itself changed), fall back to swapping the nearest common
  ancestor region — ultimately the broadest region, i.e. the v0 single-region
  behavior. The single region is thus the degenerate case, as the RFC intends.

## Honest limitations & what a "true derivation" would still require

- **The boundary is authored, not inferred.** If the project still wants
  zero-input inference, it needs a **new cross-page build pass**: compile all
  page entries, diff their component-composition trees from the root, and treat
  the first divergence under each shared layout as a region. That pass is
  *additive* (it could emit the same `<Region/>` lowering) but is a separate,
  heavier capability — and fragile (a layout used by only one page, conditional
  shells, per-route layouts all confound a pure diff). Recommendation: ship the
  authored boundary first; treat inference as an optional later **lint/codemod**
  that *suggests* `<Region/>` placement, not a compile-time requirement.
- **Permanent islands** (`data-bf-permanent`, router RFC v1) interact with this:
  an island that must survive *inside* a swapping region needs carry-over, which
  is orthogonal to region derivation and stays a v1 concern.
- **Scope-ownership edge cases** (portals, context providers that cross a region
  boundary, loops straddling a region) need their own conformance fixtures
  before this is more than a spike.

## If we take this past the spike

Smallest end-to-end proof that would validate the mechanics:
1. `BF_REGION` in shared markers + `IRElement.regionId` + `<Region/>` lowering in
   `jsx-to-ir.ts`.
2. Hono adapter emits `bf-region`; one adapter-conformance fixture asserting a
   layout partial emits a stable id reused across two pages.
3. A runtime unit test for "dispose nearest-enclosing-region scopes + rehydrate
   subtree" against a two-level region fixture.

That triplet proves stable cross-page identity + scope ownership without
building the full router, and is the right scope for the next throwaway PR if
this direction is accepted.
