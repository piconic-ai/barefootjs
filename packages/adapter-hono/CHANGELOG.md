# @barefootjs/hono

## 0.18.4

### Patch Changes

- 23cc4dc: Normalize intrinsic-element attribute names ONCE in Phase 1: `IRAttribute.name` now carries the HTML/SVG attribute name, so every adapter emits it verbatim. The shared `dom-prop` classifier grows an `HTML_CAMEL_ALIASES` table (React-style camelCase → HTML: `tabIndex` → `tabindex`, `maxLength` → `maxlength`, `autoComplete` → `autocomplete`, `readOnly` → the boolean `readonly`, `spellCheck` → the enumerated `spellcheck`, …) consulted by both `toHTMLAttrName` (now applied in `jsx-to-ir`'s `processAttributes`) and `toHTMLAttrNameRuntime` (spread paths). Previously each adapter mapped at most `className` → `class` itself and every other alias leaked into the emitted HTML as an unknown attribute the browser ignores — `htmlFor` never became `for` (broken label association on template backends), `readOnly` rendered as `readOnly="true"` vs bare presence depending on backend, and SVG `strokeWidth`/`strokeLinecap` passed through unmapped. Component props (`IRProp`) keep the user's API names; unknown names (`data-*`, custom-element attributes, `viewBox`-style case-sensitive SVG XML names) pass through unchanged. The `camelcase-attributes`, `svg-icon`, and `boolean-attr-literals` fixtures graduate from every adapter's `renderDivergences` declaration and the CSR skip list.

## 0.18.3

## 0.18.2

## 0.18.1

## 0.18.0

### Patch Changes

- 6c13ce7: `@barefootjs/jsx` exports `ConformancePin` / `ConformancePins` types, and each adapter package now exports its conformance `expectedDiagnostics` pin set as a structured `conformancePins` module (with `issue:` URLs) consumed by its own conformance test. These structured pins also feed a repo-internal component × adapter compile-compatibility matrix (`ui/compat.lock.json`, regenerated with `bun run compat:lock` and drift-checked in CI) that is not part of the published CLI or any published package's runtime surface.

## 0.17.1

## 0.17.0

### Patch Changes

- f2189b4: Re-export `queryHref` (and its `QueryParams` / `QueryParamValue` types) from the Hono adapter's client shim (#2042).

  The shim resolves `@barefootjs/client` for the Hono SSR runtime; `queryHref` is a pure helper (no reactivity) that runs unchanged on the server, so it must be re-exported like `searchParams` / `splitProps`. Without it, rendering a component that imports `queryHref` failed at server start with `Export named 'queryHref' not found`. Completes the Hono side of the `queryHref` support added in #2044.

- c8c7d50: Recognize the `searchParams` env signal structurally via `createSearchParams()` (#2057, part 1).

  The request-scoped query env signal is now a `createSignal`-shaped factory the compiler recognizes by structure, removing the `searchParams` name allow-list from the compiler core:

  ```tsx
  // before
  import { searchParams } from "@barefootjs/client";
  searchParams().get("sort");

  // after
  import { createSearchParams } from "@barefootjs/client";
  const [searchParams, setSearchParams] = createSearchParams();
  searchParams().get("sort"); // reactive read
  setSearchParams({ sort: "price" }); // single imperative navigation path
  ```

  Because `searchParams` is now a real signal getter, it lands in the fold purity oracle and reactive-getter set structurally — the clean fix for the fold-oracle special-casing (superseding the reverted #2055) with no name allow-list.

  - `@barefootjs/client`: **breaking** — the bare `searchParams` export is replaced by `createSearchParams()`, which returns a `[getter, setter]` tuple. The getter is the request-scoped query reader (unchanged SSR + client resolution); `setSearchParams(next)` is the single imperative navigation path (soft same-route nav via the router seam, hard-nav fallback otherwise), replacing the confusing mutable-`URLSearchParams` write path. `SearchParamsInit` accepts a query string, `URLSearchParams`, or a record.
  - `@barefootjs/jsx`: `createSearchParams` is a recognized signal primitive tagged with an `envReader` key on `SignalInfo`; `CLIENT_EXPORTS` swaps `searchParams` for `createSearchParams`; env-signal recognition flows from IR structure, not import names. Codegen keeps env signals out of normal value/field emission while leaving them in the reactivity graph.
  - `@barefootjs/shared`: new `BF_SEAM_NAV_SEARCH` seam for imperative query navigation.
  - Adapters (`go-template`, `hono`, `mojolicious`, `xslate`): env-signal reader lowering keys off signal structure instead of the import name; the per-request reader binding (`bf.SearchParams` / `$searchParams`) is unchanged.

  Migration: replace `import { searchParams } from '@barefootjs/client'` + `searchParams()` with `import { createSearchParams } from '@barefootjs/client'` + `const [searchParams] = createSearchParams()`, and use `setSearchParams(...)` for imperative query navigation.

## 0.16.0

### Patch Changes

- a7c90a6: Honor `/* @client */` on attribute bindings (#1966).

  The inline directive deferred a JSX child/text expression to hydration but was silently ignored on attribute initializers: a Go-unsupported predicate in `data-x={/* @client */ pred(x)}` still got lowered and raised BF101/BF102, making the BF102 remediation misleading for attribute-only reactive state.

  The `clientOnly` flag was already set in the IR and honored by the client-JS reactive-attribute path (the CSR template omits the attribute and a mount effect sets/patches it on hydrate). The gap was in the adapters: `renderAttributes` lowered every attribute. All four adapters (Go, Mojo, Xslate, Hono) now skip SSR emission for `clientOnly` attributes, so the server omits the attribute, the unsupported-expression lowering is never reached, and the client sets it on hydrate.

## 0.15.2

## 0.15.1

## 0.15.0

### Minor Changes

- c6212ab: Request-scoped environment signals (`searchParams()`, and future cookies/…) now resolve at SSR for the non-Hono JS hosts that render via `renderToHtml` (h3 / Elysia / any WinterCG handler), through one **keyed** request-env mechanism. #1922 (follow-up to router v0.5).

  Hono resolves a request's environment through `useRequestContext()` inside its `jsxRenderer` async context; `renderToHtml` has none, so `searchParams()` previously resolved to the empty default regardless of the request — query-dependent initial content flashed / mismatched on hydration.

  - **`@barefootjs/client`**: the searchParams-specific server reader seam is generalised to a single keyed one. `__bfSetServerSearchReader` → `__bfSetServerEnvReader((key) => …)` and `globalThis.__bf_serverSearchReader` → `globalThis.__bf_serverEnvReader(key)` (`createEnvSignal` now takes the env `key`). One seam serves every env signal, so a new signal (cookies, …) needs no new seam, setter, or host function.
  - **`@barefootjs/hono`**: new `@barefootjs/hono/request-env` subpath. It scopes the request env with a Node `AsyncLocalStorage`, so each render reads its own request's values and concurrent renders never race (a process-wide per-request global would, which the spec forbids). It installs on the shared keyed `__bf_serverEnvReader` seam (no `@barefootjs/client` import) and delegates to any prior reader when no scope is active, so a process mixing Hono and `renderToHtml` hosts keeps resolving both ways, and it lives behind its own subpath so the always-on `renderToHtml` path never loads `node:async_hooks`. Two entry points:
    - `withRequestEnv(handler)` — wrap a WinterCG `fetch` handler once at the entry point. It derives the env from the `Request`, so the whole request runs with it bound and every `renderToHtml` inside resolves it with **no per-render plumbing**; the host never names env keys.
    - `runWithRequestEnv(env, fn)` + the keyed `BfRequestEnv` type — the lower-level primitive for hosts that bind env manually.

  Usage (the bundled h3 and Elysia demos are wired this way — bind once, pages are plain `renderToHtml`):

  ```ts
  import { withRequestEnv } from "@barefootjs/hono/request-env";

  export default { port, fetch: withRequestEnv(myFetchHandler) };
  ```

  Adding the cookie env signal later is then: define it in `@barefootjs/client`, add a `cookie` field to `BfRequestEnv` (and to the `Request`→env derivation behind `withRequestEnv`) — every host wired with `withRequestEnv` picks it up with **no code change**.

- 071a1a3: `<Region>` now lowers to a `bf-region` page-lifecycle boundary (spec/router.md), the smallest end-to-end proof for the router RFC's compiler-derived nested regions. Following the `<Async>` built-in precedent, the compiler recognises `<Region>` (and its self-closing form) by tag name and lowers it to a wrapper `<div>` carrying a deterministic `bf-region="<file scope>:<index>"` id — the `computeFileScope` FNV hash of the source path plus a per-file structural index. Because a layout compiles to one shared partial, every page composing it emits the _same_ id, which is what a client router matches a region on across page documents.

  The id is a static string, so all four adapters (Hono, Go template, Mojolicious, Xslate) emit byte-identical `bf-region="<id>"` markers — no per-adapter template interpolation. Covered by a cross-adapter conformance fixture (`region-boundary`) in addition to the Hono-only emit assertion in `packages/jsx`.

  Recognition is by capitalized tag name; import-scoped disambiguation, a runtime `<Region>` export, nested/sibling runtime diffing, and the scope-ownership dispose/rehydrate path are follow-ups.

- e627b29: `searchParams()` — a request-scoped reactive **environment signal** (spec/router.md **v0.5**, "The wedge"). A same-route, query-only navigation (`/list?sort=price`) driven by `@barefootjs/router` now updates `searchParams()` and the URL **with no swap and no re-hydration** — islands reconcile fine-grained.

  - **`@barefootjs/client`**: new top-level `searchParams: Reactive<() => URLSearchParams>`. It rides the shared `@barefootjs/client/reactive` runtime (structurally one instance), so the existing reactivity analysis wires DOM updates with no new compiler feature. The underlying signal is created lazily on first read (and the router push seam `window.__bf_pushSearch` is installed there, on first read — not at import), so the module has **no import-time side effects** and an island that never reads it can be tree-shaken out of it. The generic `createEnvSignal` stays internal; only `searchParams` is exported. (The spec's package-level `"sideEffects": false` hint is deferred: it currently triggers a bun bundler bug that collapses the runtime entry to a broken re-export facade — a separate follow-up.)
  - **Request-scoped SSR**: on the server `searchParams()` resolves per-request through an injected reader (`__bfSetServerSearchReader`, or a `globalThis.__bf_serverSearchReader` seam) — never a process-wide module global, which would race across concurrent requests.
  - **`@barefootjs/hono`**: auto-wires that reader via `useRequestContext().req` (async-context scoped, race-free) when the SSR scripts are rendered — no opt-in step. `searchParams` is also re-exported from the Hono `client-shim` (SSR) and from `@barefootjs/client/runtime` (the island bundle's import source), and is allow-listed in the compiler so importing it no longer trips `BF051`.

  Covered by a cross-adapter conformance fixture (`search-params`): it runs on Hono today; the Go / Mojolicious / Xslate template adapters are skipped pending env-signal SSR lowering + runtime, tracked in [#1922](https://github.com/piconic-ai/barefootjs/issues/1922).

  The router's query-only short-circuit (shipped in v0) activates automatically once an island reads `searchParams()`; until then query-only navigations fall back to a full swap.

### Patch Changes

- 2339a2f: `<Async>` and `<Region>` are now **import-scoped, import-required** built-ins instead of bare capitalized tag-name matches (#1915, follow-up to #1914).

  The compiler recognises them only when their local binding is imported from `@barefootjs/client` (keyed off `ir.metadata.imports`), so a user's own `<Async>` / `<Region>` component — imported from elsewhere or declared locally — no longer collides with the built-in, and an aliased `import { Async as Boundary }` maps `<Boundary>` through. Real, type-checked `Async` / `Region` stubs now ship from `@barefootjs/client` (they throw if ever executed, since the compiler compiles the tags away), giving authors prop-checking and completion — the model `Portal` already follows, and how Solid imports `<Show>` / `<Suspense>` from `solid-js`. The import is elided on emit (both `templateImports` and the client-JS DOM imports) so it never survives as a phantom runtime import.

  A bare `<Async>` / `<Region>` used without the import and with no other in-scope binding now raises `BF054`. This replaces the per-file `declare function Async(...)` workaround and the `@barefootjs/hono` JSX runtime's `export declare function Async` (removed).

  **Migration:** add `import { Async, Region } from '@barefootjs/client'` to files that use these tags.

- 19af08a: `test-render` re-anchors imports _inside_ pre-compiled child modules too: a `componentModules` child that itself imports another pre-compiled sibling (e.g. a demo root's `accordion` sibling importing `../icon`) previously kept its source specifier in the temp copy and failed module resolution at render time.

## 0.14.0

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

- 5cee919: Fix the two `deno check` errors in `@barefootjs/hono` that originate in our
  own code: add the `override` modifier to `HonoAdapter.renderAsync` (TS4114,
  matching the other adapters), and decode `readFile` output via `TextDecoder`
  in the dev reloader instead of the positional string-encoding overload,
  which Deno's `node:fs/promises` types resolve to a buffer without `.trim`
  (TS2769 + TS2339). `override` is a type-only annotation and the dev-reloader
  change is behaviorally equivalent.
- 3fda4d5: `scripts/jsr-publish.ts`: drop dev-tooling-only export keys (`./build`,
  `./test-render`) and `bun:`-only conditions from the generated JSR
  manifests.

  These entries are Bun-runtime-shaped (test-render uses `Bun.*` /
  `import.meta.dir` directly; the per-adapter build helpers are wired
  for the `bf` CLI which ships as an npm executable) and never load
  cleanly under Deno's type-checker. They were the residual cause of
  `deno publish` type-check failures even after #1792 fixed import
  extensions — JSR was being asked to publish files it had no business
  type-checking against Deno's runtime.

  The npm-published surface is unchanged — these exports remain
  available to Bun / Node consumers exactly as before.

## 0.9.2

## 0.9.1

## 0.9.0

## 0.8.0

## 0.7.0

### Patch Changes

- dc7ba3f: Render the fallback when an async boundary body fails. A `<Async>` / `BfAsync` body that throws synchronously or rejects during async resolution now surfaces the same `fallback` instead of aborting the stream (sync) or leaking an unhandled rejection (async). The body is wrapped in Hono's `ErrorBoundary` on both the runtime `BfAsync` component and the compiled `<Async>` emit path. `BfAsync` also gains an optional `onError` hook so failures aren't swallowed silently.

## 0.6.1

## 0.6.0

### Minor Changes

- 4bfaa9c: Add `@barefootjs/hono/render` with `renderToHtml` and `renderToStream` — a framework-agnostic SSR entry that renders a `hono/jsx` node to an HTML string / `ReadableStream` without a Hono app, router, or `jsxRenderer` request context. This lets any HTTP framework (h3, Elysia, …) host BarefootJS by importing `@barefootjs/hono` as a render runtime, mirroring how the Go `Echo` integration imports the go-template adapter's framework-agnostic `bf` runtime. Additive only; existing exports are unchanged.

## 0.5.3

## 0.5.2

### Patch Changes

- 39a6e6c: `renderHonoComponent` (`@barefootjs/hono/test-render`) can now load child components as real pre-compiled modules via a new `componentModules` option (import specifier → module path), re-anchoring the parent's import instead of inlining + stripping the child's exports. This avoids text surgery on the child's `export` statements entirely for callers that supply pre-compiled modules.

  The inline `components` path (used when no module is supplied) also hardens its export stripping: whole `export { … }` / `export type { … }` specifier blocks — with or without a trailing `from '…'` re-export source — are now dropped cleanly instead of collapsing to a bare `type { … }` syntax error.

## 0.5.1

### Patch Changes

- 8742059: Fix two follow-up issues from the #1663 dynamic-dispatch work.

  `__bfText` could render both a stale element and fresh text in a conditional slot: that path re-resolves the anchor via `$t()` each run, which inserts a new text node before an element left by a previous Node-valued run. Writing a primitive now clears any remaining siblings up to the end marker, so switching JSX → text leaves only the text.

  The no-arg props default (`= {}`) is now asserted to the param's annotated type (`= {} as T`) in both the test and Hono adapters. `hasRequiredProps` treats a prop with a destructuring default as non-required, but the declared props type may still mark that field required, so a bare `= {}` failed `tsc` ("Property 'x' is missing in type '{}'..."). The destructuring defaults still supply the values at runtime.

- 9dcffdf: Compile JSX used as an object-literal arrow value and render dynamic dispatch (#1663).

  A `Record<K, () => JSX>` lookup map (`{ piconic: () => <BrandLogo/> }`) was never lowered: a module-level map had its const dropped from the emitted module (`ReferenceError` at SSR), and a function-local map leaked raw `<...>` into the client bundle (`SyntaxError: Unexpected token '<'`). The preprocessor now hoists arrow values in object-literal property assignments into synthesized components, the same lowering already applied to arrows in JSX-attribute position, so the lookup map survives as component references.

  Dynamic dispatch of such a map in child position (`<div>{themeLogo(props.id)}</div>`) now renders on the client: the dynamic-text effect routes through a new `__bfText` runtime helper that splices the live component element into the slot by identity instead of stringifying it to `"[object HTMLElement]"`. Adapters and `createComponent` default missing props to `{}` so a bare no-arg shim call (`LOGOS[id]()`) no longer crashes destructuring `undefined`.

- 113a17c: Reactive whole-item conditionals in loops (#1665).

  `arr.map(t => cond(t) && <li/>)` (and `cond ? <li/> : null`, `expr || <li/>`,
  `expr ?? <li/>`) makes the conditional the entire loop item, so an item renders
  0-or-1 element per pass. Previously this either threw at hydration (the loop's
  children stayed empty and the whole `.map(...)` was emitted verbatim as
  reactive text — uncompiled inline JSX, undeclared module-level helpers) or, once
  compiled, crashed at runtime (`firstElementChild.cloneNode` on a null element)
  or froze at its server-rendered value.

  This is now fully reactive, with identical behaviour whether the array is a
  `const` or a `signal()`:

  - **Runtime** — new `mapArrayAnchored` tracks each item by an always-present
    `<!--bf-loop-i:KEY-->` anchor comment (not a root element, which the item may
    not have); content lives between the anchor and the next anchor / loop end and
    is derived from the live DOM range each pass. `insert()` accepts the anchor as
    its scope so a whole-item conditional toggles range-scoped to its own item.
  - **Compiler** — detect the whole-item conditional, hoist the key from the
    rendering branch, emit per-item anchors plus a `mapArrayAnchored` renderItem;
    static-array bodies route through the same path. Logical (`&&`/`||`/`??`) and
    ternary JSX-helper map bodies are inlined, and BF023 now requires a key on
    those bodies.
  - **SSR adapters** — Hono, Go, and Mojo emit the per-item `bf-loop-i:KEY` anchor
    so server-rendered lists hydrate. Hono also emits `data-key` on the
    conditional branch's loop-item root, matching Go / CSR.

  Both-branch-element ternaries (`cond ? <A/> : <B/>`) render exactly one element
  and keep their existing `mapArray` path.

## 0.5.0

### Minor Changes

- 6326d07: Unify the importmap manifest type across the component and snippet paths.

  Both importmap injection paths now describe `barefoot-externals.json` with one
  type. `@barefootjs/jsx` exports a shared `ImportMapManifest` (the optional-field
  subset the renderer needs); `renderImportMapHtml` takes it, and the strict build
  output `ExternalsManifest` remains its all-required superset.

  **Breaking (`@barefootjs/hono`):** the `BarefootExternalsManifest` type export is
  removed. Type a `BfImportMap` `externals` prop with `ImportMapManifest` from
  `@barefootjs/jsx` instead (the runtime prop shape is unchanged, so importing the
  parsed `barefoot-externals.json` and passing it through still works).

### Patch Changes

- 5cf7272: Emit `barefoot-importmap.html` for template-string adapters (#1644).

  Follow-up to #1639/#1641. The externals system writes `barefoot-externals.json`
  for every adapter, but the Go html/template and Mojolicious adapters had no
  equivalent of Hono's `BfImportMap` component, so a project configuring
  `externals` there had nowhere to inject the importmap + preloads.

  - `bf build` now emits a ready-to-include `barefoot-importmap.html` snippet
    (generated from the same manifest) alongside `barefoot-externals.json` for
    template-string adapters. Include it via `{{ template "barefoot-importmap.html" . }}`
    (Go) or `%= include 'barefoot-importmap'` (Mojolicious).
  - Add `TemplateAdapter.importMapInjection` (`'component' | 'html-snippet'`) so an
    adapter declares how it exposes the importmap. Hono is `'component'` (no
    snippet emitted); Go/Mojo are `'html-snippet'`.
  - New `renderImportMapHtml` + `ExternalsManifest` exports from `@barefootjs/jsx`
    (and a zero-dependency `@barefootjs/jsx/import-map` subpath) are the single
    source of truth for the snippet HTML. Hono's `BfImportMap` now delegates to it
    so the component and snippet paths cannot drift — the snippet inherits Hono's
    `crossorigin` modulepreload fix (#1648) and the `<`-escaped importmap JSON.
  - New cross-adapter `assertImportMapInjectionContract` in `@barefootjs/adapter-tests`
    fails if a new adapter ships without an importmap injection point, and now also
    asserts parity: the external must resolve _through_ the importmap and every
    `modulepreload` hint must carry `crossorigin`.

## 0.4.0

### Patch Changes

- 9992041: `BfImportMap` now emits `crossorigin` on its `<link rel="modulepreload">` hints (#1648). Cross-origin (CDN) module imports are CORS fetches, so a preload without `crossorigin` couldn't be matched and the browser would discard it and re-fetch — wasting the preload and logging a "preload was not used" warning. The attribute is harmless for same-origin module preloads (same credentials mode either way).

## 0.3.0

### Patch Changes

- 6b99644: `BfImportMap` now consumes `barefoot-externals.json` (#1639):

  - Add an optional `externals` prop (the parsed manifest). Its `importmap.imports` merge on top of the built-in `@barefootjs/client*` mappings, so islands importing configured externals (`zod`, `@barefootjs/form`, …) resolve in the browser instead of 404ing on bare specifiers.
  - Emit `<link rel="modulepreload">` for the manifest's `preloads`, toggleable via a new `preload` prop (defaults to `true`).
  - Keeps `app.ts` runtime-agnostic — the caller imports the JSON and passes it through, matching how `BfScripts` already takes `manifest`. Omitting `externals` preserves the prior client-only output.

## 0.2.0

### Minor Changes

- 89a6ad5: Add .entries()/.keys()/.values() iteration shapes (#1448 Tier B)

### Patch Changes

- Updated dependencies [2313724]
- Updated dependencies [bac95e6]
- Updated dependencies [4e4d31a]
- Updated dependencies [bff7df6]
- Updated dependencies [31ce089]
- Updated dependencies [89a6ad5]
  - @barefootjs/shared@0.2.0
  - @barefootjs/client@0.2.0
  - @barefootjs/jsx@0.2.0

## 0.1.3

### Patch Changes

- Updated dependencies [91523ba]
- Updated dependencies [a5a466c]
- Updated dependencies [a57e113]
  - @barefootjs/jsx@0.1.3
  - @barefootjs/client@0.1.3
  - @barefootjs/shared@0.1.3

## 0.1.2

### Patch Changes

- @barefootjs/client@0.1.2
- @barefootjs/jsx@0.1.2
- @barefootjs/shared@0.1.2

## 0.1.1

### Patch Changes

- c896b8b: Fix published packages: resolve workspace:\* and point exports to dist/
- Updated dependencies [c896b8b]
  - @barefootjs/client@0.1.1
  - @barefootjs/jsx@0.1.1
  - @barefootjs/shared@0.1.1
