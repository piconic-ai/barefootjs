# Callback-Body Fidelity Across Backends (RFC / Draft)

> **Status:** RFC / Draft. Supersedes the diagnose-first
> [#2371](https://github.com/piconic-ai/barefootjs/pull/2371) (closed "to
> restart from a design-first footing"). Records the principle, the target
> fidelity model, and a staged plan; adjusted as the work lands (same
> convention as `spec/subset-conformance.md`).

## Vision

**A callback you write in TSX runs as written — and the price of a shape the
compiler can't yet express is paid by the one backend that genuinely can't
express it, never by the ones that can.**

BarefootJS compiles one JSX source to many backends. The temptation is to clamp
every backend to the shapes the *least* capable template language (Go
`html/template`, ERB, …) can render. That is the wrong default. A JavaScript
runtime — the browser (always) and Hono / H3 / Elysia on the server — can
execute an arbitrary callback body verbatim. Holding it to the DSL subset is
friction with **no user benefit**: it degrades the fidelity of the majority
target to match the minority.

This document defines **per-backend fidelity**: each backend renders a callback
at the highest fidelity it can, and where a non-JS backend genuinely cannot
express a shape at SSR, the user reaches for the **existing, explicit
`/* @client */` escape** — not a silent auto-fallback, and not a project-wide
build failure that also punishes the JS targets.

**Invariant (unchanged):** SSR/CSR parity. What a backend renders at SSR and
what the browser hydrates must agree. Per-backend fidelity never means
per-backend *behaviour drift*; it means per-backend *SSR coverage*, with the
browser (always JS) as the common, fully-faithful floor.

## Motivation

Callback-taking collection methods (`map`, `filter`, `sort`, `find`, `some`,
`every`, `reduce`, `flatMap`) are the sharpest edge of the JSX subset. Today two
classes of constraint fire **universally in Phase 1** (`jsx-to-ir.ts`, before
any adapter is consulted):

- **`BF021`** — an off-catalogue `filter` predicate or `sort` comparator
  (`typeof`, a function call, a nested higher-order method, a locale-aware
  `localeCompare`, an imported comparator, …).
- **`BF023` / `BF025` / `BF026`** — `.map()` callback shapes the JSX-loop
  lowering can't templatize (missing key, computed destructure key, a
  branching statement-block body).

Because they are Phase-1 and backend-agnostic, they reject the code for **every**
target — including Hono, whose template runtime is a full JS engine that would
run the callback as-is. A Hono user is told "unsupported" for a predicate their
runtime could evaluate without a second thought. That is the friction this RFC
removes.

The key realization from the implementation survey (below) is that **this is
mostly unlocking machinery that already exists**, not new architecture.

## Current state (grounded)

Three findings frame the whole design. Anchors are current as of this RFC.

### 1. Value-returning callbacks already have the right split — via the ParsedExpr evaluator

`filter` / `sort` / `find` / `findIndex` / `findLast` / `some` / `every` /
`reduce` / value-`map` are `CALLBACK_METHODS` (`expression-parser.ts:784`).
Their callback body is parsed into a **`ParsedExpr`** subtree and **serialized to
a per-backend runtime evaluator** (`serializeParsedExpr`,
`expression-parser.ts:3504`; Go `eval.go` / `bf.go`, Perl `BarefootJS::Evaluator`,
plus Ruby/PHP/Rust/Python ports — `spec/compiler.md:652`). Each backend
*interprets* the serialized AST at render time against a flat environment.

Crucially, **the JS-runtime adapters (Hono, CSR) never consult the support gate**
(`isSupported` is skipped, `expression-parser.ts:363`). They evaluate the body as
native JS. So for these methods a JS runtime *already* runs arbitrary callbacks
today. The only thing standing in the way of the natural code compiling is the
**Phase-1 `BF021`** raised in `transformMapCall`'s chain path
(`jsx-to-ir.ts:3843/3866/3900/3923`) and in comparator resolution
(`jsx-to-ir.ts:2876`) — a *universal* error for a *DSL-only* limitation.

### 2. JSX-returning `.map` / `.flatMap` is the different path

A JSX body becomes an **`IRLoop`** (templatized per item), not a ParsedExpr.
This is where `BF023` / `BF025` / `BF026` live. Fine-grained reactivity is
achieved by lowering the JSX into a template with marked reactive slots; the
loop's `renderItem` runs live JS for conditions (`insert(el, sN, () => cond,
…)`) and instantiates a compiler-lowered template at each JSX leaf. The if-chain
→ nested-`IRConditional` fold (the #2371 work) is the first generalization of
this beyond a single-return body.

### 3. The backend-capability + divergence machinery already exists

- **Capability flags** on `TemplateAdapter` (`adapters/interface.ts`):
  `clientShimSource`, `acceptsTemplateCall` (Hono: `() => true`; DSL: undefined),
  `templatePrimitives`, `generateSignalInitializers`. `isCallAcceptedByAdapter`
  (`relocate.ts:494`) already branches on `acceptsTemplateCall` — Hono accepts an
  arbitrary call inline in the SSR template; DSL adapters fall back to a fixed
  primitive registry or refuse. **This is the exact shape of the gate this RFC
  generalizes**, one level up (from a single call to a callback body).
- **`JsxAdapter` (Hono, TestAdapter) vs `BaseAdapter` (all DSL).**
  `generateSignalInitializers` (`jsx-adapter.ts:75`) already emits the user's
  local `const`s and functions **verbatim as executable JS** into the Hono SSR
  body. The substrate for "run the callback at SSR full-fidelity" already exists
  for JS runtimes.
- **Divergence declarations, per-adapter, keyed by fixture id:**
  `ConformancePins` (build-time refusal + BF code + issue url) and
  `RenderDivergences` (compiles clean, renders differently). A "renderDivergences
  consistency" test keeps them honest. Consumed by `coverage-map.json` /
  `support-matrix.lock.json` / the docs compatibility matrix as `pass/total`
  ratios, never binary verdicts.
- **Single-adapter compilation.** `compileJSX` takes exactly one adapter
  (`compiler.ts:530`); the compat matrix loops per-adapter with a fresh compile.
  So **Phase 1 can consult `options.adapter`'s capabilities** — there is no
  shared-across-adapters IR to worry about.

### 4. The `/* @client */` escape is the honest boundary

`/* @client */` defers a JSX expression (or a whole loop) to client-side
rendering — the browser (always JS) evaluates it, SSR renders a placeholder.
This is a **first-class, explicit, user-controlled** mechanism (already the
documented workaround for `BF021`, and the mechanism behind `client-only-loop`
fixtures). It means a non-JS backend can *always* express any callback — by the
user opting that piece into client rendering. A build refusal on a DSL backend
is therefore not a dead end; it is a signposted fork with a one-token escape.

## Target fidelity model

The **only** thing that varies by backend is *what can be rendered at SSR*.

| Surface | JS runtime (Hono / H3 / Elysia) | DSL (Go / Perl / Ruby / PHP / Rust / Python) |
|---|---|---|
| **SSR** | Any callback body, run verbatim | ParsedExpr-expressible shapes render at parity. Beyond that → **`BF` error with a `/* @client */` fix**, user opts the expression into client-only |
| **CSR** (always JS) | Any callback body, verbatim (incl. `/* @client */` pieces) | Same — the browser is JS on every backend |

Consequences:

- **No universal Phase-1 rejection for a DSL-only limitation.** The callback
  constraints become adapter-gated: a JS-runtime target accepts; a DSL target
  keeps a *loud, actionable* error **with the `/* @client */` escape**.
- **No silent auto-fallback and no silent `renderDivergence` substitute** for
  "can't express at SSR." The user decides, via `/* @client */`, where the
  SSR/CSR boundary sits. (`renderDivergences` remains for the narrower "renders
  a valid but non-byte-identical output" cases, not as a stand-in for a
  capability gap.)
- **The browser is the fully-faithful floor.** Whatever a DSL can't SSR still
  renders correctly in the browser once the user marks it `/* @client */`.

### Per-method target

`✓ SSR` = renders at SSR on that tier. `@client` = requires `/* @client */`
opt-in on that backend to render (client-only). `verbatim` = run as native JS.

| Method | JS runtime | DSL (in ParsedExpr subset) | DSL (outside subset) |
|---|---|---|---|
| `filter`, `sort`, `toSorted` | ✓ SSR verbatim | ✓ SSR (evaluator) | error + `@client` |
| `find`, `findIndex`, `findLast`, `findLastIndex` | ✓ SSR verbatim | ✓ SSR (evaluator) | error + `@client` |
| `some`, `every`, `reduce`, `reduceRight` | ✓ SSR verbatim | ✓ SSR (evaluator) | error + `@client` |
| value-`map`, `flatMap` (projection) | ✓ SSR verbatim | ✓ SSR (evaluator) | error + `@client` |
| JSX-`map` / `flatMap` (single expr / ternary / logical) | ✓ SSR | ✓ SSR (templatized) | — |
| JSX-`map` if/switch chain | ✓ SSR (fold → conditional) | ✓ SSR (fold → conditional) | — |
| JSX-`map` arbitrary body (preamble+loops) | ✓ SSR verbatim (Stage 3) | @client | @client |
| `forEach` | n/a (no render value) — advisory error | n/a | n/a |

## Design

### D1 — Adapter capability predicate

Add an optional predicate on `TemplateAdapter`, symmetric with
`acceptsTemplateCall`:

```ts
/** True if this adapter's runtime can execute an arbitrary callback body
 *  verbatim (a JS engine). JS-runtime adapters return true; DSL adapters
 *  leave it undefined and rely on the ParsedExpr evaluator subset. Granular
 *  by shape so a DSL adapter may later accept a subset. */
acceptsCallbackBody?: (parsed: ParsedExpr | null, kind: CallbackKind) => boolean
```

- `JsxAdapter` provides a default `() => true`; `BaseAdapter` leaves it
  undefined. The predicate is *granular* (receives the parsed body) so a DSL
  adapter can later accept specific shapes without an all-or-nothing flag.
- Threaded to Phase-1 sites the same way `acceptsTemplateCall` reaches
  `relocate.ts` (`compiler.ts:208`).

### D2 — Adapter-gated Phase-1 constraints

At each Phase-1 site that raises `BF021` (filter predicate, sort comparator) and
the JSX-`map` gates (`BF026`, and the destructure/key checks where a JS runtime
could otherwise proceed):

1. Consult `options.adapter.acceptsCallbackBody`.
2. **JS runtime → do not raise.** Route to the existing client-eval / verbatim
   path (which the JS adapters already take at emit — they skip `isSupported`).
3. **DSL → raise, always with the `/* @client */` fix** in the suggestion. For a
   shape the DSL *can* express (in-subset) it already compiles — no change.

### D3 — Generalize the JSX-`map` fold (neutral IR)

Extend `extractMultiReturnJsxBranches` + `foldMultiReturnBranches` to recognize
more callback bodies and **desugar them into the existing `IRLoop` /
`IRConditional` neutral shapes** that already round-trip through every SSR adapter
and the `mapArray` / `insert` runtime:

- preamble-`const`-carrying branches,
- nested `for`/loop returning JSX,
- `switch` fallthrough.

This raises SSR fidelity for *all* backends (parity preserved), and shrinks what
falls to D4. The runtime needs no change; the one hard sub-problem is key
extraction across branches (see D5).

### D4 — JS-runtime verbatim for the rest; `/* @client */` for DSL

For a JSX-`map` body that cannot be desugared to neutral IR (arbitrary control
flow, mutation):

- **JS runtime:** emit a general `renderItem` that runs the callback control
  flow as JS and instantiates a lowered template at each JSX leaf; Hono SSR runs
  the same body via the `generateSignalInitializers` verbatim path. Full
  fidelity, SSR-rendered.
- **DSL:** `BF` error with the `/* @client */` fix. When the user marks it, the
  loop renders client-only (existing `client-only-loop` path), and the browser —
  JS — runs the same general `renderItem`.

The general `renderItem` is shared: it serves both JS-runtime SSR-hydration and
`/* @client */` client-only on any backend.

### D5 — The `keyFn` hoisting contract (the one genuinely new semantic)

`mapArray`'s `keyFn` is a single loop-level expression (`shared.ts:39`);
`extractLoopKey` only succeeds when every branch declares a normalized-equal
`key`. With arbitrary control flow, keys can differ per leaf or be computed in a
preamble. Options (to decide in Stage 0):

- **(a) Hoist:** compiler emits a "compute the key before the body runs"
  contract — requires the key to be derivable from the item without running the
  full body.
- **(b) Report:** `renderItem` returns `{ el, key }` (or sets a key on the
  produced node) so the runtime reads the key the body computed.

(b) is more general but a real `mapArray` API/semantic change; (a) is smaller but
restricts where keys may come from. This is the only place a new runtime
contract is unavoidable.

## Staged plan

Each stage is independently shippable, tested, and PR-sized. Value/risk-ordered.

- **Stage 0 — This RFC.** Agree the model, the `keyFn` contract (D5), and the
  capability-predicate granularity (D1). *Deliverable: this doc, merged.*
- **Stage 1 — Adapter-gate the value-callback constraints (D1 + D2).** The
  biggest immediate win: `filter` / `sort` / `find` / `some` / `every` /
  `reduce` with *any* predicate/comparator compile on JS runtimes; DSL keeps the
  error + `/* @client */`. Also fixes the latent `fill` gap (silently emitted, no
  `BF101` today) and the stale `reduce` comment. *Tests: compiler-unit
  (adapter-conditional BF021), CSR conformance, DSL conformance/divergence,
  coverage/support-matrix. PRs: ~2–3.*
- **Stage 2 — Generalize the JSX-`map` fold to neutral IR (D3).** Re-lands the
  #2371 if-chain fold, reframed, plus preamble-const branches and nested loops.
  All backends gain SSR fidelity. *Tests: compiler-unit, CSR + cross-adapter +
  hydration conformance (new fixtures), coverage. PRs: ~2–3.*
- **Stage 3 — JS-runtime verbatim + `/* @client */` for the rest (D4 + D5).**
  Reaches the fidelity ceiling for JSX-`map`. Requires the Stage-0 `keyFn`
  decision. *Tests: runtime-unit (key contract), CSR conformance, E2E
  hydration, DSL client-only path. PRs: ~3–4.*
- **Stage 4 — Coverage / divergence / docs integration.** `renderDivergences`,
  `coverage-map.json`, `support-matrix.lock.json`, the docs compatibility matrix,
  and the fidelity tiers, updated to the new reality and held by the drift gate.
- **Stage 5 — Error-message + examples.** `BF021`/`BF026` messages become
  backend-scoped and always name the `/* @client */` escape; the "barefoot"
  philosophy doc gains the fidelity model; the Tetris / Markdown-editor examples
  re-land in their natural (if-chain / arbitrary-callback) form.
- **Stage 6 — DSL evaluator breadth (parallel, optional).** Widen the
  Perl/Ruby/PHP/Rust/Python ParsedExpr evaluators (issue #2018 Track B/C) so DSL
  backends need `/* @client */` less often.

## Open decisions (resolve in Stage 0)

1. **`keyFn` contract (D5):** hoist (a) vs report (b). *Leaning (b)* for
   generality, accepting a scoped `mapArray` API change.
2. **Capability-predicate granularity (D1):** binary (`JsxAdapter` vs
   `BaseAdapter`) vs shape-granular `acceptsCallbackBody(parsed)`. *Leaning
   granular*, symmetric with `acceptsTemplateCall`, to let DSL adapters accept
   subsets over time.
3. **Scope of Stage 1's DSL behaviour:** keep off-subset predicates/comparators
   as a hard `BF021`-with-`@client`, or additionally allow an in-subset
   *approximation*? *Leaning hard error + `@client`* — honest over clever.

## Non-goals

- **No silent auto-fallback to client-only**, and **no `renderDivergence` used
  as a substitute** for an SSR capability gap. The `/* @client */` escape is
  explicit and user-owned.
- **No opaque-JS SSR for DSL backends.** DSL SSR renders only what its evaluator
  (or a neutral-IR desugaring) can express; the rest is `/* @client */`.
- **No behaviour drift.** SSR/CSR parity is preserved on every backend within
  what it renders.
- **No new "adjust emitted output" compiler hook** (per `CLAUDE.md`); everything
  flows through neutral IR, the ParsedExpr evaluator, or the capability
  predicate.

## Conformance & coverage implications

- Every widened shape lands with a conformance fixture in the same PR
  (`spec/subset-conformance.md` change-time coupling).
- A DSL-gated shape is recorded as a `ConformancePins` entry (build refusal, with
  the `/* @client */` note) — *not* a `renderDivergence`, since it does not
  compile clean on that adapter.
- The `client-only-loop` variant of a gated shape gets its own fixture proving
  the browser renders it correctly under `/* @client */`.
- `coverage-map.json` / `support-matrix.lock.json` regenerate; the docs
  compatibility matrix reads the same `pass/total` ratios, now legitimately
  higher on JS-runtime adapters than on DSL adapters for the callback axis.
