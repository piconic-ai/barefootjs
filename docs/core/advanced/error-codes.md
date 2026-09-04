---
title: Error Codes Reference
description: BF-prefixed compiler error codes with explanations and fixes.
---

# Error Codes Reference

Errors follow the format `BF` + 3-digit code with source location and fix suggestions.

## Format

```
error[BF001]: 'use client' directive required for components with createSignal

  --> src/components/Counter.tsx:3:1
   |
 3 | import { createSignal } from '@barefootjs/client'
   | ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
   |
   = help: Add 'use client' at the top of the file
```

---

## Directive Errors (BF001–BF003)

<a id="bf001"></a>

### BF001 — Missing `"use client"` Directive

**Trigger:** Reactive APIs used without `"use client"`.

```tsx
// ❌ BF001
import { createSignal } from '@barefootjs/client'
export function Counter() {
  const [count, setCount] = createSignal(0)
  return <button onClick={() => setCount(n => n + 1)}>{count()}</button>
}
```

**Fix:**

```tsx
// ✅ Fixed
"use client"
import { createSignal } from '@barefootjs/client'
export function Counter() { ... }
```

<a id="bf003"></a>

### BF003 — Client Component Importing Server Component

**Trigger:** Client component imports from a file without `"use client"`.

**Fix:** Add `"use client"` to the imported file, or import only types/constants.

---

## Signal Errors (BF011–BF013)

<a id="bf011"></a>

### BF011 — Module-Level Reactive Declaration

**Trigger:** A `createSignal` or `createMemo` call at module scope without a leading `/* @client */` directive.

```tsx
'use client'
import { createSignal } from '@barefootjs/client'
// ❌ BF011 — module-level signal without opt-in
const [count, setCount] = createSignal(0)
export function Counter() {
  return <button onClick={() => setCount(count() + 1)}>{count()}</button>
}
```

**Fix (option A):** Move the declaration inside the component function so each mount gets its own state.

```tsx
'use client'
import { createSignal } from '@barefootjs/client'

export function Counter() {
  const [count, setCount] = createSignal(0)
  return <button onClick={() => setCount(count() + 1)}>{count()}</button>
}
```

**Fix (option B):** Prefix the declaration with `/* @client */` to opt into client-only module-scope state. The signal is emitted at module scope in the client bundle and SSR renders a placeholder for any reference. Intended for "global signal" / "store" patterns shared across components.

```tsx
'use client'
import { createSignal } from '@barefootjs/client'

/* @client */
const [count, setCount] = createSignal(0)

export function Counter() {
  return <button onClick={() => setCount(count() + 1)}>{count()}</button>
}
```

---

<a id="bf013"></a>

### BF013 — Reactive Primitive Called Through a Namespace Import

**Trigger:** A reactive primitive (`createSignal`, `createMemo`, `createEffect`, `onMount`, `onCleanup`, `createSearchParams`) invoked through a namespace import of `@barefootjs/client` (`import * as ns from '@barefootjs/client'`) that the analyzer could not resolve. Without a shared `ts.Program` (`CompileOptions.program`), the analyzer's fast path only recognizes a bare identifier callee — `ns.createSignal(...)` is dropped from the compiled output, and every reference to it throws `ReferenceError` at hydrate.

```tsx
'use client'
// ❌ BF013 — namespace-qualified call is not recognized
import * as bf from '@barefootjs/client'
export function Counter() {
  const [count, setCount] = bf.createSignal(0)
  return <button onClick={() => setCount(count() + 1)}>{count()}</button>
}
```

**Fix:** Import the primitive by name instead of through the namespace.

```tsx
'use client'
import { createSignal } from '@barefootjs/client'

export function Counter() {
  const [count, setCount] = createSignal(0)
  return <button onClick={() => setCount(count() + 1)}>{count()}</button>
}
```

A shared `ts.Program` passed via `CompileOptions.program` (as `@barefootjs/vite` always supplies) lets the analyzer resolve the namespace-qualified form through the TypeScript `TypeChecker` — this diagnostic only fires when no such program is available.

---

## JSX Errors (BF021–BF023)

<a id="bf021"></a>

### BF021 — Unsupported JSX Pattern

**Trigger:** Array method chain before `.map()` cannot compile to SSR template.

#### SSR-Compatible Chains

- `.filter().map()`
- `.sort().map()` / `.toSorted().map()`
- `.filter().sort().map()`
- `.sort().filter().map()`

Other chains (`.reduce()`, `.slice()`, `.flatMap()`) fall back to client-side evaluation.

#### filter: Supported Predicates

- Property access: `t.done`, `t.price`
- Literals: `'active'`, `5`, `true`
- Comparison: `===`, `!==`, `>`, `<`, `>=`, `<=`
- Arithmetic: `+`, `-`, `*`, `/`, `%`
- Logical: `&&`, `||`, `!`
- Ternary: `cond ? a : b`

```tsx
// ✅ SSR-compilable
{items().filter(t => !t.done).map(t => <li>{t.name}</li>)}
{items().filter(t => t.price > 100 && t.active).map(t => <li>{t.name}</li>)}

// ❌ BF021 — typeof, function calls, nested higher-order methods are not supported
{items().filter(t => typeof t === 'string').map(...)}
{items().filter(t => customFn(t)).map(...)}
{items().filter(t => t.tags.some(tag => tag.featured)).map(...)}
```

#### sort: Supported Comparators

Simple subtraction: `(a, b) => a.field - b.field`:

```tsx
// ✅ SSR-compilable
{items().sort((a, b) => a.price - b.price).map(...)}     // ascending
{items().toSorted((a, b) => b.date - a.date).map(...)}   // descending
{items().sort((a, b) => { return a.price - b.price }).map(...)}     // single-return block body
{items().sort((a, b) => a.name.localeCompare(b.name)).map(...)}     // zero-arg localeCompare

// A bare identifier reference to a same-file const/function comparator
// resolves one hop and compiles like the inline arrow above (#2090):
const byPrice = (a, b) => a.price - b.price
{items().sort(byPrice).map(...)}

// ❌ BF021 — locale/options localeCompare, and an unresolved comparator
// (imported, a prop, or an alias chain) are not supported
{items().sort((a, b) => a.name.localeCompare(b.name, 'ja', { numeric: true })).map(...)}
{items().sort(importedCmp).map(...)}
```

#### Workaround

```tsx
{/* @client */ todos().filter(t => t.items.some(i => i.done)).map(t => (
  <li>{t.name}</li>
))}
```

#### Host rich-typed prop method calls (#2273)

**Trigger:** A method call on a prop provably typed as a built-in host rich
type — `Date`, `Map`, `Set`, `WeakMap`, `WeakSet`, `URL`, `URLSearchParams`,
`RegExp`, `Promise`, `Error`, `Symbol`, `BigInt`, `Function` — with no
catalogued lowering.

```tsx
// ❌ BF021 — Date.prototype.toISOString has no catalogued lowering
function Post({ createdAt }: { createdAt: Date }) {
  return <div>{createdAt.toISOString()}</div>
}
```

The receiver's type must be provable from the component's declared props
(destructured prop, `props.x` member chain, loop item field, `Date | null`
union) — an untyped, generic, or call-result receiver (`d().toISOString()`
where `d` is a signal) has no evidence and is not flagged.

#### Workaround

```tsx
// ✅ Format in the backend and pass a string prop
function Post({ createdAt }: { createdAt: string }) {
  return <div>{createdAt}</div>
}

// ✅ Or defer to the client — but revive the receiver first
{/* @client */ new Date(createdAt).toISOString()}
```

The string-prop variant moves the formatting to where full language power
already exists — the backend that populates the template data (Go handler,
Rails controller, …) formats the `Date` and passes the finished string. Note
that a component-body local (`const iso = createdAt.toISOString()`) is NOT a
workaround: it lowers to a template variable whose value the template
backend cannot compute, and dies at render time the same way.

The `/* @client */` block must wrap the receiver in `new Date(...)` — a
BARE `{/* @client */ createdAt.toISOString()}` compiles clean but crashes
at real hydrate with a `TypeError`. Props cross the hydration boundary as
JSON with no type-aware revival, so `createdAt` arrives at hydrate as its
`toJSON()` ISO string, not a `Date` instance; wrapping it in `new Date(...)`
revives it first, since `Date`'s `toJSON()` output round-trips through its
own constructor (#2636). This revival trick only works for `Date` and
`URL` — every other host rich type (`Map`, `Set`, …) has no safe
`/* @client */` escape at all; pre-compute server-side instead.

<a id="bf023"></a>

### BF023 — Missing Key in List

**Trigger:** `.map()` loop without `key` prop.

```tsx
// ❌ BF023
{items().map(item => <li>{item.name}</li>)}
```

**Fix:**

```tsx
// ✅ Add key
{items().map(item => <li key={item.id}>{item.name}</li>)}
```

---

## Template Adapter Errors (BF101)

<a id="bf101"></a>

### BF101 — No Template-Language Lowering

**Trigger:** An expression that a JS-runtime adapter (Hono, CSR) executes verbatim has no lowering on a non-JS template adapter (Go, Mojo, Xslate, Twig, ERB, Blade, Jinja, MiniJinja). Two shapes are permanent known limitations rather than subset widenings:

**A nested `.some()` / `.find()` inside a filter predicate** ([#2320](https://github.com/piconic-ai/barefootjs/issues/2320)) — `find`-family methods return an element, not a boolean, so degrading them to their receiver would silently change predicate semantics:

```tsx
// ❌ BF101 on Go/Mojo/Xslate/Twig/ERB/Blade/Jinja/MiniJinja
{items().filter(t => picked().some(p => p.id === t.id)).map(t => <li key={t.id}>{t.name}</li>)}
```

**A `.map()` loop array bound to a component-scope `const` with a computed initializer** ([#2321](https://github.com/piconic-ai/barefootjs/issues/2321)) — no template adapter binds an arbitrary computed local, only a prop/param it passes straight through:

```tsx
// ❌ BF101 on Go/Mojo/Xslate/Twig/ERB/Blade/Jinja/MiniJinja
function ReactionBar(props: { reactions: Record<string, string[]> }) {
  const entries = Object.entries(props.reactions).filter(([, users]) => users.length > 0)
  return <div>{entries.map(([emoji, users]) => <span key={emoji}>{emoji}</span>)}</div>
}
```

**Escapes** — each verified by a conformance twin that compiles clean on the refusing adapter, listed best-SSR-first:

- **Pass the computed result as a prop** (`prop-precompute`) — available for the loop-source shape, wherever the array is already computable server-side. **Full server render**: the rendered result is present in the server HTML.
- **`/* @client */`** (`client-directive`) — available for both shapes, and compiles clean on every adapter. **Client-render**: the region is *empty in server HTML until hydration*. That trade is the cost of the escape, not a bug — the twin fixtures pin the empty region in their own committed `expectedHtml`.

```tsx
// ✅ Best for the loop-source shape: pass the computed array as a prop
function ReactionBar({ entries }: { entries: [string, string[]][] }) {
  return <div>{entries.map(([emoji, users]) => <span key={emoji}>{emoji}</span>)}</div>
}

// ✅ Either shape: defer to the client
{/* @client */ items().filter(t => picked().some(p => p.id === t.id)).map(t => (
  <li key={t.id}>{t.name}</li>
))}
```

See [JSX Compatibility](../rendering/jsx-compatibility.md) for the full worked examples.

---

## Component Errors (BF043–BF049)

<a id="bf043"></a>

### BF043 — Props Destructuring (Warning)

**Trigger:** Props destructured in function parameter.

```tsx
// ⚠️ BF043
function Child({ count }: Props) {
  return <span>{count}</span>  // count is captured once
}
```

```
warning[BF043]: Destructuring props in function parameters captures values once.
   = help: Use `props.count` for reactive access, or suppress with // @bf-ignore props-destructuring
```

**Fix options:**

1. Use direct props access:

```tsx
function Child(props: Props) {
  return <span>{props.count}</span>  // Reactive
}
```

2. Suppress if intentional (static initial value):

```tsx
// @bf-ignore props-destructuring
function Child({ initialCount }: Props) {
  const [count, setCount] = createSignal(initialCount)
  return <span>{count()}</span>
}
```

<a id="bf044"></a>

### BF044 — Signal/Memo Getter Not Called

**Trigger:** Signal/memo getter passed without calling it.

```tsx
// ❌ BF044
<Child count={count} />  // Passing getter function, not the value
```

**Fix:**

```tsx
// ✅ Fixed
<Child count={count()} />
```

<a id="bf049"></a>

### BF049 — Rich-Typed Prop Not Hydratable

**Trigger:** A prop typed as a JSON-unsafe host rich type — `Map`, `Set`,
`WeakMap`, `WeakSet`, `URLSearchParams`, `RegExp`, `Promise`, `Error`,
`Symbol`, `BigInt`, `Function` — is used anywhere in this component's own
client code (an event handler, an effect), regardless of whether a method is
called on it. This is the sibling of [BF021](#bf021)'s host-rich-type
refusal for a different shape: BF021 only walks expression positions
reachable through template lowering (JSX text/attribute positions rendered
at SSR); a handler or effect body is a different code path BF021 never
analyzes, so even a method call there (like `data.get(...)` below) is just
as invisible to it as a bare read. Either way the prop crosses the `bf-p`
hydration boundary as JSON, where a `Map`/`Set` arrives de-riched (`{}`,
every entry silently dropped) and a `BigInt` fails to serialize at all
(`TypeError` at SSR render, failing the whole page).

```tsx
// ❌ BF049 — a Map prop used by client code cannot survive hydration
'use client'
export function Foo({ data }: { data: Map<string, number> }) {
  return <button onClick={() => console.log(data.get('x'))}>go</button>
}
```

**Fix:** Pre-compute a JSON-serializable value server-side and rebuild the
rich value client-side where it's actually needed.

```tsx
// ✅ Fixed
'use client'
export function Foo({ entries }: { entries: [string, number][] }) {
  return <button onClick={() => console.log(new Map(entries).get('x'))}>go</button>
}
```

> `Date` and `URL` props are exempt — their `toJSON()` output round-trips
> through their own constructor, so they're not JSON-unsafe (see BF021's
> host-rich-type section above).
>
> This is a compile-time check: it only fires when the prop's type is
> provable from the component's own props type (same evidence
> `checkRichTypeMethodCalls` uses). An imported/aliased type alias, or a
> prop typed too loosely to resolve statically, isn't caught here — on the
> Hono adapter, an unsound value reaching hydration serialization throws a
> clear runtime error naming the prop and this code instead of failing
> silently or with an opaque `JSON.stringify` error.

<a id="bf054"></a>

### BF054 — Built-in `<Async>` / `<Region>` Used Without Import

**Trigger:** A bare `<Async>` or `<Region>` tag is used without importing it
from `@barefootjs/client`, and no other binding with that name is in scope.
These compiler built-ins are recognised by their import (not by tag name), so
an unimported tag is treated as an undeclared component.

```tsx
// ❌ BF054
export function Page() {
  return <Async fallback={<p>Loading…</p>}><Body /></Async>
}
```

**Fix:** Import the built-in from `@barefootjs/client`.

```tsx
// ✅ Fixed
import { Async } from '@barefootjs/client'

export function Page() {
  return <Async fallback={<p>Loading…</p>}><Body /></Async>
}
```

> A component of your own named `Async` / `Region` does **not** trip BF054 as
> long as it is imported or declared — the built-in only applies to the
> `@barefootjs/client` import.

---

## Suppressing Warnings

Suppress with `@bf-ignore`:

```tsx
// @bf-ignore props-destructuring
function Component({ checked }: Props) {
  // Warning suppressed
}
```

**Available rules:**

| Rule ID | Error Code | Description |
|---------|------------|-------------|
| `props-destructuring` | BF043 | Props destructuring in function parameters |

---

## Error Code Quick Reference

| Code | Severity | Description |
|------|----------|-------------|
| BF001 | Error | Missing `"use client"` directive |
| BF003 | Error | Client component importing server component |
| BF011 | Error | Module-level reactive declaration without `/* @client */` |
| BF013 | Error | Reactive primitive called through an unresolved namespace import |
| BF021 | Error | Unsupported JSX pattern for SSR |
| BF023 | Error | Missing key in list |
| BF043 | Warning | Props destructuring breaks reactivity |
| BF044 | Error | Signal/memo getter passed without calling it |
| BF049 | Error | Rich-typed prop read by client code cannot survive hydration |
| BF054 | Error | Built-in `<Async>` / `<Region>` used without `@barefootjs/client` import |
