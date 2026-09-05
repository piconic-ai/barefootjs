# Compiler Specification

## Vision

**"Reactive JSX for any backend"** - Enable Signal-based reactive JSX to generate Marked Templates + Client JS for any backend language (TypeScript, Go, Python, Perl, etc.).

## Design Goals

1. **Multi-backend support** - Generate templates for any backend language
2. **Type preservation** - Maintain full type information for statically typed targets
3. **Fast compilation** - Single-pass AST processing
4. **Helpful errors** - Source location + suggestions for all compiler errors

---

## Architecture

### Pipeline

```
JSX Source
    ↓
[Phase 1] Single-pass AST → Pure IR (with full type info)
    ↓
    ├── IR snapshot (optional, programmatic API only)
    ↓
[Phase 2a] IR → Marked Template (via adapter)
[Phase 2b] IR → Client JS
    ↓
*.tsx (hono/jsx)
*.client.js
```

### Design Principles

1. **IR is JSX-independent** - Pure JSON tree structure
2. **Full type information** - All types preserved in IR
3. **Single AST pass** - Parse once, extract everything
4. **Adapter-based output** - IR can be rendered to different template formats
5. **Rich error reporting** - Source location + suggestions

### Phase 1 Dispatch: JSX-Embeddable Expressions

Phase 1 must accept the same set of expression shapes at every position where a user can embed an expression that contributes to rendered output:

- Component return position (`return expr`, arrow-body expression)
- JSX child position (`{expr}` inside an element)
- Conditional branch position (`cond ? whenTrue : whenFalse`, `cond && whenTrue`)
- Attribute value position (`attr={expr}`)

Historically these positions had parallel allow-lists, which meant each new supported shape had to be added in several places and omissions surfaced as silent mis-render. The canonical classification of every `ts.SyntaxKind` that can appear as a `ts.Expression` is maintained in
[Appendix A: ts.SyntaxKind classification for JSX-embeddable expressions](#appendix-a-tssyntaxkind-classification-for-jsx-embeddable-expressions). The Phase 1 dispatcher is expected to be an exhaustive `switch (expr.kind)` keyed to that table, with `assertNever` guarding the default branch so that any future `ts.SyntaxKind` added by upstream TypeScript is a compile-time error rather than a silent runtime drop.

---

## Reactivity Model

BarefootJS uses SolidJS-style fine-grained reactivity with automatic dependency tracking.

### Signals

Signals follow the SolidJS pattern - **getter function calls**:

```tsx
const [count, setCount] = createSignal(0)

// Read: call getter function
count()           // ✅ Correct - returns current value

// Write: call setter function
setCount(5)       // Direct value
setCount(n => n + 1)  // Updater function
```

**Key difference from React:**

| BarefootJS (SolidJS-style) | React |
|----------------------------|-------|
| `count()` - function call | `count` - direct variable |
| Automatic dependency tracking | Manual `[deps]` array |
| Fine-grained updates | Component re-render |

### Props Access

Props should be accessed via `props.xxx` to maintain reactivity (SolidJS-style):

| Pattern | Behavior | Use Case |
|---------|----------|----------|
| `props.value` | Reactive (may be getter) | In event handlers, JSX |
| `const { value } = props` | Captured once | Static props / initial values only |

```tsx
// ✅ GOOD: Maintains reactivity
function Child(props: Props) {
  return <p>{props.value}</p>  // Re-evaluates on each access
}

// ⚠️ Destructuring captures value once - loses reactivity
function Child({ value }: Props) {
  const captured = value  // If parent passes count(), this is stale
  return <p>{captured}</p>
}

// ✅ OK: Destructured value as initial value for local signal
function Child({ value }: Props) {
  const [local, setLocal] = createSignal(value)
  return <p>{local()}</p>  // local signal is reactive
}
```

### Lazy Evaluation

Reactivity is based on **lazy evaluation** - expressions are only evaluated when accessed. This enables efficient fine-grained updates.

**Parent-to-child props example:**

```tsx
// Parent component
function Parent() {
  const [count, setCount] = createSignal(0)
  return <Child value={count()} onChange={() => setCount(n => n + 1)} />
}

// Compiler wraps dynamic expressions in getters, but not callbacks
// → { get value() { return count() }, onChange: () => setCount(n => n + 1) }

// Child component
function Child(props: Props) {
  // Value is evaluated HERE when accessed
  createEffect(() => {
    console.log(props.value)  // ← count() is called at this moment
  })

  // Callback is called directly (no lazy evaluation needed)
  return <button onClick={props.onChange}>+1</button>
}
```

**Compiler transformation rules:**

| Prop type | Transformation | Reason |
|-----------|---------------|--------|
| Dynamic expression `{count()}` | `get value() { return count() }` | Lazy evaluation for reactivity |
| Callback `{() => fn()}` | `onChange: () => fn()` | No lazy evaluation needed |
| Static value `{"hello"}` | `label: "hello"` | No lazy evaluation needed |

The **consumer** (child) determines when evaluation happens, not the **provider** (parent). This is why:
- `props.value` → Getter is called → Reactive
- `const { value } = props` → Getter is called immediately → Value captured once

### Comparison with SolidJS and React

| Aspect | BarefootJS | SolidJS | React |
|--------|-----------|---------|-------|
| Signal access | `count()` | `count()` | `count` (useState) |
| Props access | Getter-based | Getter-based | Direct access |
| Destructuring props | ⚠️ Careful | ⚠️ Careful | ✅ Safe |
| Dependency tracking | Automatic | Automatic | Manual arrays |
| Rendering | Marked template + Client hydration | All in JS | All in JS |

### Memos

Derived values use `createMemo`:

```tsx
const doubled = createMemo(() => count() * 2)

// Usage: also a getter call
doubled()  // Returns computed value
```

### SSR value embedding (block → expression normalization)

A value-producing body — a memo / derived value or a higher-order callback body
— is normalized to a **single value expression** before lowering. (Attribute
and interpolation positions are already expressions and never carry a block, so
there is nothing to fold there.) A block body (`() => { … }`) is folded to that
expression: pure `const` bindings inline (let-inline), and value-producing `if`
/ early `return` become a ternary (`if (c) return A; return B` → `c ? A : B`).
Genuinely imperative shapes — raw `for` / `while` accumulation that isn't a
fold, `break`, local re-assignment, side-effecting / I/O calls — are *not* value
expressions and do not normalize. This is the single support criterion
("purely-functional expressibility", #2018 / #2040): the question is always
*can this be written as a pure value computation?*, not *which named pattern
does it match?*

**SSR reproduction is best-effort, with a single hard boundary.** How the
normalized value reaches the server-rendered HTML follows one rule:

1. Flicker prevention is **best-effort** — the compiler tries to embed the
   correct initial value into the SSR output so the first paint matches the
   hydrated state.
2. **If the value can be embedded, use it** (the expression lowers to the
   target template, or evaluates against the initial signal / request state).
3. **If it can't, fall back to the zero value** — silently. The client
   recomputes the real value at hydrate from the verbatim runtime code, so the
   output is faithful after hydration (a first-paint flash is the accepted cost).

How *hard* the compiler tries to embed (whole-body fold, evaluating a guard
against a falsy-initial signal, lowering a `searchParams()`-derived object, …)
is a best-effort implementation detail, **not** a correctness boundary: failing
to embed degrades to the zero value, never to wrong output. Recognizer-style
special cases for particular block shapes are therefore just extra embedding
*effort* — kept or dropped on a flicker-reduction-vs-maintenance basis, not a
policy question.

**The hard boundary — loud only when there is no safe fallback.** The
zero-value degradation above is valid only where a zero value is a *safe*
fallback (chiefly memo / derived / attribute initial values: rendering an empty
/ zero value briefly, then hydrating, is acceptable). Where there is **no safe
fallback** — a position that would otherwise emit invalid or wrong output, e.g.
a template-position filter predicate or attribute expression the adapter cannot
lower to a valid template fragment — the compiler is **loud** (BF021 / BF101)
and the author escapes with `/* @client */`, which defers that position to the
client.

The asymmetry is deliberate: `/* @client */` removes a *miscompile* by deferring
the position to the client, but it does **not** remove a value's first-paint
flicker (the client fills that in later too). So loudness is only meaningful
where `@client` actually changes the outcome — the no-safe-fallback / miscompile
case — and is pointless (pure noise) for best-effort value embedding. A memo
whose initial value cannot be embedded is therefore **never** an error: it
degrades to the zero value and recovers at hydrate.

### Effects

Side effects use `createEffect`:

```tsx
createEffect(() => {
  // Runs when any accessed signal changes
  console.log('Count is:', count())
  localStorage.setItem('count', count().toString())
})
```

---

## Attribute & Prop Value Representation

`IRAttribute` and `IRProp` carry their right-hand-side value through a
single discriminated union `AttrValue` (#1264). Every adapter switches
on `value.kind` exhaustively so a new variant becomes a type error at
every emit site rather than a silent fallthrough.

| Variant | Source shape | `IRAttribute` (element) | `IRProp` (component) |
|---------|--------------|-------------------------|----------------------|
| `literal` | `<X y="z" />` | ✓ | ✓ |
| `expression` | `<X y={expr} />` | ✓ | ✓ |
| `boolean-attr` | `<button disabled />` (intrinsic) | ✓ | – |
| `boolean-shorthand` | `<X disabled />` (component) | – | ✓ |
| `template` | `class={`${a} ${cond ? 'on' : 'off'}`}` | ✓ | ✓ |
| `spread` | `<X {...rest} />` (with `name === '...'`) | ✓ | ✓ |
| `jsx-children` | `<X header={<h1/>} />` | – | ✓ |

Notable fields per variant:

- `expression` carries `expr` (source-level JS), optional `templateExpr`
  (the `_p.xxx`-rewritten variant used in SSR template inlining), and an
  optional `presenceOrUndefined` set when the producer peeled an
  `expr || undefined` boolean-presence pattern.
- `template.parts` reuses `IRTemplatePart` (`string` / `ternary` / `lookup`).
  Adapters that can run JS at SSR (Hono) re-emit a JS template literal;
  adapters that can't (Go-template, Mojolicious) walk the parts.
- `spread` keeps the legacy `name === '...'` marker for backward
  compatibility, but `kind === 'spread'` is the authoritative
  discriminator going forward.
- The `freeIdentifiers`, `callsReactiveGetters`, `hasFunctionCalls`, and
  `clientOnly` fields ride on the parent `IRAttribute` / `IRProp` (via
  `AttrMeta`), not the variant — they apply orthogonally to every kind.

Helpers exported from `@barefootjs/jsx`:

- `AttrValueOf.literal(value)` / `.expression(expr, opts?)` /
  `.booleanAttr()` / `.booleanShorthand()` / `.template(parts)` /
  `.spread(expr, templateExpr?)` / `.jsxChildren(children)` — variant
  constructors used by the producer and any hand-built IR fixture.
- `attrValueToString(value, opts?)` — flatten to a JS expression string;
  returns `null` for variants with no string projection (`boolean-attr`,
  `boolean-shorthand`, `jsx-children`).
- `isStaticAttrValue(value)` — true when the value is fully resolvable
  at compile time.
- `exhaustiveAttrValue(value)` — type-level sentinel for `switch`
  defaults; if a future variant lands without a matching `case`, the
  parameter collapses to `never` and the call site fails to type-check.

## Transformation Rules

### Categories

| Prefix | Category | Description |
|--------|----------|-------------|
| JSX-XXX | Basic JSX | Elements, text, fragments |
| ATTR-XXX | Attributes | Static, dynamic, spread |
| EXPR-XXX | Expressions | Signals, memos, dynamic content |
| CTRL-XXX | Control Flow | Conditionals, lists |
| COMP-XXX | Components | Props, children, composition |
| EVT-XXX | Events | Event handlers, delegation |
| REF-XXX | Refs | Ref callbacks |
| EDGE-XXX | Edge Cases | Whitespace, SVG, forms |
| DIR-XXX | Directives | "use client" validation |
| PATH-XXX | Element Paths | DOM traversal optimization |
| TYPE-XXX | Type Preservation | Interface/type handling |
| OOS-XXX | Out of Scope | Intentionally not supported |

### Output Types

| Type | Meaning |
|------|---------|
| `preserve` | Input is preserved as-is (input = output) |
| `markedTemplate` | Input is transformed to marked template (adds hydration markers) |
| `clientJs` | Client-side JavaScript is generated |
| `both` | Both marked template and client JS are generated |
| `error` | Compilation error is expected |
| `n/a` | Not applicable (Out of Scope items) |

### Import-scoped built-ins (`<Async>` / `<Region>`)

`<Async>` (streaming boundary → `IRAsync`, e.g. Hono `<Suspense>`) and
`<Region>` (page-lifecycle boundary → `bf-region`, `spec/router.md`) are
compiler built-ins that are **compiled away** — no runtime value survives in
the emitted output. They are recognised **import-scoped**: the compiler treats
a tag as the built-in only when its local binding is imported from
`@barefootjs/client` (keyed off `ir.metadata.imports`), never by a bare
capitalized tag-name match. This is the same model `Portal` already follows and
mirrors how Solid imports `<Show>` / `<Suspense>` from `solid-js`.

```tsx
import { Async, Region } from '@barefootjs/client'
```

- **Provenance & collision safety** — a user's own `<Async>` / `<Region>`
  component (imported from elsewhere or declared locally) does not collide with
  the built-in. An aliased `import { Async as Boundary }` maps `<Boundary>` to
  the built-in.
- **Diagnostic** — a bare `<Async>` / `<Region>` used without the import and
  with no other in-scope binding raises `BF054` (import the built-in).
- **Emit-time elision** — the `@barefootjs/client` import of these tags is
  stripped on emit (`templateImports` and the client-JS DOM imports) so it never
  lingers as a phantom runtime import. Real type-checked stubs ship from
  `@barefootjs/client` (`packages/client/src/builtins.ts`).

The runtime stubs throw if ever executed — reaching them means the JSX was
rendered outside the compiler pipeline. See piconic-ai/barefootjs#1915.

### Hydration Markers

1. **Marked Template**: Template with hydration markers (used for both SSR and CSR)

   | Marker | Purpose | Example |
   |--------|---------|---------|
   | `bf-s` | Component scope boundary + addressable scope ID | `bf-s="Counter_a1b2"` |
   | `bf-h` | Host scope ID — present on child scopes only | `bf-h="App_root"` |
   | `bf-m` | Slot ID in the host where the child is mounted | `bf-m="s10"` |
   | `bf-r` | Root-of-client-component marker (no value) — for e2e locator distinction | `bf-r=""` |
   | `bf` | Interactive element (host-side slot position) | `bf="s0"` |
   | `bf-p` | Serialized props JSON | `bf-p='{"initial":5}'` |
   | `bf-c` | Conditional element | `bf-c="s2"` |
   | `bf-po` | Portal owner scope ID | `bf-po="Dialog_a1b2"` |
   | `bf-pi` | Portal container ID | `bf-pi="bf-portal-1"` |
   | `bf-pp` | Portal placeholder | `bf-pp="bf-portal-1"` |
   | `bf-i` | List item marker | `bf-i` |

   **Slot identity (#1249).** A slot-attached child component scope is
   identified by the `(bf-h, bf-m)` pair — unique by construction at
   SSR emit time. The slot-resolver's primary lookup is
   `[bf-h="<host>"][bf-m="<slot>"]`; bf-s suffix and name-prefix
   selectors remain as fallbacks for adapters whose SSR output predates
   the (bf-h, bf-m) emission (go-template, mojolicious). `bf-s` carries
   the scope's own addressable id used by portals (`bf-po`), context
   lookups, and the hydration walker — but **not** slot identity.

   **Loop item root (#2833).** A loop item root does not DERIVE its `bf-s`
   from its slot (see "Pass `_bf_slot` for slotted children" below), but it
   still carries `(bf-h, bf-m)` slot identity like any other slotted child —
   Hono stamps `__bfParent`/`__bfMount` on a row root while letting an
   interactive child's own `__scopeId` win over `__bfScope`. The CSR
   template emitters mirror this via `renderChild`'s `loopItemRoot`
   parameter (`packages/client/src/runtime/component.ts`): it stamps
   `(bf-h, bf-m)` unconditionally but skips deriving `bf-s` from them. A
   static array's materialize `forEach` (`packages/jsx/src/ir-to-client-js/
   control-flow/stringify/loop.ts`) runs during `init`, after the parent's
   own template evaluation — and its ambient parent-scope id — has already
   unwound, so it re-establishes that id via `withParentScope(__scopeId,
   ...)` just for the row's template evaluation, so the row's `bf-h` matches
   the same `__scopeId` the static init's own `qsaChildScopes` selector
   interpolates.

   **Root distinction.** A demo's SSR entry root (mounted as a slot of
   a page but the target of its own client-side init) carries `bf-r`,
   so e2e locators of the form `[bf-s^="FooDemo_"][bf-r]` address only
   the demo's root, not an internal child scope that happens to share
   the bf-s name prefix.

   **`~` child prefix (removed).** Earlier shape iterations distinguished
   root vs child scopes by a `~` value prefix on bf-s. All three adapters
   (Hono, Go-template, mojolicious) and the client runtime
   (`createComponent` / `renderChild`) now emit only the bare scope id;
   slot identity moves to (bf-h, bf-m) and root distinction moves to bf-r.
   The runtime no longer checks for the `~` prefix anywhere.

   **Fragment scope comments (#2289).** A component whose root is a JSX
   Fragment has no element to carry `bf-s`, so its scope is declared by a
   comment pair around its top-level siblings:

   ```
   <!--bf-scope:<scopeId>[|h=<host>|m=<slot>][|<propsJson>]--> …roots… <!--bf-/scope:<scopeId>-->
   ```

   The `h=`/`m=` segment is present on slot-attached children only (the
   comment-scope analogue of the (bf-h, bf-m) pair); the client runtime
   resolves such children by the `<parentScopeId>_<slotId>` scope id
   (`findCommentChildScope`) so `initChild` delivers live props — the props
   JSON in the marker only carries the JSON-safe subset for walker-owned
   root fragments. The end marker bounds the scope's sibling range
   (`getCommentScopeBoundary`); it is optional for backward compatibility —
   HTML from an adapter runtime that predates it falls back to the
   next-`bf-scope:`-comment / end-of-parent heuristic, which can leak
   queries onto later siblings. Every adapter must emit the pair from the
   same scope id.

   **CSR mirror + the two `comment: true` shapes (#2722).** The client JS
   `ComponentDef` passed to `hydrate()` carries `comment: true` whenever
   `emit-registration.ts`'s `isCommentScope` is true — two IR shapes, not
   one, that a pure CSR mount (`createComponent()`, no SSR) must tell
   apart:
   - `ir.root.type === 'fragment'` (this section's shape) — `ComponentDef`
     additionally carries `fragmentRoot: true`. `materializeComponent`
     (`component.ts`) must generate its OWN scope id (never leave it null)
     and wrap the parsed markup in a matching `<!--bf-scope:-->` /
     `<!--bf-/scope:-->` comment pair — mirroring this section's SSR shape
     exactly, or a nested `renderChild()` call has no parent scope id to
     prefix its own naming with (#1627's random-id fallback kicks in
     instead), diverging from what SSR/hydrate produced.
   - `ir.root.type === 'component'` (root is a single child component
     call, #2649) — no `fragmentRoot` flag. The parsed markup IS the
     child's own already-scoped element; `materializeComponent` must leave
     `scopeId` null rather than stamp or wrap it.

   Conflating the two (treating every `comment: true` def as the second
   shape) is exactly the #2722 regression: a genuine fragment root's CSR
   mount lost its scope id entirely, and every descendant fell back to
   unprefixed random naming instead of matching SSR/hydrate.

2. **Client JS**: Minimal JavaScript for reactivity
   - Uses `createEffect` for reactive updates
   - Event delegation for lists
   - DOM switching for conditionals

---

## IR Schema

The Intermediate Representation (IR) is a pure JSON tree structure. Full type definitions are in `packages/jsx/src/types.ts`.

### Core Node Types

- `IRElement` - HTML/SVG elements with attrs, events, children
- `IRText` - Static text content
- `IRExpression` - Dynamic expressions (reactive or static)
- `IRConditional` - Ternary/logical conditionals (`cond ? a : b`, `cond && a`)
- `IRIfStatement` - Component-level conditional returns (`if (cond) return <A/>; return <B/>`)
- `IRLoop` - Array mapping (.map()), with optional `filterPredicate` and `sortComparator`
- `IRComponent` - Child component references
- `IRSlot` - Slot placeholders

### IRIfStatement

Represents component-level `if`/`else` returns (early returns). Unlike `IRConditional` (inline ternary/logical), `IRIfStatement` is produced when the component function has multiple return statements guarded by `if` blocks.

```typescript
interface IRIfStatement {
  type: 'if-statement'
  condition: string           // JS condition expression
  consequent: IRNode          // JSX for the then branch
  alternate: IRNode | null    // Else branch (another IRIfStatement for else-if, or IRNode)
}
```

SSR renders only the matching branch. Client JS handles all branches and switches at runtime. This means the SSR HTML contains markers from only one branch, while client JS references markers from all branches.

### IRLoop.filterPredicate

When `.filter().map()` chains are detected, the compiler extracts the filter into `IRLoop.filterPredicate`:

```typescript
interface FilterPredicate {
  param: string              // Filter callback parameter (e.g., 't')
  predicate?: ParsedExpr     // Boolean predicate expression
  raw: string                // Original JS source
}
```

`predicate` is always a single boolean expression. A block-bodied predicate
(`t => { const f = filter(); if (f === 'active') return !t.done; return true }`)
is normalized to one via the block → expression fold (#2040): the early-return /
`if` becomes a ternary, then the boolean-context ternary collapses to `&&` / `||`
(`predicateTernaryToLogical`). So adapters lower a block predicate through the
same expression path as `t => !t.done` — there is no separate block-statement
shape to render. A predicate the fold can't normalize (imperative residue) is
refused, and `/* @client */` defers the whole loop to the client.

Adapters should render the filter as a conditional wrapper inside the loop (e.g., `if (condition) { children }`), not by pre-filtering the array. The filter param may differ from the loop param (e.g., filter uses `t`, loop uses `todo`) — adapters must map between them.

### Loop emission shapes (client JS)

The client JS emitter classifies each `IRLoop` into one of four shapes for code generation. All four are variants of a single `LoopPlan` discriminated union (`packages/jsx/src/ir-to-client-js/control-flow/plan/loop.ts`), keyed by `kind`. The unified `buildLoopPlan(ir, opts)` entry in `control-flow/plan/build-loop.ts` is the only public builder — per-variant builders are `@internal` (#1253).

| Shape | Body | `kind` | Client emission |
|---|---|---|---|
| **Static** | array is a constant literal (no signal) | `'static'` | `arr.forEach(...)` for reactive attrs / texts only |
| **Plain** | dynamic array, body is a plain element with no child components and no inner loops | `'plain'` | `mapArray(() => arr, container, keyFn, renderItem)` returning a clone of the template |
| **Component** | dynamic array, body is a single child component (with optional nested child components) | `'component'` | `mapArray(...)` whose `renderItem` calls `initChild` (SSR) or `createComponent` (CSR) |
| **Composite** | dynamic array, body is a plain element that **contains** at least one child component or inner loop | `'composite'` | `mapArray(...)` whose `renderItem` rebuilds the body element and dispatches both component init and inner-loop setup |

"Composite" specifically denotes the *plain-element-with-children* case. A loop whose body is a bare component is **Component**, not Composite — keeping the two separate avoids the historical "composite means two different things" confusion.

Classification predicates are evaluated in this order (mirrors the decision tree in `buildLoopPlan`, validated by `__tests__/loop-plan-classification.test.ts`):

1. `isStaticArray` → `'static'` (wins over every dynamic predicate)
2. `useElementReconciliation` AND (`nestedComponents` OR `innerLoops`) → `'composite'`
3. `childComponent` → `'component'`
4. fallthrough → `'plain'`

`isStaticArray` itself is derived in Phase 1 (`jsx-to-ir.ts`) as `!isSignalOrMemoArray && !isDirectPropArray && !hasFunctionCalls && !objectIteration` — a signal/memo array, a direct prop array, an array expression containing any function call, or an `Object.entries/keys/values(...)` source all force the dynamic `mapArray` family instead. `isDirectPropArray` (`isArrayExprDirectPropRef`) recognizes a destructured prop name, a `props.<key>` member access on the whole props object, or — since #2724 — a bare `x = y` local-alias-hop chain (any number of hops, `const` or `let`, resolved via the shared `resolveAliasOrigin` walker in `props-binding.ts`) whose origin is one of those two shapes, including a hop that lands on the WHOLE props object itself (`const p = props; p.items`). The hop set a walk may enter (`propAliasHopCandidates`) excludes a module-scope constant (a module constant cannot be an alias of any one component instance's props) and any name currently shadowed by an active loop/callback binding (`rows.map((list) => list.map(...))`'s inner `list` must resolve to the outer loop's row value, never an unrelated same-named outer `const list = ...` it shadows) — but NOT a `let` declaration: `isStaticArray` treats "not recognized as prop-derived" as static, so excluding `let` would silently reproduce #2724's own bug for a `let`-aliased prop array instead of landing on the safe side (Go's independent BF101 gate already screens the one case where a stale reassigned-`let` value could otherwise mislead the Go-specific `isPropDerivedArray` reader). A local constant whose initializer is anything else (a `??` default, a computed expression, an object literal) also stays outside this widening and keeps the loop static. The same boolean also becomes `IRLoop.isPropDerivedArray`, which the Go adapter reads to decide whether a nested component's field is literally the loop's prop-sourced data — this is why the alias resolution stays structural (`ConstantInfo.parsed`), not the regex-based `isPropsReference`/`isSignalOrMemoReference` chain walk used elsewhere in this file: a false positive here would misclassify DSL-adapter codegen, not just add a redundant `mapArray`. The same-name terminal check reads the names the props parameter actually binds (`boundPropNames`, built by `boundPropLocalNames` in `props-binding.ts`) rather than `ctx.patterns.props` — the latter is a regex-matching set that, for a whole `(props: Props)` parameter, includes every type-member name whether or not it's bound to anything, which is right for its own `props.<key>` regex use but was wrong reused here (#2835): an unrelated identifier that happened to share such a name resolved as prop-derived by coincidence.

### Loop param evaluation contexts

A user-written `item.x` reference inside a loop body is rewritten differently depending on which of four contexts the expression lands in:

| Context | `item` is... | Why |
|---|---|---|
| Hydrate / insert template (SSR-side string) | plain value | Template renders once from initial state; no per-tick re-eval |
| Dynamic loop renderItem (`mapArray` callback) | signal accessor `item()` | mapArray passes a signal so per-item updates re-fire fine-grained effects |
| Nested dynamic loop renderItem | both parent and self are accessors | Same reason; outer accessor wraps the array expression of the inner mapArray |
| Static array forEach | plain value | Array is constant; no reactivity needed |

`wrapLoopParamAsAccessor(expr, param, paramBindings)` is the single function that performs the rewrite for the renderItem contexts. Destructured params (`map(({ id, name }) => ...)`) are rewritten to `__bfItem().id` etc. via `paramBindings` (#951).

### Metadata

Each compiled component includes metadata:
- Component name and export info
- Type definitions (interfaces, type aliases)
- Signals, memos, effects
- Imports and local functions/constants
- Props type information

---

## Adapter API

Adapters transform IR into backend-specific templates.

```typescript
interface TemplateAdapter {
  name: string
  extension: string

  generate(ir: ComponentIR): AdapterOutput

  // Node rendering
  renderElement(element: IRElement): string
  renderExpression(expr: IRExpression): string
  renderConditional(cond: IRConditional): string
  renderLoop(loop: IRLoop): string
  renderComponent(comp: IRComponent): string

  // Optional: type generation for typed languages
  generateTypes?(ir: ComponentIR): string | null
}
```

### Adapter Responsibility Boundary

Adapters are **template-language specialists**: they lower IR into a target-language template carrying hydration markers (`bf-s`, `bf`, `bf-c`, etc.). They also own the module-structure decisions specific to their target language, returned as `AdapterOutput.sections`:

```typescript
interface TemplateSections {
  imports: string         // import / use / require statements
  types: string           // type definitions (TS-only adapters)
  component: string       // component definition incl. `export` keyword
  defaultExport: string   // module-level default-export statement, if any
  moduleConstants?: string // module-scope constants (e.g. SSR context bindings)
}
```

The compiler concatenates the sections — it does **not** parse the assembled template or post-process it (no regex passes over emitted output). Adapters that re-emit user imports into the template (Hono) call the shared `rewriteImportsForTemplate(imports, this.clientShimSource)` helper themselves to rewrite `@barefootjs/client` to the adapter's SSR shim; adapters whose templates never carry imports (Go, Mojo) consult `metadata.imports` only for diagnostics like BF103.

What stays in the compiler:
- **Multi-component assembly** — merging imports and module-constants across siblings in one source file.
- **Client JS generation** — handled by `ir-to-client-js`, adapter-independent.

**Rationale:** Module structure is target-language-specific (`export function` for TS, `{{define "X"}}` for Go templates, none for Mojo `.html.ep`). Centralising it in the compiler forced regex-based postprocess that drifted with adapter output; pushing it into the adapter via typed `sections` makes the contract type-checked instead of convention-enforced.

```
IR (ComponentIR)
 ├─→ Adapter: target template + structured sections (imports, types, component, default-export, module-constants)
 ├─→ Compiler: multi-component assembly across sections
 └─→ ir-to-client-js: Client JS (adapter-independent)
```

The **hydration contract** between template and client JS is maintained through shared marker constants (`bf-s`, `bf`, `bf-c`). The marker conformance suite (`packages/adapter-tests/src/marker-conformance.ts`, wired up by `runAdapterConformanceTests`) compiles every shared JSX fixture through the adapter under test and asserts the slot / conditional / loop ids the template emits match the set the IR computed. Each adapter package runs the suite against its own adapter; the shared layer never imports concrete adapters, so adding a new one is a one-package edit.

#### Per-kind Emitter pattern (drift defence)

Each adapter used to write its own `switch (kind)` over `ParsedExpr`,
`IRNode`, and `AttrValue`, with its own `default` arm. A new kind
landing in core silently fell through in any adapter that hadn't been
updated. The fix is a **single shared dispatcher per kind-space, with
an `assertNever` default**, paired with a per-adapter visitor
interface:

| Kind-space | Dispatcher | Visitor interface |
|---|---|---|
| `ParsedExpr.kind` | `emitParsedExpr` | `ParsedExprEmitter` |
| `IRNode.type` | `emitIRNode<Ctx>` | `IRNodeEmitter<Ctx>` |
| `AttrValue.kind` | `emitAttrValue` | `AttrValueEmitter` |

Adding a new kind in any of those unions is now a TS compile error in
every adapter that hasn't extended its emitter. Per-kind method names
carry an `emit` prefix (`emitElement`, `emitLiteral`, …) so a single
adapter class can implement multiple visitor interfaces without name
collisions.

`IRNodeEmitter` is generic over `Ctx` because IRNode rendering is
render-context-sensitive in ways the IR itself doesn't record
(root-of-client-component, inside-loop, etc.); each adapter declares
its own `Ctx` shape. `AttrValueEmitter` separates element-attribute
emission from component-prop emission via two emitter instances per
adapter — same context separation that used to be a `switch` on the
caller side.

#### Capability flags

A few adapter capabilities differ by target runtime and are surfaced
on the `TemplateAdapter` interface as **optional** members rather than
hidden in an inheritance branch — so an adapter's lack of a capability
is type-visible:

- `clientShimSource?: string` — module specifier for the SSR shim of
  `@barefootjs/client`. Set on adapters whose template runtime can
  execute JS (Hono); left `undefined` on DSL adapters that strip
  client-package imports outright.
- `acceptsTemplateCall?: (calleeName) => boolean` — broad-acceptance
  predicate for adapters whose template runtime is a full JS engine
  (Hono). DSL adapters leave this `undefined` and rely on the explicit
  `templatePrimitives` map.
- `templatePrimitives?: TemplatePrimitiveRegistry` — identifier-path
  callees the adapter promises to render in template scope
  (`JSON.stringify`, `Math.floor`, …). V1 scope (#1187): fixed at
  adapter-construction time, so it can only ever list well-known JS
  builtins the adapter author anticipated — never a component's own
  (unknown in advance) imports. #2069 adds a separate, orthogonal
  acceptance path for that case instead of widening this map:
  `relocate.ts`'s `isCallAcceptedByAdapter` also consults
  `RelocateEnv.loweringMatchers` — every `LoweringPlugin` registered via
  `registerLoweringPlugin` (`packages/jsx/src/lowering-registry.ts`, #2057),
  bound once per component from its real import list
  (`prepareLoweringMatchers`). A plugin recognises a bespoke user-imported
  helper structurally (by import + call shape), so `const serialized =
  customSerialize(props.config)` inlines into the client template even
  though `customSerialize` was never in any adapter's `templatePrimitives`.
  One-hop alias resolution (`const fmt = customSerialize; fmt(x)`) is part
  of the same #2069 change — see `RelocateEnv.aliasTargets` in
  `relocate.ts`.
- `generateSignalInitializers?(ir, body): string` — SSR declaration
  block for the user's reactive bindings (signals, memos,
  locally-declared functions/constants). Implemented by JS-runtime
  adapters via the `JsxAdapter` base class; **deliberately left
  undefined** on DSL adapters (Go, Mojo) because their target
  languages never declare reactive bindings inside the template body —
  values reach the template via target-language-native mechanisms
  (Go struct fields, Mojo stash).

`JsxAdapter` is an internal helper base class that JS-runtime adapters
(Hono, TestAdapter) extend for shared TS-output utilities (signal-init
generation, import-specifier formatting). DSL adapters extend
`BaseAdapter` directly. The contract is at the `TemplateAdapter`
interface level; `JsxAdapter` is purely code reuse.

### Available Adapters

- **HonoAdapter** (`@barefootjs/hono`) - Generates hono/jsx compatible TSX
- **GoTemplateAdapter** (`@barefootjs/go-template`) - Generates Go html/template files
- **MojoAdapter** (`@barefootjs/mojolicious`) - Generates Mojolicious EP template files (.html.ep)
- **ErbAdapter** (`@barefootjs/erb`) - Generates ERB (Ruby) template files

### Implementing a New Adapter

When implementing a new adapter, handle these concerns in addition to the basic `TemplateAdapter` interface:

#### ParsedExpr Evaluator Semantics

> Status: contract defined (issue [#2018](https://github.com/piconic-ai/barefootjs/issues/2018), Track A). Go (`bf.go`) and shared Perl (`BarefootJS::Evaluator`) implementations land in Tracks B / C.

Templates carry ordinary expressions structurally and lower them to **template-native** syntax — that is unchanged, and the evaluator described here is **not** a general expression engine. The one place a template genuinely cannot express the source is a **higher-order callback body**: `reduce` / `sort` / `map` / `filter` / `find` `(…) => expr`. A template cannot hold a lambda in expression position, which is *why* the adapter historically special-cased these callbacks into fixed shapes (`bf_sort`'s comparator catalogue, `bf_reduce`'s `+`/`*` fold with an `acc`-canonical form). This evaluator replaces that ad-hoc list: each backend runtime carries the callback **body** as a `ParsedExpr` subtree and **evaluates** it against an environment.

This subsection pins the evaluator's contract so the backends stay byte-isomorphic. The semantic source of truth is the JS reference evaluator at `packages/adapter-tests/vectors/eval-reference.ts`; the cross-language golden vectors are `eval-vectors.json` (generated from `eval-cases.ts`, consumed by the Go, Perl, Python, and Ruby harnesses).

**The environment.** Evaluation is against a flat map of names to values: the higher-order parameters (`acc`, `item`, and the second `sort` operand) plus any captured free variables (outer `const` / signal references). A reference to a name not in the environment is **refused** (the callback is not a closed pure expression).

**Value domain.** JSON-shaped values: IEEE-754 number, string, boolean, null, array, object. There is no `undefined` — a missing object field and an out-of-range array index both read as **null** (the backends' single absent value). Numbers are full IEEE-754 doubles, so a coercion or division can yield a **non-finite** value: `Number("x")` and `0/0` produce `NaN` (always falsy, and `NaN !== NaN`); `1/0` produces `Infinity`. In `eval-vectors.json` a non-finite EXPECT is carried with the reserved `{"$num": "NaN" | "Infinity" | "-Infinity"}` sentinel — the same encoding the helper vectors use (spec/template-helpers.md) — so backend harnesses match against it rather than a literal number.

**Accepted node kinds** (any other kind in a callback body — `higher-order`, an `array-method` outside the catalogue below, a standalone `arrow`, etc. — is refused):

| Kind | Semantics |
|---|---|
| `literal` | the literal value |
| `identifier` | environment lookup; an unbound name is refused |
| `binary` | `+` `-` `*` `/` `%`, relational `<` `<=` `>` `>=`, strict `===` `!==` (see below) |
| `unary` | `!` (logical not), `-` (numeric negate), `+` (numeric coerce) |
| `logical` | `&&` `\|\|` `??` — short-circuit, **operand-returning** (not coerced to boolean) |
| `conditional` | ternary; the test uses JS truthiness; only the taken branch is evaluated |
| `member` | `obj.field` → field or null; `.length` on a string/array (including the array a nested `.map`/`.filter` below produces); reading a field of null is refused |
| `index-access` | `obj[i]` → array element (integer, in-range, else null) or object field by string key |
| `template-literal` | string parts verbatim; expression parts coerced via ToString |
| `array-literal` / `object-literal` | element/property values evaluated left-to-right; an `object-literal` `spread` entry (#2696 Step 2, `{ ...t, editing: false }`) evaluates its source and shallow-merges the result's own keys — a non-object result (including a null/undefined JS spread source) is a no-op — with LATER entries winning on a shared key, in source order (so `{ ...t, k: v }` and `{ k: v, ...t }` differ in which value survives) |
| `call` | **allowlisted builtins**: `Math.max` / `Math.min` / `Math.abs` / `Math.floor` / `Math.ceil` / `Math.round`, and `String` / `Number` / `Boolean`. **Or** a nested `.map(cb)` / `.filter(cb)` callback call (#2094) — syntactically a `call` whose callee is `<recv>.map`/`<recv>.filter` and whose first argument is an `arrow` (the SAME shape `asCallbackMethodCall` recognizes for the top-level dispatch, and the shape `eval-vectors.json`'s golden corpus itself carries — there is no separate wrapper kind). `cb`'s body is itself in this subset (recursively; nesting is unbounded) and its params are plain identifiers (1-param `item`, or 2-param `(item, index)` — both supported); `map` keeps one result per element, `filter` keeps the elements whose body evaluates truthy. This is what makes `x => x.tags.filter(t => t.active).length > 0` and `posts.flatMap(p => p.tags.map(t => '#' + t)).join(' ')` serializable. Any other callee (a bare function, a non-map/filter method, a computed builtin) is refused. |
| `array-method` (`includes`, `join`) | `x.includes(y)` — array receiver: SameValueZero membership (`===`, except `NaN` equals itself); string receiver: substring search (ToString'd needle); any other receiver type: `false`. `x.join(sep?)` (#2094) — elements ToString'd and joined (default separator `,`; a null/undefined element ToStrings to the empty string, matching JS). Every other `array-method` (`slice`, `flat`, `sort`, `reduce`, a nested `.some`/`.find`/`.every`, …) is refused — including `.map`/`.filter` themselves, which are NOT `array-method` nodes at all (see the `call` row above). |

**`.length` on a string — astral-character caveat (#2196).** JS `String.prototype.length` counts UTF-16 code units. Every backend evaluator (Go, Perl, Ruby, Python, PHP, Rust) instead counts Unicode **codepoints**, which agrees with JS for any BMP-only string (Level 1, #2196) but diverges on **astral** characters (emoji, CJK extension ideographs, etc.) — JS counts 2 code units per astral scalar, every backend counts 1 codepoint. E.g. `"😀".length` is `2` in JS, `1` on every template adapter. Full UTF-16 parity (Level 2) is tracked but not yet implemented; until then, keep `.length` operands ASCII/BMP in evaluator contexts or precompute the length in JS for astral-sensitive cases. (The `len` template helper — spec/template-helpers.md — has the same caveat, scoped there to its "ASCII domain" note.)

**Evaluation order.** Strict left-to-right. Operands are evaluated before the operator is applied, except for the short-circuiting forms (`&&`, `||`, `??`, and the ternary), which evaluate the right/branch operand only when reached.

**Coercion (the literal JS rules — not the divergent `bf->string` / `bf_reduce` helper conventions):**
- *ToNumber*: number → itself; boolean → 1 / 0; null → 0; string → trimmed parse (empty → 0, non-numeric → NaN).
- *ToString*: string → itself; number → JS number-to-string; boolean → `"true"` / `"false"`; null → `"null"`.
- *ToBoolean* (truthiness, used by `!`, `&&`, `||`, ternary): the JS falsy set is `false`, `0`, `NaN`, `""`, `null`. Everything else is truthy — notably the string `"0"`, an empty array, and an empty object.

**Operator details:**
- `+` is overloaded exactly like JS: if either operand is a string, both are ToString'd and concatenated; otherwise both are ToNumber'd and added. `-` `*` `/` `%` are always numeric.
- Relational `<` `<=` `>` `>=` follow JS Abstract Relational Comparison: if **both** operands are strings, compare by code unit (case-sensitive — uppercase sorts before lowercase); otherwise ToNumber both (a NaN operand makes the comparison false).
- Equality is **strict only** (`===` / `!==`): equal type and value, no coercion; a non-primitive operand is refused. Loose `==` / `!=` and bitwise/shift operators are deliberately **out of the subset** (their coercion is hard to keep byte-isomorphic).
- `&&` returns its left operand when that is falsy, else the right; `||` returns its left when truthy, else the right; `??` returns its left unless the left is null. All three return the operand value, not a coerced boolean.
- `Math.round` rounds a half **toward +Infinity** (`2.5 → 3`, `-2.5 → -2`), matching the existing `round` helper rather than Go's `math.Round` (which rounds half away from zero).

**Deliberate exclusions for isomorphism.** Locale-sensitive operations are not in the subset — most importantly `String.prototype.localeCompare`, whose ICU collation cannot be guaranteed byte-equal across JS / Go (`golang.org/x/text/collate`) / Perl (`Unicode::Collate`). This is the same barrier already documented for the `bf_sort` `string` key (see "Sort comparator follow-ups" under Known limitations); string ordering inside a comparator must use relational `<` / `>` (code-unit order), and non-ASCII relational comparison is a known divergence region.

**Refusal.** A callback body using anything outside this subset (an unaccepted node kind, operator, builtin, or an unbound identifier) is **unsupported** and surfaces **BF101** upstream, with `/* @client */` as the escape hatch — exactly as the off-catalogue `.reduce` does today. The evaluator is **growing-only**: widening the subset adds vectors and never removes a previously-accepted shape.

**Nested-callback widening (#2094).** Before this widening, any `array-method` other than 1-arg `includes` refused, and a body containing a nested `arrow` (a callback-inside-a-callback, e.g. `x => x.tags.filter(t => t.active).length > 0`) always refused too — every adapter without a bespoke structural fallback surfaced BF101. `.map(cb)` / `.filter(cb)` (via the `call` row) and `.join(sep?)` (via the `array-method` row) are now in the accepted-node-kinds table above; a nested `.some` / `.find` / `.every` / `.sort` / `.reduce` / `.flat` / `.flatMap` callback body still refuses (`asCallbackMethodCall` recognizes the call shape for all of them, but only `map`/`filter` are re-emitted — everything else falls through to the generic non-builtin-callee refusal). Serialization is shared across every backend (`toEvalNode` in `packages/jsx/src/expression-parser.ts`) and deliberately reuses the ordinary `call`/`member`/`arrow` node shape (not a bespoke wrapper) so it matches what `eval-vectors.json` already carries for a nested `.map`/`.filter` (that corpus stores the genuine `ParsedExpr` `parseExpression` produces, unfiltered by `toEvalNode`). The RUNTIME evaluation of the new node shapes is implemented in all six backends — Go (`eval.go`, the reference), Perl (`BarefootJS::Evaluator`, shared by Mojolicious and Xslate), Ruby, Python, PHP, and Rust — with the #2094 eval-vector cases pinning cross-backend parity (a non-array receiver for a nested `.map`/`.filter` evaluates to the backend's null, never an empty array).

#### Child Component Rendering

Child components produce `IRComponent` nodes. The adapter emits a call to the runtime's child-render mechanism (e.g., `render_child('name', prop => val)`). Key rules:

- **Skip `onXxx` callback props** — Event handler props (names matching `/^on[A-Z]/`) are client-only and should be omitted from SSR output.
- **Pass `_bf_slot` for slotted children** — A component derives its scope id from `{parentScope}_{slotId}` (`_bf_slot`) UNLESS it is a loop item root — the DIRECT root of a `.map()` row (`IRComponent.loopItemRoot`, set once in `jsx-to-ir.ts`'s loop builder). A loop item root owns its own per-row identity and gets the `{ChildName}_{random}` pattern instead; a component nested BELOW the row root (e.g. `<li><Badge/></li>`) still derives from its slot like any other slotted child (#2444). Every backend — each DSL adapter, Hono, and the CSR template emitters — consults the single shared predicate `derivesScopeFromSlot()` (`packages/jsx/src/adapters/child-scope.ts`) for this decision instead of an "am I inside a loop" flag, which can't distinguish a row root from a nested descendant.
- **`scriptBaseName` for in-file children** — Non-default-export components in the same file should register the default export's `.client.js` file, not their own.

#### `bf-p` Props Serialization

Components with client-side interactivity need initial props serialized in `bf-p` attribute for hydration. The JSON must contain data the client JS needs to initialize signals (e.g., `initialTodos`, `variant`).

**Encoding caution:** For non-JS backends, ensure the JSON is a character string (not byte string) when embedded in templates. In Perl, use `to_json` (character string) instead of `encode_json` (byte string) to prevent double UTF-8 encoding.

#### IRIfStatement (Conditional Returns)

When `ir.root.type === 'if-statement'`, the adapter must render the if/else branches. The root node is not a standard element — it requires special handling before `renderNode()`.

#### Filter Predicate in Loops

When `IRLoop.filterPredicate` is present, wrap loop children in a conditional:

```
for each item in array:
  if (filterCondition(item)):
    render children
```

A block-bodied filter is normalized to a single boolean `predicate` expression upstream (#2040; see *IRLoop.filterPredicate*), so adapters render it through the same `ParsedExpr` path as an expression-bodied predicate — there is no separate per-adapter block-condition renderer (the former `renderBlockBodyCondition` / return-path collection was retired).

The filter predicate uses a `ParsedExpr` AST (not raw string). Adapters must implement recursive `ParsedExpr` → target language conversion for:

| ParsedExpr kind | Purpose |
|---|---|
| `identifier` | Variables, filter params |
| `literal` | String, number, boolean values |
| `member` | Property access (`t.done`) |
| `call` | Signal getter calls (`filter()`) |
| `binary` | Comparisons (`===`, `>`) — handle string vs numeric comparison |
| `unary` | Negation (`!`) — mind operator precedence in target language |
| `logical` | `&&`, `\|\|` |
| `higher-order` | `filter()`, `every()`, `some()` on arrays. `.filter(Boolean)` synthesises an identity-truthy predicate (#1443). |
| `array-literal` | `[a, b]` source for higher-order chains (e.g. registry Slot's `[a, b].filter(Boolean).join(' ')`, #1443). Mojo lowers to `[$a, $b]` array refs; Go templates lower to `bf_arr a b`. |

#### Standalone Higher-Order Expressions

Expressions like `todos().filter(t => !t.done).length` appear as `IRExpression` nodes (not inside loops). Use `parseExpression()` from `@barefootjs/jsx` to get the `ParsedExpr` AST, detect `higher-order` kind, and convert to the target language's equivalent (e.g., Perl `grep`, Go `bf_filter` helper).

#### Character Encoding

For non-JS backends, ensure proper UTF-8 handling:

- Template output should be character strings, with encoding handled by the framework's output layer
- JSON embedded in HTML attributes (`bf-p`) must not be double-encoded
- Add `<meta charset="UTF-8">` to HTML layouts

---

## Directive Model

BarefootJS uses a **two-tier** directive model: any component file that
opts in carries `"use client"`; every other component file is treated as
a **server** component. There is no `"use server"` directive. The rules
are one-way:

| From                        | To                          | Allowed? |
|-----------------------------|-----------------------------|----------|
| server → `"use client"`     | render a client island       | ✓        |
| server → server             | static composition           | ✓        |
| `"use client"` → `"use client"` | import as JSX component  | ✓        |
| `"use client"` → server     | import as JSX component      | ✗ (BF003) |

Type-only imports (`import type { … } from …`) and pure utility-function
imports (bindings not used as JSX tags) are not constrained by BF003 —
the rule is scoped to JSX-rendered component bindings, since they are
the surface that carries hydration-marker emission and the surface the
client bundle re-instantiates.

### Why two tiers, not three

A three-tier model (`client` / `universal` / `server-only`) was
considered and rejected. The failure modes are asymmetric:

| Default                     | Forgetting the marker leads to                                |
|-----------------------------|---------------------------------------------------------------|
| **server, opt-in client** (current) | `createSignal` / event-handler usage without `"use client"` → BF001 fires at compile time |
| universal, opt-in server-only       | server code transitively bundled into the client → **silent leak** at runtime |

The current default is loud on every failure path; the alternative is
silent on the failure path that matters most (secrets / DB / Node API
reaching the browser). BarefootJS prefers the safer default.

### Why `"use client"` is cheap here

Unlike frameworks where `"use client"` ships a whole component bundle,
the BarefootJS compiler already emits a client JS template for every
component reachable from the build entry — the directive flips which
runtime-init path the compiled output takes, not whether the output
exists. For stateless presentational components the emitted `init` is
near-empty (no signals, no event handlers, no captured locals), so the
bundle-size cost of marking the entire UI-kit registry `"use client"`
is bounded and measured in hundreds of bytes per component.

### BF003 enforcement scope

BF003 fires when:
- The importing file carries `"use client"`, **and**
- The imported binding is used as a JSX tag (PascalCase opener) in the
  same file, **and**
- The import specifier is a relative path (`./foo`, `../foo`) that
  resolves to an on-disk file, **and**
- The resolved file does not carry `"use client"`.

Aliased imports (`@/...` and other tsconfig-paths shapes) and npm-package
specifiers are not currently resolved at this layer; ensuring the
boundary on those routes remains the responsibility of the framework
registry (every registry component ships `"use client"`) and of the
shared-program-aware build pipeline.

**Known limitation — JSX-tag shadowing.** The "used as a JSX tag" check
matches identifier names lexically, not via symbol resolution. If a
local binding shadows an imported component name inside an inner scope
(`function Foo({ Label: NewLabel }) { return <NewLabel /> }`) and the
import name still appears as a JSX tag elsewhere, BF003 keys off the
outer reference and can fire on a binding that isn't actually used as a
component at runtime. Closing this would require feeding the TypeChecker
symbol of each JSX tag through to the resolver; tracked as a follow-up.

---

## Error Codes

| Code | Description |
|------|-------------|
| BF001 | Missing 'use client' directive |
| BF003 | Client component importing server component |
| BF011 | Module-level reactive declaration without `/* @client */` |
| BF013 | Reactive primitive (createSignal/createMemo/createEffect/onMount/onCleanup/createSearchParams) called through a namespace import of `@barefootjs/client` (`import * as ns from '@barefootjs/client'`) the analyzer could not resolve — only fires when no shared `ts.Program` was supplied (#2771) |
| BF021 | Unsupported JSX pattern (e.g., filter predicate or sort comparator too complex for template compilation; method call on a host rich-typed prop with no catalogued lowering, #2273; a ternary or array literal wrapping JSX at a non-`children` component prop position, #2667) |
| BF023 | Missing `key` attribute in `.map()` loop — root JSX element has no `key` prop |
| BF024 | Missing `key` attribute in nested `.map()` loop — inner loop root JSX element has no `key` prop |
| BF025 | Unsupported destructure shape in `.map()` callback (computed property key — rest elements have been supported since #1244/#1309) |
| BF027 | Component's return statement is a bare identifier naming a local `const`/`let` already proven to hold JSX (`const __root = <jsx/>; return __root`) — return position does not resolve identifiers through their initializer the way JSX-child position does, so this shape produced zero output and zero diagnostics before this code existed (#2720) |
| BF101 | An adapter has no template-language lowering for the expression (an off-catalogue array/string method, a nested higher-order callback, or a loop array bound to a computed component-scope local) — raised only by non-JS template adapters (Go, Mojo, Xslate, Twig, ERB, Blade, Jinja, MiniJinja); a JS-runtime adapter (Hono, CSR) executes the expression verbatim instead. See "Unsupported Expressions (BF101)" below. |
| BF043 | Props destructuring breaks reactivity |
| BF044 | Signal/memo getter passed without calling it |
| BF048 | `'use client'` file references a same-file sibling component that produced no template — typically a multi-return JSX `switch`/`if`-`else` dispatch, which only #932's non-client verbatim-preservation path can compile (#2556) |
| BF049 | A prop typed as a JSON-unsafe host rich type (`Map`, `Set`, `BigInt`, …) is used by this component's own client code (a handler, an effect), regardless of whether a method is called on it — BF021's sibling for the "client-side use" shape BF021's template-only walk can never reach, since the prop still can't survive the `bf-p` JSON hydration boundary (#2643) |
| BF060 | Reactive binding (signal/memo getter) referenced from template scope (staged-IR; opt-in diagnostic) |
| BF061 | Init-scope local referenced from template scope (staged-IR; opt-in diagnostic) |
| BF062 | AwaitExpression in template scope (staged-IR; reserved for Phase 1 dispatcher) |

### Error Format

```
error[BF001]: 'use client' directive required for components with createSignal

  --> src/components/Counter.tsx:3:1
   |
 3 | import { createSignal } from '@barefootjs/client'
   | ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
   |
   = help: Add 'use client' at the top of the file
```

### Suppressing Warnings

Use `@bf-ignore` comment directive to suppress specific warnings:

```tsx
// @bf-ignore props-destructuring
function Component({ checked }: Props) {
  // Warning suppressed for this component
}
```

**Available rules:**

| Rule ID | Error Code | Description |
|---------|------------|-------------|
| `props-destructuring` | BF043 | Props destructuring in function parameters |

### Unsupported Expressions (BF021)

When a filter predicate or sort comparator cannot be compiled to a marked template, the compiler emits a **BF021** error. This replaces the previous silent fallback to client-only evaluation.

**Filter predicates**: Complex predicates (nested higher-order methods, `typeof`, etc.) trigger BF021.

```
error[BF021]: Expression cannot be compiled to marked template: Higher-order method 'some()' with complex predicate.

  --> src/components/TodoList.tsx:9:30
   |
 9 |             {todos().filter(t => t.items.some(i => i.done)).map(t => (
   |                              ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
   |
   = help: Add /* @client */ to evaluate this expression on the client only
```

**Sort comparators**: The comparator body is parsed into a structured `SortComparator` (a `keys: SortKey[]` list). A body is split on top-level `||` into one comparison key per operand (multi-key tie-breaks), and each operand (leaf) must match one of the accepted shapes below. Comparators outside the catalogue — multi-statement / local-var block bodies and `localeCompare(b, locale, opts)` — trigger BF021.

**Function-reference comparators** (`sort(myCmp)`, #2090): a bare identifier callback is resolved ONE HOP through the same scope machinery the compiler uses for cva-style `className` consts — a `const myCmp = (a, b) => …` or `function myCmp(a, b) {…}` declared anywhere in the same file (module scope or component scope; a component-scope declaration shadows a module-scope one of the same name) — and the resolved arrow is fed through the identical catalogue below, so a resolved reference compiles byte-for-byte like an inline comparator. Two residual refusals still trigger BF021:

```
error[BF021]: Expression cannot be compiled to marked template: Sort comparator 'myCmp' could not be resolved to a local function — declare it in the same file or inline it.

  --> src/components/List.tsx:9:30
   |
 9 |             {items().sort(myCmp).map(t => (
   |                           ^^^^^
   |
   = help: Add /* @client */ to evaluate this expression on the client only
```

— `myCmp` is imported, a prop, or otherwise has no local `const`/`function` binding in the file (alias chains like `const c2 = c1` are also NOT followed — only one hop is resolved); or the name is bound BOTH as a const and as a `function` declaration (only possible across scopes; `FunctionInfo` carries emission placement, not lexical scope, so the ambiguity refuses loudly rather than guessing which binding the call site sees); or the identifier resolves to a local binding whose body is off-catalogue, in which case the message names the comparator and matches the inline-comparator refusal:

```
error[BF021]: Expression cannot be compiled to marked template: Sort comparator 'myCmp' is not a supported shape.

  --> src/components/List.tsx:9:30
   |
 9 |             {items().sort(myCmp).map(t => (
   |                           ^^^^^
   |
   = help: Add /* @client */ to evaluate this expression on the client only
```

**Supported sort comparator leaves** (each `||`-chainable; reverse the operands or the ternary sign for descending):
- `(a, b) => a.price - b.price` → `numeric` key (`a - b` for primitive arrays)
- `(a, b) => a.name.localeCompare(b.name)` → `string` key (`a.localeCompare(b)` for primitives)
- `(a, b) => a.rank > b.rank ? 1 : -1` → `auto` key (relational ternary; also the 3-way `a < b ? -1 : a > b ? 1 : 0` and leading-tie `a === b ? 0 : …` forms). `auto` compares numerically when both keys parse as numbers, else lexically — the two template adapters share this rule (diverges from JS `<`/`>` only for numeric strings).

**Supported sort patterns**:
- `sort((a, b) => a.price - b.price)` → ascending by `price`
- `toSorted((a, b) => b.priority - a.priority)` → descending by `priority`
- `sort((a, b) => a.price - b.price || a.name.localeCompare(b.name))` → multi-key: `price` asc, ties broken by `name`
- `sort((a, b) => { return a.price - b.price })` → single-`return` block body (unwrapped to the returned comparator)
- `sort(byPrice)` / `toSorted(byPrice)` where `byPrice` is a same-file `const`/`function` comparator (#2090) → resolved one hop, then compiled exactly like the equivalent inline arrow
- `filter(...).sort(...).map(...)` → filter + sort chaining
- `sort(...).filter(...).map(...)` → sort + filter chaining

**Reduce folds (refused with BF101, not BF021)**: unlike the filter/sort shapes above (which surface BF021), an off-catalogue `.reduce` refuses at the adapter layer with **BF101** — the same gate the other unsupported array methods use. `.reduce(fn, init)` is parsed into a structured `ReduceOp` (`{ op, key, type, init }`) and lowered via `bf_reduce` (Go) / `bf->reduce` (Mojo). The catalogue is the arithmetic-fold family only — anything outside refuses with BF101 (`/* @client */` is the escape hatch):

- `arr.reduce((acc, x) => acc + x, 0)` → numeric sum over self
- `arr.reduce((acc, x) => acc + x.field, 0)` → numeric sum over a struct field
- `arr.reduce((acc, x) => acc * x.field, 1)` → numeric product
- `arr.reduce((acc, x) => acc + x.field, '')` → string concatenation (string init flips the `+` fold to concat)
- single-`return` block body (`(acc, x) => { return acc + x.n }`) — unwrapped to the returned expression
- `.reduceRight(fn, init)` — the same catalogue folded right-to-left. Only observable for string concatenation (`[a, b, c]` → `cba` instead of `abc`); numeric sum / product commute. The fold direction is threaded through to `bf_reduce` (Go, trailing `"<direction>"` operand) / `bf->reduce` (Mojo, `direction => 'left' | 'right'`).

The accumulator must be the binary expression's left operand (`acc + x`, not `x + acc`), the per-item operand must be the item param or a single non-computed field access on it, and the init must be a number or string literal (negative numbers via prefix `-` allowed). Subtraction / division, deep field access (`x.a.b`), object-building reducers (`{...acc, [x.id]: x}`), the 3- / 4-param reducer form, and `.reduce(fn)` / `.reduceRight(fn)` without an initial value all refuse with BF101. Two narrow divergences from the JS / CSR path (both mirroring the `bf_sort` "auto" caveat): float stringification differs for inexact binary fractions (e.g. 0.1 + 0.2), and numeric-*string* keys fold numerically on the template adapters while JS `+` string-concatenates them. Genuine numbers — the common SSR case — agree across all three adapters.

**Suppression with `@client`**: If the developer intentionally wants client-only evaluation, add `/* @client */` before the expression. This suppresses the BF021 error:

```tsx
{/* @client */ todos().filter(t => t.items.some(i => i.done)).map(t => (
  <li>{t.name}</li>
))}
```

When `@client` is present, the compiler skips template generation for that expression without emitting an error.

This applies equally to **attribute bindings**, not just child/text expressions: `data-x={/* @client */ pred(item)}` defers the attribute to hydration. The adapters omit a `clientOnly` attribute from SSR (so the unsupported-expression lowering is never reached → no BF101/BF102), and the client runtime sets/patches it in a mount effect. This makes the BF102 remediation accurate for components whose reactive state is expressed purely as attributes (the Calendar case in #1966 / #1467).

**The client-side mount effect for `/* @client */` (and the reactive-attribute re-sync effect, `@client` or not) routes a CATALOGUED rich-type method call through the same runtime helper the static template uses (#2640, #2641).** `.toISOString()` (#2292) and an explicit-locale `.toLocaleDateString(...)` (#2324) have real cross-adapter lowerings, so BF021 never fires on them — but until #2640/#2641, `emitClientOnlyExpressions` and `emitReactiveAttributeUpdates` (`ir-to-client-js/emit-reactive.ts`) spliced the call's source text verbatim into the emitted `createEffect`, exactly the "BF021 is adapter-UNIFORM" hazard described below: the receiver still crosses `bf-p` as a de-riched JSON value, so a catalogued call re-evaluated there threw the same `TypeError` an uncatalogued one would. `makeCataloguedCallLowerer` (same file) now binds the `date`/`formatDate` rewrite once per emit pass and both sites apply it before splicing — the fix generalizes `emitDynamicTextUpdates`'s original (#2292) rewrite, which stays the reference precedent. An UNCATALOGUED call (e.g. a zero-arg `.toLocaleDateString()`, or any `Map`/`Set` method) still splices verbatim after this fix — by design, this is exactly the `/* @client */`-is-your-own-responsibility territory #2639's diagnostic teaches the explicit `new Date(...)` revival wrapper for.

### Method calls on host rich-typed props (BF021, #2273)

A method call on a prop typed as a built-in **host rich type** — `Date`, `Map`, `Set`, `WeakMap`, `WeakSet`, `URL`, `URLSearchParams`, `RegExp`, `Promise`, `Error`, `Symbol`, `BigInt`, `Function` — has no catalogued lowering in any adapter: there is no structural IR representation for `Date.prototype.toISOString` the way there is for a plain object field or an `Array.prototype` method. Left unchecked, such a call used to transliterate verbatim into the target template's own dot-call syntax and die at request time (a Go template method-value panic, a Jinja `AttributeError`, …) — once per adapter, only once someone actually rendered the page. `checkRichTypeMethodCalls` (`packages/jsx/src/rich-type-refusal.ts`) closes that gap at compile time instead, refusing with BF021 as soon as the receiver's declared type is provably one of the host types above:

```
error[BF021]: Expression cannot be compiled to marked template: method '.toISOString()' on prop 'createdAt' of host type 'Date' has no catalogued lowering.

  --> src/components/Post.tsx:3:22
   |
 3 |   return <div>{createdAt.toISOString()}</div>
   |                ^^^^^^^^^^^^^^^^^^^^^^^^
   |
   = help: Pre-compute the value server-side and pass it as a prop. Alternatively, evaluate client-only by {/* @client */ new Date(createdAt).toISOString(...)} — a bare /* @client */ crashes at hydrate because prop 'createdAt' crosses the bf-p boundary as JSON and arrives as a plain string, not a Date instance (#2636).
```

The refusal is deliberately conservative — it only fires when the receiver's type is **provable** from the component's own `propsType` / `typeDefinitions` (a destructured prop, a `props.x` member chain, a loop item's field, with union-of-nullable stripped: `Date | null` → `Date`). Any receiver shape it can't prove a type for — a signal getter's call result (`d().toISOString()`), an untyped or generic-parameter (`T`) receiver, a computed/index access — resolves to "no evidence" and is silently allowed through, never misdiagnosed. Three exemptions:

- **`/* @client */`** — the expression already opts out of SSR lowering, exactly as for the filter/sort BF021 shapes above.
- **A registered lowering plugin claims the call** — `checkRichTypeMethodCalls` checks the same `matchLoweringCall` seam every adapter's call lowering goes through (`lowering-registry.ts`, #2057). Cataloguing a rich-type API (e.g. a `Date.toISOString()` → ISO-string lowering) is a plugin, not a change to this module — see #2274.
- **An in-file type declaration shadows the host name** (`interface Date { … }` in the same file) — the local declaration wins; only a same-file shadow is recognized, not an imported type that happens to reuse the name.

**The escape suggestion never recommends a bare `/* @client */` (#2636).** Every receiver `checkRichTypeMethodCalls` can prove a type for is rooted at `propsType` (see the exemptions above — nothing else resolves), so it always crosses the `bf-p` hydration boundary as JSON with no type-aware revival: a `Date` prop arrives at hydrate as its `toJSON()` ISO string, a `Map`/`Set` as `{}`. A bare `/* @client */` call spliced verbatim against that de-riched receiver throws or silently misbehaves, so `buildSuggestion` (`rich-type-refusal.ts`) offers only two escapes, in `ssrCost`-ascending order: pre-compute the value server-side and pass an already-serializable prop (sound for every host rich type), or — for `Date`/`URL` only, the two types whose `toJSON()` output round-trips through their own one-argument constructor — a `/* @client */` block that explicitly revives the receiver first, `new Date(createdAt).toISOString()` rather than `createdAt.toISOString()`. Every other host rich type's suggestion says so explicitly rather than staying silent about the missing escape. `date-client-revival` is the conformance fixture demonstrating the revival form compiles clean and uniform across adapters; it is `date-method-uncatalogued`'s `escapes` twin.

**A GENERAL typed-prop revival mechanism across the rest of `HOST_RICH_TYPE_NAMES` was evaluated and deferred, not rejected (#2642).** A wire-envelope reviver (`{ $map: [[k,v],...] }`, sniffed by `parseProps`) was rejected on soundness grounds: the type signal would live in the VALUE, so an ordinary user prop that happens to share an envelope's shape would silently misrevive on every adapter, not just ones that emit envelopes — the only sound fix is a user-data escaping rule in all 9 adapters' serializers, which is the real protocol cost, paid by every payload regardless of whether it uses a rich type. If ever built, the sanctioned shape is TYPE-DIRECTED USE-SITE REVIVAL — generalizing `date()` (`packages/client/src/runtime/date.ts`) rather than enriching the wire: plain-JSON canonical shapes per type, with the compiler (which already resolves prop types for BF021) emitting a revival call at each prop's client-JS extraction site. `WeakMap`/`WeakSet`/`Promise`/`Symbol`/`Function` are excluded from that future scope permanently — non-enumerable by spec, not data, or identity-as-semantics, not merely unrevived today. See `JSON_REVIVABLE_RICH_TYPE_NAMES`'s docstring (`rich-type-evidence.ts`) and #2642's decision comment for the full per-type verdict and reasoning.

**BF021 is deliberately adapter-UNIFORM — unlike its sibling BF101 below, it is not a DSL-adapter-only gap that a JS-runtime adapter (Hono, CSR) skips.** The zero-arg `toLocaleDateString()` shape (#2356) is the case that makes this concrete: a Hono carve-out was evaluated and rejected, because "the SSR runtime can evaluate the call" only covers one of three legs a compiled artifact must keep consistent — SSR render, hydrate-init, and CSR re-render. A prop-derived expression compiles to `createEffect(() => { const __val = <expr>; … })` (`ir-to-client-js/emit-reactive.ts`), and `createEffect` runs synchronously on creation, so hydrate-init RE-EVALUATES the expression rather than adopting the SSR text. It evaluates it against a receiver that crossed the `bf-p` JSON hydration boundary with no type-aware revival (`packages/client/src/runtime/hydrate.ts`'s `parseProps`) — a `Date`-typed prop arrives there as its `toJSON()` ISO string, not a `Date` instance — so a carved-out zero-arg call would hydrate-crash (`TypeError`, calling a `Date` method on a string) rather than merely being un-cataloguable on a template DSL. A coercing helper would dodge the crash but not the underlying issue: it would substitute the browser's ambient locale for the server's at hydrate, a silent SSR/CSR divergence that violates the post-hydration-DOM-equality half of the correctness contract (`spec/subset-conformance.md` principle 1). See the `date-method-uncatalogued` fixture's docstring and #2356's decision comment for the full trace.

### Unsupported Expressions (BF101)

**BF101** is the sibling of BF021 for the non-JS template adapters (Go, Mojo, Xslate, Twig, ERB, Blade, Jinja, MiniJinja): it fires when one of those adapters has no template-language lowering for an expression that a JS-runtime adapter (Hono, CSR) executes verbatim and compiles clean. Two shapes tracked as permanent known limitations (rather than subset widenings) illustrate the two BF101 sources — a per-method reason string vs. an adapter-specific structural check — and both name `/* @client */` in their `suggestion`:

**A nested higher-order callback with no scalar template form** ([#2320](https://github.com/piconic-ai/barefootjs/issues/2320), successor to #2038) — `items().filter(t => picked().some(p => …))` / `.find(...)`. `some`/`every`/`filter` nested one level DO lower on adapters with an inline scalar form (e.g. Mojo's `grep`); `find`/`findIndex`/`findLast`/`findLastIndex` never do (they return an element, not a boolean) — degrading them to their receiver would silently change predicate semantics, so every such adapter refuses loudly instead:

```
error[BF101]: Filter predicate contains a nested '.some(...)' callback, which has no Kolon scalar form
  = help: Rewrite the predicate without a nested callback method, or add /* @client */ for client-only evaluation (no SSR).
```

**A `.map()` loop array bound to a computed component-scope `const`** ([#2321](https://github.com/piconic-ai/barefootjs/issues/2321)) — `const entries = Object.entries(props.x).filter(...); … entries.map(...)`. Every template adapter can bind a loop to a prop/param it passes straight through, but none has a general binding for an arbitrary computed local (only a string-derived local resolves to a generated field). The message leads with the better fix — precompute the value where it's already computable (the parent / route handler) and pass the **result** as a prop, which keeps full SSR output — before the `/* @client */` fallback, which drops SSR output for that region entirely:

```
error[BF101]: Loop array `entries` is a local computed value (`Object.entries(props.reactions ?? {}).filter(([, users]) => users.length > 0)`) that the Go template adapter cannot bind as a template variable — only a string-derived local resolves to a generated struct field.
  = help: Pre-compute the array server-side and pass it as a prop, or mark the loop position as @client-only so it runs in JS on the client.
```

See "Computed loop array" and "Nested higher-order methods" in [`jsx-compatibility.md`](../docs/core/rendering/jsx-compatibility.md) for the full worked examples, including what SSR output looks like for each escape (a plain-prop array still server-renders; `/* @client */` does not).

### Known limitations — methods that don't lower to the template adapters

The Go / Mojo / Xslate / Erb template adapters lower a finite, growing catalogue of `Array.prototype` / `String.prototype` methods (see "Currently lowered" in the now-closed origin catalogue issue [#1448](https://github.com/piconic-ai/barefootjs/issues/1448), whose residual gaps are folded into the master known-limitations catalog [#2069](https://github.com/piconic-ai/barefootjs/issues/2069), the v2 successor of #1395). The shapes below are the residual gaps. They are intentional — each is either covered by an escape hatch or carries a cross-adapter design barrier — and `/* @client */` (or lifting the expression into an event handler / `createEffect`, where full JS is available) is the workaround for all of them.

- **`.flat` / `.flatMap` richer transforms (BF101).** Value-returning `.flat(depth?)` and `.flatMap` lower for the structured catalogue: `flat` with a literal depth (`FlatDepth`) OR a **dynamic** depth expression (#2094 — a numeric prop / signal read / arithmetic that itself parses to a supported `ParsedExpr`; carried as `depthExpr` and coerced at render time via JS `ToIntegerOrInfinity`), and `flatMap` self / field / array-literal-tuple-of-leaves projections (`FlatMapOp`) — `i => i`, `i => i.field`, `i => [i.a, i.b]` — **or** a projection body the runtime evaluator can serialize (#2094), including a nested `.map`/`.filter` (`p => p.tags.map(t => '#' + t)`, the #1938 blog-showcase shape) — see "ParsedExpr Evaluator Semantics" above. The 2-arg form `flatMap(fn, thisArg)` was always semantically correct to accept (only arrow callbacks are recognized, and arrows ignore `thisArg`) and is now pinned by a conformance fixture rather than merely untested. Refused: a `.flat()` depth expression that itself doesn't resolve to a supported shape, and a `flatMap` projection body outside both the structured catalogue and the evaluator's subset (e.g. one containing a nested `.sort`/`.reduce`). The **JSX-returning** `.flatMap` lowers separately as an `IRLoop` and is unaffected. The dynamic-depth and evaluator-widening runtime coercion is implemented for Go first (#2094 phase 1); the other template adapters wire up the same emit shape but their runtime coercion/evaluation is a following phase.
- **Sort comparator follow-ups (BF021).** `localeCompare(b, locale, opts)` is effectively won't-fix for byte-equal SSR: Go (`golang.org/x/text/collate`) and Perl (`Unicode::Collate`) collation cannot be guaranteed byte-equal to each other or to the JS / CSR path, which breaks the three-adapter parity contract. Function-reference comparators (`sort(myCmp)`) now resolve (#2090) when `myCmp` is a same-file `const`/`function` — the residual gap is an imported or aliased comparator (`import { myCmp } from './cmp'`, or `const c2 = c1`), which still needs `/* @client */` or inlining.
- **String methods out of scope.** `.charAt`, `.charCodeAt`, `.codePointAt`, `.normalize` (rarely needed in template position — compose with `String(...)` if required) and the iterator forms (`@@iterator`, `matchAll`, which would need synthetic IR).
- **Mutating array methods (Tier D).** `.push` / `.pop` / `.splice` / `.fill` / … have no template-level meaning (SSR renders a snapshot); they only appear in client-runtime callbacks, which never reach the lowering path.

Tracked limitations live under the [`known-limitation`](https://github.com/piconic-ai/barefootjs/labels/known-limitation) label (the source of truth).

### Missing Key in List (BF023 / BF024)

When a `.map()` callback returns JSX without a `key` prop on the root element, the compiler emits **BF023** (outer loop) or **BF024** (inner loop of a nested `.map()`). A missing `key` prevents efficient reconciliation and can cause incorrect event delegation at runtime.

```
error[BF023]: Missing key attribute in list rendering. Add a key prop for efficient updates

  --> src/components/List.tsx:8:7
   |
 8 |       {items.map(item => (
 9 |         <li>{item.name}</li>
   |         ^^^
   |
   = help: Add a key prop, e.g. `<li key={item.id}>...</li>`. Use the second arrow parameter `(item, i) => ... key={i}` as a fallback for static lists.
```

**Three detection cases:**

| Case | Trigger | Example |
|------|---------|---------|
| a-1 | `key` prop absent entirely | `<li>{item.name}</li>` |
| a-2 | `key` is a `null` or `undefined` literal | `<li key={null}>` |
| a-3 | `key` expression type includes `null \| undefined` (TypeScript) | `<li key={item.id}>` where `id?: string` |

**Fix patterns:**

```tsx
// Good: stable ID from data
{items.map(item => <li key={item.id}>{item.name}</li>)}

// Acceptable: index fallback for static or display-only lists
{items.map((item, i) => <li key={i}>{item.name}</li>)}

// Nested map (BF024): both loops need keys
{weeks.map((week, wi) => (
  <tr key={wi}>
    {week.days.map((day, di) => <td key={di}>{day.label}</td>)}
  </tr>
))}
```

BF024 fires when the map callback's **direct parent** is already inside another `.map()` callback.

**Fragment root**: A callback returning `<>...</>` (JSX fragment) is exempt — fragments cannot hold a `key` prop in standard JSX syntax.

### Signal/Memo Getter Not Called (BF044)

When a signal getter or memo is passed as a bare identifier (without calling it), the compiler emits a **BF044** error. This catches the common mistake of writing `value={count}` instead of `value={count()}`.

```
error[BF044]: Signal getter 'count' passed without calling it

  --> src/components/Counter.tsx:7:24
   |
 7 |           return <div value={count} />
   |                        ^^^^^
   |
   = help: Signal getters must be called to read the value. Use `count()` instead of `count`.
```

**Detected patterns:**

| Pattern | Detected? | Reason |
|---------|-----------|--------|
| `value={count}` | Yes (BF044) | Signal getter without `()` |
| `{count}` | Yes (BF044) | Signal getter in JSX children |
| `value={doubled}` | Yes (BF044) | Memo without `()` |
| `value={count()}` | No | Correct usage |
| `onClick={handler}` | No | Event handlers filtered before check |
| `onChange={setCount}` | No | Setter, not getter |
| `value={props.checked}` | No | Property access, not bare identifier |
| `value={count() + 1}` | No | Expression, not bare identifier |

### class= vs className= in JSX

JSX requires `className` for CSS class attributes. `class` is a reserved keyword in JavaScript and cannot be used as a JSX attribute name.

BarefootJS enforces this at the **type level** via `class?: never` in `HTMLBaseAttributes`. This means TypeScript reports a type error immediately in the editor — no separate compiler error code is needed.

```tsx
// ✅ Correct
<div className="container" />

// ❌ Type error: Type 'string' is not assignable to type 'never'
<div class="container" />
```

Note: Hono's JSX uses `class=` (HTML-style), but BarefootJS JSX uses React-style `className=`. This difference is intentional and caught at compile time.

---

## Compiler Internals

### Reactivity Classification

The compiler detects reactive expressions using a two-tier strategy:

1. **Type-based detection** — Uses TypeScript's `TypeChecker` to find expressions typed with the `Reactive<T>` brand. All reactive getters carry this brand: `Signal<T>[0]`, `Memo<T>`, `FieldReturn.value`, `FormReturn.isSubmitting`, etc. This is the primary mechanism and handles both local signals/memos and library-provided reactive accessors.

2. **Regex fallback** — Pattern-matches signal/memo getter names and props references. Used when the TypeChecker cannot resolve imported types (e.g., virtual file paths, missing type declarations). Build tools can pass a pre-built `ts.Program` via `CompileOptions.program` for full type resolution.

#### The `Reactive<T>` Brand

All reactive getters are typed with a phantom brand:

```typescript
type Reactive<T> = T & { readonly __reactive: true }

type Signal<T> = [Reactive<() => T>, (valueOrFn: T | ((prev: T) => T)) => void]
type Memo<T> = Reactive<() => T>
```

The compiler checks for `__reactive` via `checker.getTypeAtLocation(node).getProperty('__reactive')`. Library authors can brand their own reactive accessors by typing them as `Reactive<() => T>`.

#### Classification Table

| Pattern | Reactive? | Detection |
|---------|-----------|-----------|
| `count()` (signal getter) | Yes | Brand (`Reactive<() => T>`) or regex |
| `doubled()` (memo call) | Yes | Brand (`Reactive<() => T>`) or regex |
| `username.error()` (library accessor) | Yes | Brand (`Reactive<() => string>`) |
| `form.isSubmitting()` | Yes | Brand (`Reactive<() => boolean>`) |
| `props.count` | Yes | Regex (props aren't branded) |
| `label` (const derived from signal) | Yes | Taint analysis (follows constant value) |
| `count` (destructured prop) | No | Value captured at definition |
| `"static string"` | No | Literal value |
| `CONSTANT` (no reactive deps) | No | Pure constant |

### Generated Client JS Examples

**Destructured props** - value captured once:

```tsx
// Source
function Counter({ count }: Props) {
  return <div>{count}</div>
}

// Generated
const count = props.count  // Captured ONCE at hydration
createEffect(() => {
  if (_slot_0) _slot_0.textContent = String(count)
})
```

**Direct props access** - reactive:

```tsx
// Source
function Counter(props: Props) {
  return <div>{props.count}</div>
}

// Generated
createEffect(() => {
  if (_slot_0) _slot_0.textContent = String(props.count)
})
```

### Known Issues

**Constant Ordering** - Compiler must detect dependency and reorder:

```tsx
const classes = `btn ${isActive() && 'on'}`  // Uses memo
const isActive = createMemo(() => selected() === id)
```

### `BindingScope`: loop/callback binding resolution (#2482)

Every place the compiler and its adapters need to answer "is this name bound by an enclosing `.map()`/`.filter()` callback, and if so how" used to be answered by one of **six independent ad-hoc mechanisms**: `jsx-to-ir.ts`'s mutated `ctx.loopParams: Set<string>`, `ir-to-client-js/csr-substitute.ts`'s function-local `boundStack`, `adapters/loop-bound-names.ts`'s flat `collectLoopBoundNames` scan, `static-literal.ts`'s `isNameShadowed` callback, the Go adapter's own `loopParamStack`, and each template-string adapter's `staticLoopSourceBoundNames`-style Set. Each reimplemented the same item/index/destructure/preamble-local bookkeeping with its own bugs and its own blind spots. #2482 collapsed all six onto one shared, immutable service — `BindingScope` (`packages/jsx/src/scope/binding-scope.ts`) — threaded as a parameter/field everywhere a live scope answer is needed, migrated in four stages (Stage 0 shipped the service; Stages 1-3 migrated the compiler, client-JS emitter, template-string adapters, and the Go adapter in turn; Stage 4 drove the remaining direct uses to a documented floor — see `binding-scope-ratchet.test.ts`).

**Immutability is the point, not a style choice.** `enterLoopRow(loop)` / `enterCallback(params)` never mutate `this` — each returns a NEW `BindingScope` whose parent frame is untouched. A caller that holds an old reference across a nested call always sees the scope as it was; there is no `.delete()` step to forget, so the restore-bugs the old mutate-in-place stacks were prone to are impossible by construction.

**API surface:**

| Method | Answers |
|--------|---------|
| `enterLoopRow(loop)` | child scope with a new `'loop-row'` frame binding `loop`'s item/index/destructure/preamble names (`loop` is a structural `LoopBindingSource` — `IRLoop` satisfies it directly, no adapter wiring needed) |
| `enterCallback(params)` | child scope with a new `'callback'` frame binding a `.filter()`/`.sort()`/nested-arrow parameter list |
| `isBound(name)` | is `name` bound by ANY frame, from any binding source, innermost-first |
| `boundNames()` | the union of every frame's bound names (every source) |
| `valueBoundNames()` | the union of names bound via `'item'`/`'index'`/`'destructure'` sources ONLY — excludes `'preamble'` and `'param'` |
| `lookup(name)` | innermost-first resolution: `{ depth, frame, binding } \| null`, where `depth 0` is the innermost frame |
| `asShadowPredicate()` | `(name) => this.isBound(name)`, a drop-in for callback-shaped shadow-check options (e.g. `resolveStaticLoopSource`'s `isNameShadowed`) |

**The two-consumer-classes rule.** Every `BindingScope` consumer falls into exactly one of two classes, and conflating them is a real regression class (a Stage 1a bug flipped `tag-cloud` and `preamble-cells` conformance fixtures before the split existed):

- **Shadow guards** ask "is this name resolved to SOMETHING in this scope, so an outer const/prop of the same name must not be substituted here?" Every binding source qualifies, including a preamble local shadowing a module const. These read `isBound()` / `boundNames()`. Examples: `tryResolveTemplateSpanFromConst`, `rewriteBarePropRefs` (`jsx-to-ir.ts`), `expandDynamicPropValue` (`prop-handling.ts`), each template-string adapter's own local-const shadow check.
- **Reactivity / slot-ID classifiers** ask "does this expression read a value that changes per row, and so needs its own patchable slot?" A preamble local already gets its OWN dedicated slot/region-patch machinery (`preambleRegions`, #2447), so folding it into this classification double-counts it. These read `valueBoundNames()`. Examples: `referencesLoopParam`, `hasReactiveAttributes` (`jsx-to-ir.ts`), the `BindingEnvironment.loopValueBoundNames` feed `makeBindingEnv` builds for `free-refs.ts`'s free-reference resolver, `bf debug graph`'s `collectDomBindings`.

**The scope-window rule for adapters.** A loop row's `BindingScope` frame must bracket exactly the preamble conversion, the children render, AND the key-anchor (loop-item marker) conversion — all three read the row's own item/index/destructure names. Filter/sort predicate emission is different: it runs in the SOURCE context (the array expression the loop iterates), one nesting level OUTSIDE the row's own frame, and stays there — entering the row's frame before emitting the filter/sort predicate would incorrectly make the row's OWN names visible to a predicate that runs before any row exists. `renderLoop` (Go adapter) and `irToHtmlTemplate`/`irToPlaceholderTemplate` (client-JS emitter) both enter via `(callerScope ?? BindingScope.EMPTY).enterLoopRow(loop)` at the point children rendering begins, not before.

**Not everything `BindingScope`-adjacent is a migration target.** Two structural exceptions are permanent by design, not migration debt:

- A prepass that runs OUTSIDE any render-time (or render-shaped) tree walk — e.g. the Go adapter's `getBakedStaticChildLoop`, memoized across `generateInputStruct`/`generateNewPropsFunction`, which run before any loop scope exists to thread — has no live `BindingScope` to consult and falls back to a coarser, deliberately over-inclusive whole-component Set (safe because over-exclusion only ever degrades to the pre-#2482 residual, never to silently wrong output).
- `BindingScope` carries binding EXISTENCE/kind/depth only, never per-binding rendering payload. A Go template destructure accessor string (`id` → `$__bf_item0.Id`) or the client-JS emitter's ordered loop-param accessor-rewrite spec (`wrapExprWithLoopParams`, `ir-to-client-js/utils.ts`) is Go/client-JS-specific payload `ScopeBinding` has no field for by design — these stay as adapter-owned, `scope`-parallel structures (`loopBindingStack` in the Go adapter) pushed/popped in lockstep with `scope`, not folded into it.

**Enforcement: the ratchet.** `packages/jsx/src/__tests__/binding-scope-ratchet.test.ts` scans every non-test `.ts` file under `packages/jsx/src/` and each `packages/adapter-*/src/` for direct textual uses of the mechanisms `BindingScope` replaces, and pins the EXACT count per file. A count above its pinned value fails the test — a new direct use of a legacy scope device was added, use `BindingScope` instead. A count below shrinks the pin (progress). As of #2482 Stage 4 the ledger is at its floor: every remaining entry is a permanent, justified exception (see the `ALLOWLIST`'s own doc comment for the file-by-file reasoning), not leftover debt — new code must use `BindingScope` for any "is this name bound by an enclosing loop callback" question, full stop.

---

## Staged IR (Phase / Scope / Effect)

A `.tsx` source compiles to code that runs across multiple temporal stages (compile time, SSR, hydrate, signal tick, event handler). The staged IR names each stage explicitly so cross-stage rewrites are decided once — by `relocate()` in `packages/jsx/src/relocate.ts` — rather than re-derived in every emit pass.

### Stages (Phase)

| Phase | When | Visible bindings |
|-------|------|------------------|
| `compile` | `bun build` time | `ts.Node`, IR, types |
| `ssr` | request time (server) | props, server-side imports |
| `hydrate` | client first render (template lambda) | `_p`, module imports — NOT init-locals |
| `tick` | signal change (effects) | signal getters, `_p`, init-locals |
| `event` | DOM event handler invoked | event arg, signal getters / setters, init-locals |

The `hydrate` ↔ `init` boundary is what produced #1138.

### Scopes

`Scope` names where a piece of code lives in the emitted module. Distinct from `Phase`: an init-body `createEffect` callback and a sub-init nested arrow both run at `tick` Phase but in different `Scope`s. Also distinct from `BindingScope` (see [`BindingScope`: loop/callback binding resolution](#bindingscope-loopcallback-binding-resolution-2482) above) — `Scope` is a fixed 5-value enum naming an EMISSION TARGET; `BindingScope` is a runtime stack instance answering "which names does a `.map()`/`.filter()` callback bind at this position." The `render-item` `Scope` value below is where `BindingScope`-bound names get emitted; `BindingScope` is how the compiler knows which names those are.

| Scope | Lexical container |
|-------|-------------------|
| `module` | top-level of the emitted `.client.js` |
| `init` | inside `function init<Comp>(__scope, _p) { ... }` |
| `template` | inside `template: (_p) => \`...\`` |
| `sub-init` | nested arrow / function-expression inside `init` |
| `render-item` | `mapArray` callback inside `init` |

### BindingKind and the visibility table

Every free identifier in IR is classified by where its binding lives:

| BindingKind | Source |
|-------------|--------|
| `prop` | destructured from props, OR `props.X` access target, OR a pure alias `const { X } = props` |
| `signal-getter` | `[count, setCount] = createSignal(...)` → `count` |
| `signal-setter` | → `setCount` |
| `memo-getter` | `createMemo(...)` |
| `init-local` | `const x = ...` in init body (not a memo/signal/pure-prop-alias) |
| `sub-init-local` | declared inside a nested arrow / function inside init |
| `render-item` | `.map()` callback parameter |
| `module-import` | from an `import` declaration |
| `module-local` | module-level `const`/`function` (not imported) |
| `global` | not declared anywhere we tracked → assumed to be a JS global |

`isVisibleIn(scope, kind)` is true iff a binding of `kind` can be emitted as a **bare identifier** at `scope` with no rewrite required. The static table:

| Scope ↓ / Kind → | `prop` | `module-import` | `module-local` | `global` | `init-local` | `signal-*` | `memo-getter` | `render-item` | `sub-init-local` |
|-|-|-|-|-|-|-|-|-|-|
| `module` | ✗ | ✓ | ✓ | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ |
| `init` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `template` | ✗ (lift to `_p.X`) | ✓ | ✓ | ✓ | ✗ (inline or fallback) | ✗ (fallback) | ✗ (fallback) | ✗ (fallback) | ✗ (inline or fallback) |
| `sub-init` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `render-item` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |

`prop` at `template` is **reachable** via `_p.X` but **not bare-emittable** — the rewrite is required.

### `relocate()`

```ts
function relocate(
  expr: string,
  exprNode: ts.Node | null,
  fromScope: Scope,
  toScope: Scope,
  env: RelocateEnv,
): RelocateResult
```

Rewrites `expr` for emission at `toScope`. For each free reference in `expr`:

| Decision | When | Rewrite |
|----------|------|---------|
| `pass-through` | `isVisibleIn(toScope, kind)` is true | unchanged |
| `lift-to-prop` | `kind === 'prop'`, `toScope === 'template'` | `name` → `_p.name` |
| `inline` | `kind ∈ {init-local, sub-init-local}`, `env.inlinable.has(name)` | substituted with the inlinable form |
| `fallback` | init-local without inline form, OR reactive bindings, with `env.allowFallback === true` | `undefined` (runtime null-guarded by emit) |
| `reject` | the `fallback` triggers with `allowFallback === false` | unchanged; `result.ok` set to `false` |

`RelocateResult` carries `text`, `ok`, `usedExternals` (post-rewrite identifier set, used by import-preservation), and `decisions` (per-name action, used by stage-violation diagnostics).

### `isInlinableInTemplate(value, env)`

The canonical predicate for "can this `init`-scope expression be safely duplicated into `template` scope as a literal substitution?" Used by:

- `compute-inlinability.ts` for the constant inline classification
- `emit-registration.ts/buildCsrInlinableConstants` for CSR re-promotion
- `index.ts/needsClientJs` to force the full-init path when an unsafe local would otherwise be lost

A value is inline-safe iff:

1. `relocate(value, _, 'init', 'template', env).ok` is true (every ref bridges cleanly), AND
2. No call expression has an argument that resolves to a `lift-to-prop` or `inline` decision (catches `useYjs(_p.X)` — the helper would re-execute on every template render with bridged props), AND
3. No zero-argument call is present (catches `readItems()` / `count()` — they read runtime state).

### Stage-violation diagnostics (BF060 / BF061 / BF062)

When `relocate` produces a `fallback` decision at `template` scope, the binding kind determines the corresponding diagnostic:

| Code | Trigger | Default emit |
|------|---------|--------------|
| BF060 | `signal-getter` / `signal-setter` / `memo-getter` reference falls back at `template` scope | not emitted (silent fallback is the documented design) |
| BF061 | `init-local` / `sub-init-local` reference falls back at `template` scope | not emitted |
| BF062 | `AwaitExpression` at `template` scope | reserved for Phase 1 dispatcher (overlaps Appendix A.3.3 / BF050; cannot fall back, would hang first render) |

`recordStageDiagnostics()` is exported from `compute-inlinability.ts` so opt-in callers (a future strict-stage compile mode, IDE tooling) can surface them as warnings or errors. Default emit is off because a documented pattern (`<div data-x={someInitLocal}>` falls back to `undefined` and init's `createEffect` repaints) would otherwise produce noise on every component.

### IR fields populated for staged IR

The contract: **analyzer is the single source of truth, emit reads from IR**.

| Field | On | Set by | Read by |
|-------|----|--------|---------|
| `OriginInfo { phase, scope, effect }` | `IRExpression`, `ConstantInfo`, `InitStatementInfo` | analyzer collection sites | future passes (opt-in today) |
| `FunctionInfo.isAsync` | `FunctionInfo` | analyzer | `emit-module-level.ts`, `stringify/declaration-emit.ts` |
| `FunctionInfo.isGenerator` | `FunctionInfo` | analyzer | `emit-module-level.ts` (preserves `function*`) |
| `FunctionInfo.declarationKind` | `FunctionInfo` | analyzer | `module-exports.ts`, `jsx-adapter.ts`, `plan/build-declaration-emit.ts` |
| `InitStatementInfo.needsLeadingSemi` | `InitStatementInfo` | analyzer (detects ASI hazard prefix `(`/`[`/`` ` ``/`+`/`-`/`/`) | `phases/init-statements.ts` (prepends `;`) |

### See also

Motivation, design rationale, migration log: #1138. Implementation PRs: #1142 (foundation), #1144 (relocate-driven inline classification), #1145 (emit reads IR), #1147 (BF060-series codes).

---

## Open Questions

1. **Type inference depth** - How deeply to resolve types like `Pick<T, K>`?
2. **Source maps** - Generate source maps for Client JS debugging?
3. **Constant ordering** - How to handle dependencies more robustly?

---

## Appendix A: ts.SyntaxKind classification for JSX-embeddable expressions

This appendix enumerates every `ts.SyntaxKind` value that `ts.Expression` (and its subtypes `UnaryExpression`, `UpdateExpression`, `LeftHandSideExpression`, `MemberExpression`, `PrimaryExpression`) can hold, and assigns each kind to one of five classes used by the Phase 1 dispatcher.

Source of truth: `typescript@5.9.3`, `node_modules/typescript/lib/typescript.d.ts` (declarations `interface Expression`, `interface UnaryExpression`, `interface UpdateExpression`, `interface LeftHandSideExpression`, `interface MemberExpression`, `interface PrimaryExpression`). The BarefootJS `package.json` pins TypeScript at `^5.9.3`; `packages/jsx/package.json` at `^5.0.0`. When upgrading TypeScript, re-run this enumeration and extend the table before merging the bump.

### A.1 Classes

| Class | Semantics | Dispatcher action |
|---|---|---|
| **Transparent** | The kind wraps an inner `ts.Expression` with no runtime effect on render output. | Unwrap to `.expression` and recurse. |
| **JSX-structural** | The kind can carry JSX or JSX-shaped subtrees that Phase 1 must translate into a dedicated IR node. | Delegate to a shape-specific transformer that returns an `IRNode`. |
| **Scalar leaf** | The kind evaluates to a runtime JS value that the template emits via the scalar path (text interpolation or attribute value). No JSX descent. | Produce an `IRExpression` carrying the raw JS source. |
| **Forbidden in render position** | The kind is syntactically valid in TypeScript but is not meaningful in BarefootJS render output, or its semantics conflict with synchronous, non-generator client hydration. | Emit a dedicated BF error code. |
| **Unreachable at render position** | The kind is only valid as a nested child of another kind (e.g. `SpreadElement` only inside `ArrayLiteralExpression \| CallExpression \| NewExpression`), or is synthesized by the TypeScript transformer API and never produced by parsing user source. | Dispatcher case is present for exhaustiveness but delegates to a `case _: never` guard inside `assertNever`, treated as a compiler bug if reached. |

The `default` branch of the `switch` is reserved for the `assertNever` exhaustiveness check: every enumerated kind above must have an explicit `case` label. A future TypeScript release that introduces a new `ts.Expression`-valued `SyntaxKind` produces a TypeScript compile error in `transformJsxExpression`, not a silent runtime regression.

### A.2 Classification table

Kinds are ordered by class, then alphabetically. `"expr"` in the "Parent type chain" column is shorthand for `extends Expression`.

| `ts.SyntaxKind` | Class | Parent type chain | Notes |
|---|---|---|---|
| `ParenthesizedExpression` | Transparent | `PrimaryExpression` | Unwrap `.expression`. |
| `AsExpression` | Transparent | `Expression` | `x as T` — type-only, unwrap `.expression`. |
| `TypeAssertionExpression` | Transparent | `UnaryExpression` | Legacy `<T>x` form. Unwrap `.expression`. |
| `SatisfiesExpression` | Transparent | `Expression` | `x satisfies T` — type-only, unwrap. |
| `NonNullExpression` | Transparent | `LeftHandSideExpression` | `x!` — type-only at runtime, unwrap. |
| `PartiallyEmittedExpression` | Transparent | `LeftHandSideExpression` | Synthesized by transformers (e.g. after type-only stripping). Unwrap `.expression`. |
| `JsxElement` | JSX-structural | `PrimaryExpression` | `<tag>…</tag>` — `transformJsxElement`. |
| `JsxFragment` | JSX-structural | `PrimaryExpression` | `<>…</>` — `transformFragment`. |
| `JsxSelfClosingElement` | JSX-structural | `PrimaryExpression` | `<tag/>` — `transformSelfClosingElement`. |
| `ConditionalExpression` | JSX-structural | `Expression` | `cond ? a : b` — `transformConditional` (both branches recurse through the same dispatcher). |
| `BinaryExpression` | JSX-structural *(operator-gated)* | `Expression` | Only `&&`, `\|\|`, `??` with a JSX-capable right operand route to `transformBinaryJsx`. Any other operator (including `,`, `+`, comparisons, assignments) is Scalar leaf. |
| `CallExpression` | JSX-structural *(callee-gated)* | `LeftHandSideExpression` | `.map(...)` on an array-typed receiver → `transformMapCall`; known inline-JSX helpers (`jsx`, `jsxs`, `jsxDEV`) → `transformJsxFunctionCall`; otherwise Scalar leaf. |
| `ArrayLiteralExpression` | Scalar leaf *(today)* | `PrimaryExpression` | See ruling A.3.1 below. |
| `Identifier` | Scalar leaf | `PrimaryExpression` | `foo` — pass-through in `IRExpression`; reactivity layer decides wrapping. |
| `PrivateIdentifier` | Forbidden | `Node` (not Expression) | Only valid inside class member bodies; reaching the dispatcher is a TypeScript-level error. Listed here for completeness; the `switch` does not case on it. |
| `StringLiteral` | Scalar leaf | `LiteralExpression` | |
| `NumericLiteral` | Scalar leaf | `LiteralExpression` | |
| `BigIntLiteral` | Scalar leaf | `LiteralExpression` | |
| `RegularExpressionLiteral` | Scalar leaf | `LiteralExpression` | |
| `NoSubstitutionTemplateLiteral` | Scalar leaf | `LiteralExpression` | `` `literal` `` with no `${}`. |
| `TemplateExpression` | Scalar leaf | `PrimaryExpression` | `` `hello ${name}` `` — pass through as JS string expression. |
| `TaggedTemplateExpression` | Scalar leaf | `MemberExpression` | See ruling A.3.2 below. |
| `TrueKeyword` | Scalar leaf | `PrimaryExpression` | `TrueLiteral`. |
| `FalseKeyword` | Scalar leaf | `PrimaryExpression` | `FalseLiteral`. |
| `NullKeyword` | Scalar leaf | `PrimaryExpression` | Renders as empty (branch-level fallback applies in conditional contexts). |
| `ThisKeyword` | Scalar leaf | `PrimaryExpression` | |
| `SuperKeyword` | Scalar leaf | `PrimaryExpression` | Only valid inside class methods; still Scalar leaf if reached at render position. |
| `ImportKeyword` | Scalar leaf | `PrimaryExpression` | Appears as the callee of `import(...)`; standalone is Forbidden (parser rejects it). |
| `PropertyAccessExpression` | Scalar leaf | `MemberExpression` | `props.x`, `foo.bar.baz`. Reactivity layer decides wrapping. |
| `ElementAccessExpression` | Scalar leaf | `MemberExpression` | `foo[key]`. |
| `PrefixUnaryExpression` | Scalar leaf | `UpdateExpression` | `!x`, `-x`, `++x` (the last has a write side effect, but compilation path is still scalar). |
| `PostfixUnaryExpression` | Scalar leaf | `UpdateExpression` | `x++`, `x--`. |
| `TypeOfExpression` | Scalar leaf | `UnaryExpression` | `typeof x`. |
| `VoidExpression` | Scalar leaf | `UnaryExpression` | `void x`. |
| `DeleteExpression` | Scalar leaf | `UnaryExpression` | `delete x.y`. |
| `NewExpression` | Scalar leaf | `PrimaryExpression` | `new Foo(...)`. |
| `ObjectLiteralExpression` | Scalar leaf | `PrimaryExpression` | `{ a: 1 }` — rendered as `[object Object]` today; same as JS coercion. |
| `ArrowFunction` | Scalar leaf | `Expression` | `() => x`. Event handlers route through a different path (attribute dispatcher) before reaching here. |
| `FunctionExpression` | Scalar leaf | `PrimaryExpression` | `function () { … }`. |
| `ClassExpression` | Scalar leaf | `PrimaryExpression` | `class { … }`. Rare at render position. |
| `MetaProperty` | Scalar leaf | `PrimaryExpression` | `new.target`, `import.meta`. |
| `ExpressionWithTypeArguments` | Scalar leaf | `MemberExpression` | `Foo<T>(...)` callee form at type-arg sites. |
| `CommaListExpression` | Scalar leaf | `Expression` | Synthesized by transformers (`(a, b, c)` after simplification). |
| `SyntheticExpression` | Scalar leaf | `Expression` | Synthesized by the transformer API; carries a `type` field only. |
| `AwaitExpression` | Forbidden | `UnaryExpression` | See ruling A.3.3 below. |
| `YieldExpression` | Forbidden | `Expression` | See ruling A.3.5 below. |
| `SpreadElement` | Unreachable at render position | `Expression` | See ruling A.3.4 below. |
| `OmittedExpression` | Unreachable at render position | `Expression` | Array-hole sentinel (`[1,,3]`). Not produced at render position. |
| `JsxExpression` | Unreachable at render position | `Expression` | Only appears inside `JsxElement \| JsxFragment \| JsxAttributeLike` — its inner expression is what the dispatcher receives. |
| `JsxOpeningElement` | Unreachable at render position | `Expression` | Internal child of `JsxElement`. |
| `JsxOpeningFragment` | Unreachable at render position | `Expression` | Internal child of `JsxFragment`. |
| `JsxClosingFragment` | Unreachable at render position | `Expression` | Internal child of `JsxFragment`. |
| `JsxAttributes` | Unreachable at render position | `PrimaryExpression` | Only valid as the `attributes` field of `JsxOpeningLikeElement`. |
| `MissingDeclaration` | Unreachable at render position | `PrimaryExpression` | Only produced in error-recovery parses. |

### A.3 Judgement-call rulings

#### A.3.1 `ArrayLiteralExpression` containing JSX

An array literal whose elements contain JSX (`[<A/>, <B/>]`) is classified as **Scalar leaf** in the current compiler. The IR has no dedicated node for "array of JSX children"; the existing list path is `IRLoop`, which requires a callable mapper. Treating array literals as JSX-structural would require introducing either a synthetic `IRLoop` wrapper over a fixed-length iterable or a new `IRArray` node, neither of which this refactor is scoped to do.

Practical consequence: `{[<A/>, <B/>]}` at a JSX child position emits an `IRExpression` whose JS string is the array literal; the backend template engine will stringify it by default. Users who want JSX-structural rendering should switch to a `.map(...)` or sibling expressions. This matches today's behavior — the refactor preserves it.

Future direction (not in scope): if a user demand emerges, add a dedicated `IRArray` node and promote `ArrayLiteralExpression` to JSX-structural with the same gating as `CallExpression` (only when an element has JSX kind).

#### A.3.2 `TaggedTemplateExpression`

Tagged templates (`html\`<div/>\``) are not a supported render shape. BarefootJS does not ship an htm-style runtime; if a user's tag returns JSX-like structure it is opaque to the compiler. Ruling: **Scalar leaf** — emit the tagged template as an `IRExpression` (raw JS). Reactivity layer decides whether to wrap.

If the user's tag happens to produce a DOM node or a string, the adapter's scalar path handles it the same as any other runtime-computed string. If the tag produces something non-scalar (e.g. a framework-specific renderable), the output is undefined — but this is not a regression relative to today.

**#2092 carve-out — the classname-tag idiom.** A narrow exception applies BEFORE the dispatcher ever classifies the node: when a top-level `TaggedTemplateExpression`'s tag is an identifier that resolves one hop through same-file scope (the same `findLocalConst` / `findLocalFunction` lookup #2090 established for sort comparators) to a function structurally proven to be an "interleave tag" — `function cn(parts, ...args) { return parts.reduce((acc, p, i) => acc + p + (args[i] ?? ''), '') }`, `String(...)`-wrapped span accepted — the whole tagged template is rewritten to the equivalent UNTAGGED template literal (each span wrapped `(span) ?? ''`) before this ruling ever applies. The rewritten node is itself a scalar leaf (`TemplateExpression` / `NoSubstitutionTemplateLiteral`) and flows through the unchanged template-literal / dependency-analysis / client-JS pipeline, so it renders on every adapter with reactive deps analysed — not just the CSR/Hono path. Everything else (an imported tag, a computed tag like `obj.cn`, a non-rest signature, or a resolved body outside this exact shape) is untouched by the rewrite and keeps the ruling above verbatim, including its BF101 refusal on non-JS template adapters.

#### A.3.3 `AwaitExpression` at render position

`"use client"` components are synchronous at hydration time: the client runtime does not `await` during first render. Server-side (hono/jsx) components **can** be async, but BarefootJS's Phase 1 IR is emitted once and reused for both SSR and CSR — an IR node tagged "await this" would have different meaning on each side.

Ruling: **Forbidden** at render position. Emit `BF050 — AwaitExpression not allowed in render position` with suggestion "compute the value outside render and pass it via a signal". Rationale: the alternative (silently dropping the `await` on the client side) reproduces the #968 failure mode this refactor is designed to eliminate.

If a user needs async data on the server only, they can resolve it in the route handler and pass it as a prop; the Phase 1 dispatcher does not see the `await`.

#### A.3.4 `SpreadElement` as standalone

`SpreadElement` is only valid as a child of `ArrayLiteralExpression`, `CallExpression`, or `NewExpression` per `typescript.d.ts:5069`. A parser will not accept a standalone `...x` at render position. Ruling: **Unreachable at render position** — the dispatcher includes an explicit `case` solely so that the exhaustiveness check succeeds, and the case body calls `assertNever` with a message tagging this as a compiler bug if ever reached.

`SpreadElement` inside an `ArrayLiteralExpression` or `CallExpression` is handled by those parents' dedicated transformers, which iterate `.elements` / `.arguments` with spread-aware logic; the child spread never re-enters `transformJsxExpression` at the top level.

#### A.3.5 `YieldExpression`

`"use client"` components are not generators. A `yield` inside a render path implies a generator function, which BarefootJS does not support. Server-side components are not generators either (hono/jsx renders once).

Ruling: **Forbidden**. Emit `BF051 — YieldExpression not allowed in render position` with suggestion "components must not be generators".

### A.4 Verification

The classification table above is the source of truth for `transformJsxExpression`. Verification is layered:

1. **Dispatcher structure.** The dispatcher's `switch (expr.kind)` has one `case` label per Transparent / JSX-structural / Scalar leaf / Forbidden / Unreachable entry. The local narrowing cast `const node: JsxEmbeddableExpression = expr as JsxEmbeddableExpression` makes the switch operate over a union where each kind is a literal type, so TypeScript can perform exhaustiveness inference.

2. **Compile-time exhaustiveness via `assertNever`.** The `default` branch calls `assertNever(expr: never): never` with the narrowed `node`. If any case is missing from the switch, `node` in the `default` branch is not `never` and `tsgo` fails with:
   ```
   Argument of type '<KindName>' is not assignable to parameter of type 'never'. (TS2345)
   ```
   This is the #971 single-source-of-truth guarantee: adding or removing a renderable shape must pass through this switch to even build.

3. **CI gate.** `cd packages/jsx && bun run build` runs `tsgo --emitDeclarationOnly` as part of CI. Removing a `case` is therefore a red build, not a silent runtime drop. Every package-local test workflow depends on this build step, so the gate covers every adapter and the documentation site as well.

4. **Manual verification.** To reproduce the compile error locally:
   ```sh
   # In packages/jsx/src/jsx-to-ir.ts, comment out any one case — e.g.:
   # // case ts.SyntaxKind.TaggedTemplateExpression:
   cd packages/jsx && bun run build
   # Expect: tsgo error TS2345 on the assertNever(node) call.
   # Uncomment the case to restore.
   ```

5. **Contract regression test.** `packages/jsx/src/__tests__/dispatcher-exhaustiveness.test.ts` asserts that (a) the helper stays `assertNever(expr: never): never`, (b) the dispatcher's `default` branch calls it without an `as`-cast or `!`-assertion escape hatch, (c) the `JsxEmbeddableExpression` union and the switch both list every kind in this appendix. These runtime checks catch the failure mode where the *union* is shrunk in lockstep with the switch — in that case `tsgo` stays green but the silent-drop surface reappears.

When TypeScript upstream adds a new `ts.Expression`-valued `SyntaxKind`, the expected workflow is: (a) the next `tsgo` run fails on `transformJsxExpression`, (b) the author classifies the new kind using this appendix's five-class rubric, (c) the appendix table, the `JsxEmbeddableExpression` union, and the `switch` are updated in the same PR. The dispatcher-exhaustiveness test fails until the appendix is updated, surfacing the requirement.
