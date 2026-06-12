# IR-driven router — design exploration

Where the partial-navigation router (PR #1889) should go for strong
navigation performance, by playing to what BarefootJS is built around:
**moving work out of the runtime and into the compiler / IR**, and
**auto-wiring** what htmx-style routers make you wire by hand. Next.js,
TanStack Start, Inertia, Turbo and htmx are the references we learn from
throughout — the aim is to do well by a different mechanism that suits
BarefootJS, with respect for the prior art.

This is exploration, stacked on the reference app (PR #1891, not for merge).

---

## 1. Thesis

A BarefootJS navigation has a small, fixed shape, because of how the
compiler emits the page: there is **no virtual DOM diff** and **no
per-render serialization step** — the page is server-rendered HTML plus
fine-grained signal islands. A navigation is therefore just:

> swap the server HTML for the changed region **+** hydrate the few islands
> inside it **+** dispose the few islands leaving.

The prototype already does the swap. What it does *naively at runtime* —
and what the compiler already knows — is the rest. Three runtime costs and
three manual wirings are the gap.

## 2. What the prototype pays at runtime (measured)

`bench.ts` (happy-dom, avg 200 runs, outlet fixed at 8 islands, growing
shell):

| shell nodes | full-doc walk | outlet-only walk | full parse | fragment parse |
|---|---|---|---|---|
| 50 | 0.125ms | 0.013ms | 2.84ms | 0.17ms |
| 200 | 0.382ms | 0.010ms | 5.15ms | 0.15ms |
| 1000 | 2.43ms | 0.009ms | 22.2ms | 0.16ms |
| 4000 | 9.53ms | 0.010ms | 92.1ms | 0.13ms |

(happy-dom is slower than a real browser in absolute terms; the **scaling**
is the point and is engine-independent.)

Two costs scale with the **whole document**, not with what changed:

1. **Re-hydration walks the entire document.** `rehydrateAll()` schedules
   `walkAllInDocumentOrder()`, which is
   `document.createTreeWalker(document, SHOW_ELEMENT | SHOW_COMMENT)` over
   the *whole document* on every swap
   (`packages/client/src/runtime/hydrate.ts`). The "outlet-only walk"
   column is what an IR-scoped walk would cost — flat, ~0.01ms, **~950×
   cheaper at 4k nodes**.
2. **The router parses the whole response** with `DOMParser` to find
   `[bf-outlet]` (`packages/router/src/router.ts` `extractOutlet`). The
   "fragment parse" column is what parsing **only the outlet** would cost —
   flat, **~700× cheaper at 4k nodes**. (This is a *client-side* win the
   router could capture by extracting the outlet substring on the known
   marker — it does **not** argue for a server fragment, which §5.4
   explains is net-negative for caching.)

A third cost isn't in the table because it's structural:

3. **No prefetch / snapshot cache.** Every navigation is a full network
   round trip before anything changes.

## 3. What the prototype makes you wire by hand (the htmx critique)

The earlier design discussion's whole point was that htmx makes you author
`hx-target` / `hx-select` on every link. The prototype is better (one
`bf-outlet`, all links auto-partial) but still hand-wires three things:

1. **The outlet boundary** (`<main bf-outlet>`) is authored.
2. **Disposal** is a `dispose` callback the app must pass — and the stress
   test proved the GC-only default *leaks* (a left page's `setInterval`
   kept firing `5→9`, live islands `4→6`; see `STRESS.md`).
3. **Island JS loading** for the incoming route is left to the page.

All three are knowable at compile time.

## 4. What the compiler already knows (the lever)

BarefootJS is a 2-phase compiler (JSX → IR → marked template + client JS).
By build time it has computed, per component:

- **Addressable scope / slot ids** — compile-time-stable slot ids
  (`s0`, `s1`, … per component; `packages/jsx/src/jsx-to-ir.ts:480-487`)
  plus `bf-s` scope, `bf-h` host, `bf-m` slot, `bf-c` conditional, loop
  ids (`spec/compiler.md`, "Hydration Markers"). The exact island slot ids
  inside any rendered region are known at compile time, not discovered by
  scanning. **Caveat:** the *runtime* `bf-s` value gets a random suffix at
  SSR time (`ComponentName_${Math.random()…}`,
  `packages/adapter-hono/src/adapter/hono-adapter.ts:552-555`), so a
  manifest must key by component **name**, and persistent-island identity
  across routes needs a compiler-stable id (see §10).
- **A per-component client-JS module + per-island signal/prop map** —
  verified by running `bf build` on `integrations/hono`, every manifest
  entry carries `clientJs` (the island's module path) and **`ssrDefaults`:
  the island's reactive binding *names*, their compile-time **default**
  values, and which are props** — e.g. `Counter → {count:0, doubled:0,
  initial:<prop>}`, `TodoApp → {todos, newText, filter,
  initialTodos:<prop>}`. Note `ssrDefaults` is a *static, per-component*
  shape (build-time defaults; a prop's real value is `null` until render)
  and is consumed by the **DSL SSR adapters** (Go/Perl/Xslate) to seed
  template vars — **the JS client runtime does not read it**. The actual
  **per-instance initial values** for JS hydration live in the **`bf-p`**
  attribute (`BF_PROPS`) emitted on each root client scope and read by
  `parseProps(el.getAttribute('bf-p'))` (`hydrate.ts`). So the manifest
  gives the islands' module URLs *and their signal/prop **surface***
  (names + which are props — what §6's data patches and typed prefetch
  need); the *values* ride at runtime (`bf-p` initially, a patch on
  navigation). The cross-component **dependency** story is two-track:
  child islands are often *combined* into the parent bundle at build
  (observed: "Combined: TodoApp.client.js"), and genuine stub-rewritten
  refs emit `stubDeps`, which `BfScripts` walks transitively (post-order
  DFS, `packages/adapter-hono/src/scripts.tsx:189-227`) and `BfPreload`
  turns into `modulepreload` (`preload.tsx:131-150`). Either way the
  module set a route needs is build-time-derivable.
- **The signal dependency graph** — the analyzer brands reactive getters
  and tracks which signals feed which DOM nodes (`spec/compiler.md`,
  "Reactivity Classification"; `bf debug graph`). This is what enables
  going *beyond* page-level swaps (§6).
- **Module structure / import map** — client JS is split per component and
  resolved through an import map (`renderImportMapHtml`, `BfScripts`).

Routing itself is deliberately **not** in the compiler — it's the host
framework's job (Hono `app.get`). The design must keep it that way (the
"any backend" core) while still emitting the per-component data a router
can consume.

## 5. Proposed architecture: the router as a manifest interpreter

Turn the runtime DOM-scanner into a **compile-time-indexed lookup**. Three
layers.

### 5.1 Compile time — emit an island/route manifest (`bf build`)

Extend the existing build manifest with a router rollup, **keyed by
outlet-content component**, not by URL (this is the key move that keeps
BarefootJS out of routing while still enabling IR-driven navigation):

```jsonc
// routes.manifest.json (component-keyed)
{
  "PostDetail": {
    "outletScope": "PostDetail",          // derived; see §5.2
    "islands": ["LikeButton", "ReadTimer"],
    "modules": ["/static/PostDetail.client.js",
                "/static/LikeButton.client.js",
                "/static/ReadTimer.client.js"],   // from manifest deps
    "shellSig": "h3a1…",                  // shared-shell signature
    "hash": "c1d2…"                       // asset version (cache-bust gate)
  }
}
```

- `islands` / `modules` come straight from the existing `clientJs` +
  `dependencies` fields — no new analysis, just a rollup.
- `shellSig` lets the client confirm the target shares the current shell →
  safe to partial-swap; mismatch → fall back to a full load (Turbo's
  `data-turbo-track` reload gate, but derived).
- `hash` is the Inertia/Turbo asset-version gate, free from `contentHash`.

The host still owns URL→component (Hono renders the right component per
route). The client learns the component from the **rendered outlet's root
scope id** (`bf-s="PostDetail_…"`), so URL→manifest needs no compiler
routing ownership. For *prefetch before the response exists* (§5.3), links
can optionally carry a compiler-emitted `data-bf-route="PostDetail"` hint
when the tag's target is statically known, or the app registers a small
URL-pattern→component map — both progressive, neither required for
correctness.

### 5.2 Compile time — derive the outlet (kill manual `bf-outlet`)

In a layout-nested app the outlet is **the slot where the route child
mounts inside the shared layout** — which the IR already represents as the
child's `bf-m` slot id under the layout's `bf-h` host scope. So:

> **outlet = the layout's route-child slot.**

No `<main bf-outlet>` marker; the compiler emits the outlet attribute on
that slot automatically. Where there is no layout nesting yet, fall back to
the authored marker (progressive). This is the "automatic, not hand-wired"
experience, and it's the same structural info Next/TanStack get from nested
route segments — except BarefootJS derives it from the component tree it
already has.

**Persistent islands fall out of the same analysis:** an island that
appears in the shell of *every* route (header search, player, theme) is
structurally shared → mark it persistent → never re-create across a swap.
That's `data-turbo-permanent` / morph, **derived** instead of authored —
closing the gap the first design discussion flagged.

### 5.3 Runtime — a thin manifest-driven router (`@barefootjs/router`)

The runtime stops scanning and starts looking up:

- **Prefetch** (hover / viewport): fetch the page **and** `import()` the
  island modules the response carries (its `<script type="module">` tags).
  By click time both HTML and island JS are warm → navigation feels
  instant (Turbo 8 / Inertia 2 prefetch).
- **Swap**: replace the outlet, extracted from the full page client-side
  (§5.4 — no server fragment negotiation).
- **Targeted hydrate**: hydrate **only the listed island scope ids in the
  new subtree** — the flat-cost path the bench measured, not
  `rehydrateAll()` over the document.
- **Precise dispose**: tear down **exactly the outgoing scope ids** via a
  compiler-emitted scope→dispose registry (§5.5) — no manual hook, no leak.
- **Asset-version gate**: if the response's `hash` / `shellSig` disagrees
  with the loaded app, hard-navigate instead of swapping.

The router is *generated/configured by the manifest*, not hand-written —
this is the CLI-integrated, auto-wired end state.

### 5.4 Server — plain full pages (no fragment negotiation)

The server just returns full pages; the router extracts `[bf-outlet]`
client-side. Server-side fragment content-negotiation was considered and
**dropped**: returning only the outlet shaves highly-compressible shell
markup (gzip already handles it) while *hurting* cache efficiency
(`Vary`-fragmented per URL) and forcing every fragment to re-include its
island `<script type="module">` tags and `<title>` (or navigated-to
islands go inert). The cost that matters is the round-trip — addressed by
prefetch (§5.3), not by shrinking the payload. This also keeps the
"any backend, zero cooperation" property pure.

### 5.5 The two `@barefootjs/client` changes that unlock it — **implemented (P0)**

Everything above rested on two small, high-value runtime additions. Both
are now done as an **independent `@barefootjs/client` PR (#1893)** — a
general runtime improvement, not router-specific — which the router (#1889)
and this exploration stack on:

1. **Subtree-scoped hydrate — done.** `rehydrateScope(root)` walks only
   `root` (synchronous, O(scopes in `root`)), beside the existing
   whole-document `rehydrateAll()`
   (`packages/client/src/runtime/hydrate.ts`). The router's default
   `rehydrate` now calls it on the swapped outlet via
   `window.__bf_hydrate_within`.
2. **Scope→dispose registry — done.** Each scope's `init` now runs inside
   `createRoot`, and `disposeScope(root)` tears down the reactive graphs of
   the scopes inside `root`. The change is additive — nothing disposes a
   root unless `disposeScope` is called, so existing lifetimes are
   unchanged (full client suite 360 + adapter CSR conformance 722 stay
   green). The router's default `dispose` now releases outgoing islands
   precisely via `window.__bf_dispose_within`, fixing the stress-measured
   leak **by construction** — for the router *and* for conditionals/loops
   generally.

3 new unit tests (`packages/client/__tests__/runtime/scoped-hydrate.test.ts`)
cover subtree-only hydration, effect teardown on dispose, and re-hydration
after dispose.

## 6. Signal-level data patches

The IR records every component's `signals` / `memos` / `effects`
(`IRMetadata`, `packages/jsx/src/types.ts:1312-1354`), and the manifest's
`ssrDefaults` names each island's reactive bindings and which are props
(its *shape* — see §4; the per-instance values themselves live in `bf-p`
at runtime, not the manifest). The analyzer knows which signals feed
which nodes (`bf debug graph` / `debug why-update`). For a navigation that
only changes *data* (a re-sorted list, a filtered table, a counter) rather
than structure, the compiler can emit a **data patch** the router applies
by **setting those signals directly — no DOM swap, no fragment, no
hydration walk at all.** This is Inertia's `only:` partial-props idea,
gratefully borrowed, with the set of signals to patch IR-derived rather
than hand-declared. It fits naturally here because the signal model has no
reconcile pass in the first place — this is the most distinctive lever the
IR opens up.

## 7. CLI integration

**Rollup core — prototyped & validated (`routes-manifest.ts`).** The §5.1
rollup is a pure transform of the existing `manifest.json`, not new
analysis. `routes-manifest.ts` builds it and runs against the real `bf
build` output of `integrations/hono` (11 components): for every island it
derives the **module** (`clientJs`), the transitive **module set**
(`stubDeps`), and the **signal/prop surface** (`ssrDefaults`). Example:

```
component          island modules props          signals
Counter            yes    1       initial        count,doubled
TodoApp            yes    1       initialTodos   todos,newText,filter
TodoItem           yes    1       -              -
```

**Finding (ssrDefaults is a partial surface).** `ssrDefaults` only seeds
props *referenced by a signal/memo initializer*, so a purely-presentational
child island (`TodoItem`) shows an empty surface even though it takes props
via child JSX. The module/prefetch story is complete for every island; the
**data-patch surface (§6) is complete for stateful islands but partial for
presentational children** — patching those needs the IR directly (the
analyzer has the bindings) rather than the manifest alone.

**Remaining P2 work:**

- `bf build` → write `routes.manifest.json` alongside `manifest.json`
  (`build.ts:947-953`) via the existing `postBuild(ctx)` hook
  (`BuildConfig`, `build.ts:41-74`) — promote `routes-manifest.ts`'s
  `buildRoutesManifest()` into the build, no pipeline surgery.
- `bf routes` → an inspector over the rollup, a new file in
  `packages/cli/src/commands/` dispatched from `packages/cli/src/index.ts`
  like the existing `debug` / `gen` subcommands (sibling to `bf docs` /
  `bf debug graph`).
- **Outlet derivation** stays future work (the layout-slot analysis of
  §5.2) — the rollup above is island/module-keyed and orthogonal to it.
- Dev server already streams a build id for reload; the router consumes the
  manifest in dev unchanged.

## 8. How this model differs

A factual contrast of mechanisms (not a scoreboard) — VDOM-SSR frameworks
and BarefootJS make different trade-offs:

| | VDOM-SSR (Next / TanStack) | BarefootJS IR-router |
|---|---|---|
| Initial JS | framework + route components, full-tree hydrate | islands only, island-granular hydrate |
| Nav payload | RSC/flight or loader JSON | full HTML page (outlet extracted client-side), or signal patch (§6) |
| Nav client work | deserialize + VDOM reconcile | swap + O(islands) hydrate, no diff |
| Hydrate scope | route subtree (framework-managed) | exact island ids (compiler-managed) |
| Prefetch | route-level | exact module set from manifest |
| Disposal | framework-managed | compiler-emitted registry |

Those frameworks buy a lot with the VDOM (rich client interactivity,
mature ecosystems); BarefootJS trades it away for a smaller, compiler-known
update unit. The bench quantifies the row this design leans on: an
outlet-scoped hydrate is O(outlet) vs the current O(document) — 100–900×
at realistic shell sizes.

## 9. Phased plan

- **P0 — `@barefootjs/client` — ✅ done as an independent PR (#1893).**
  Subtree-scoped `rehydrateScope(root)` + scope→dispose registry
  (`disposeScope`, via `createRoot`). A general runtime capability; the
  router (#1889) consumes it. Fixes the leak, enables targeted hydrate.
- **P1 — `@barefootjs/router`:** consume an outlet element + island id list
  (✅ outlet element today); prefetch from a provided module list; snapshot
  cache; asset-version gate.
- **P2 — compiler / CLI — 🚧 in progress.** Rollup core prototyped &
  validated on real `bf build` output (`routes-manifest.ts`, §7).
  Remaining: emit `routes.manifest.json` from the build (`postBuild`),
  add the `bf routes` inspector, then outlet/persistent-island derivation
  from the layout slot (§5.2).
- **P3 — signal-level data patches (§6)** for data-only navigations.

## 10. Open questions

1. **Route source of truth.** Component-keyed manifest keeps BarefootJS out
   of routing, but prefetch-before-response wants URL→component. How much
   route knowledge do we let the compiler/CLI see without owning the HTTP
   layer? (Proposed: optional `data-bf-route` hints + optional URL-pattern
   map; never required.)
2. **Outlet derivation without a layout convention.** BarefootJS has no
   pages/ convention today. Do we add one, lean on `barefoot.config`
   route registration, or keep the authored `bf-outlet` as the floor?
3. **Persistent-island identity across routes.** Matching "the same shell
   island" across navigations needs a stable cross-route scope id; today
   the `bf-s` suffix is a per-render `Math.random()`
   (`adapter/hono-adapter.ts:552-555`). Needs a compiler-stable id for
   shell-shared scopes (a deterministic hash of name + structural path,
   say).
4. **Data-patch safety (§6).** Bounding when a navigation is "data-only"
   vs structural is an IR analysis with real edge cases (conditionals,
   list reconciliation) — promising but the least proven.
