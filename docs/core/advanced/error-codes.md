---
title: Error Codes Reference
description: BF-prefixed compiler error codes, what triggers each one, and the fix.
---

# Error Codes Reference

Errors are `BF` + a 3-digit code, reported with a source location and a fix hint.

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

A reactive API is used in a file without `"use client"`.

```tsx
// ❌ BF001
import { createSignal } from '@barefootjs/client'
export function Counter() {
  const [count, setCount] = createSignal(0)
  return <button onClick={() => setCount(n => n + 1)}>{count()}</button>
}
```

#### Fix

Add `"use client"` as the first line of the file. See [Component Authoring](../components/component-authoring.md).

<a id="bf003"></a>

### BF003 — Client Component Importing Server Component

A `"use client"` component imports a component from a file without the directive.

#### Fix

Add `"use client"` to the imported file, or import only types and constants from it.

---

## Signal Errors (BF011–BF013)

<a id="bf011"></a>

### BF011 — Module-Level Reactive Declaration

A `createSignal` or `createMemo` call at module scope without a leading `/* @client */`.

```tsx
'use client'
import { createSignal } from '@barefootjs/client'
// ❌ BF011 — module-level signal without opt-in
const [count, setCount] = createSignal(0)
export function Counter() {
  return <button onClick={() => setCount(count() + 1)}>{count()}</button>
}
```

#### Fix

Move the declaration into the component so each mount gets its own state. For a store shared across components, put `/* @client */` on the line before the declaration instead: the signal lives in the client bundle and SSR renders a placeholder for every read.

```tsx
/* @client */
const [count, setCount] = createSignal(0)
```

See [Context API](../components/context-api.md) for sharing state across files.

<a id="bf013"></a>

### BF013 — Reactive Primitive Called Through a Namespace Import

A reactive primitive (`createSignal`, `createMemo`, `createEffect`, `onMount`, `onCleanup`, `createSearchParams`) is called as `ns.createSignal(...)` through a namespace import; the declaration is dropped from the compiled output and every reference throws at hydration.

```tsx
'use client'
// ❌ BF013 — namespace-qualified call is not recognized
import * as bf from '@barefootjs/client'
export function Counter() {
  const [count, setCount] = bf.createSignal(0)
  return <button onClick={() => setCount(count() + 1)}>{count()}</button>
}
```

#### Fix

Import the primitive by name: `import { createSignal } from '@barefootjs/client'`. See [Reactivity](../reactivity.md).

---

## JSX Errors (BF021–BF029)

<a id="bf021"></a>

### BF021 — Unsupported JSX Pattern

A `.filter()` predicate or `.sort()` comparator has a shape a template-language adapter cannot lower: an imperative block body, `typeof`, a call to a user function, or a comparator referenced from an import, a prop, or an alias. JS-runtime adapters (Hono, CSR) run the callback at SSR. Every adapter raises it for a method call on a prop typed `Date`, `Map`, `Set`, or another host type with no catalogued lowering (`createdAt.toISOString()`).

```tsx
// ❌ BF021 on Go/Mojo
{items().filter(t => typeof t === 'string').map(...)}
{items().sort(importedCmp).map(...)}
```

#### Fix

Rewrite the predicate as a plain expression, declare the comparator in the same file, or defer with `/* @client */`. For a rich-typed prop, format the value in the backend and pass a string.

```tsx
// ✅ Fixed
{/* @client */ items().sort(importedCmp).map(t => <li key={t.id}>{t.name}</li>)}
```

See [Adapter limits](../rendering/jsx-compatibility.md#adapter-limits).

<a id="bf023"></a>

### BF023 — Missing Key in List

A `.map()` loop renders elements without a `key`.

```tsx
// ❌ BF023
{items().map(item => <li>{item.name}</li>)}
```

#### Fix

```tsx
// ✅ Add key
{items().map(item => <li key={item.id}>{item.name}</li>)}
```

See [List rendering](../rendering/jsx-compatibility.md#list-rendering).

<a id="bf029"></a>

### BF029 — Fragment-Wrapped Conditional Return Branch

In a client component with several `return` statements, one branch returns a bare fragment. The client decides once per component whether its root scope is comment-based, so that branch is never claimed during hydration and its events do not bind.

```tsx
// ❌ BF029
'use client'
import { createSignal } from '@barefootjs/client'
export function Toggle(props: { x: boolean }) {
  const [count, setCount] = createSignal(0)
  if (props.x) return <a>link</a>
  return <><button onClick={() => setCount(count() + 1)}>{count()}</button></>
}
```

#### Fix

Wrap the branch in a real element, or put `/* @client */` immediately before the fragment (`return /* @client */ <>…</>`) to accept the gap.

```tsx
// ✅ Fixed
return <div><button onClick={() => setCount(count() + 1)}>{count()}</button></div>
```

See [Fragments](../rendering/jsx-compatibility.md#fragments).

---

## Template Adapter Errors (BF101–BF102)

<a id="bf101"></a>

### BF101 — No Template-Language Lowering

A template-language adapter (Go, Mojolicious, Xslate, ERB, Jinja, Twig, Blade, minijinja, Pebble) has no lowering for the expression: `.reduce()`, `.forEach()`, a nested `.some()`/`.find()`/`.reduce()` inside a filter predicate, a `.map()` over a component-scope `const` computed at render time, or a module-scope helper called in a text position. JS-runtime adapters run it verbatim. Nested `.filter()`/`.map()` and `.flatMap()` JSX projections compile everywhere.

```tsx
// ❌ BF101 on Go/Mojo
{items().filter(t => picked().some(p => p.id === t.id)).map(t => <li key={t.id}>{t.name}</li>)}
```

#### Fix

Pass the computed value as a prop (keeps SSR), or defer with `/* @client */` (empty until hydration):

```tsx
// ✅ Fixed
{/* @client */ items().filter(t => picked().some(p => p.id === t.id)).map(t => (
  <li key={t.id}>{t.name}</li>
))}
```

Per-adapter table: [compatibility matrix](/docs/advanced/compatibility-matrix); worked examples in [Adapter limits](../rendering/jsx-compatibility.md#adapter-limits).

<a id="bf102"></a>

### BF102 — Adapter-Specific Condition Not Supported

The Go adapter meets a condition it cannot lower in a boolean-test position, where its template grammar has no place for a helper: a complex predicate in an `else if`, or a module-scope helper called from an `if` condition.

```tsx
// ❌ BF102 on Go
function isVip(user: User) { return user.tier === 'gold' && user.active }

export function Badge({ user }: { user: User }) {
  if (user.banned) return <span>Banned</span>
  else if (isVip(user)) return <span>VIP</span>
  return <span>Member</span>
}
```

#### Fix

Pre-compute the value in your Go handler and pass it as a prop (`{ user, vip }: { user: User; vip: boolean }`). A condition has no `/* @client */` escape: forcing it to a fixed value at SSR would be a correctness hazard. See [Go Template Adapter](../adapters/go-template-adapter.md).

---

## Component Errors (BF044–BF056)

<a id="bf044"></a>

### BF044 — Signal/Memo Getter Not Called

A signal or memo getter is passed uncalled in a rendered position — a DOM attribute or a JSX text child. A component prop (`<Child count={count} />`) is fine: the child calls it at its own read site.

```tsx
// ❌ BF044
<div count={count} />  // Passing getter function, not the value
```

#### Fix

```tsx
// ✅ Fixed
<div count={count()} />
```

See [createSignal](../reactivity/create-signal.md).

<a id="bf049"></a>

### BF049 — Rich-Typed Prop Not Hydratable

A prop typed as a JSON-unsafe host type (`Map`, `Set`, `WeakMap`, `WeakSet`, `URLSearchParams`, `RegExp`, `Promise`, `Error`, `Symbol`, `BigInt`, `Function`) is used in the component's own client code. Props cross the hydration boundary as JSON, so a `Map` arrives as `{}` and a `BigInt` fails to serialize. `Date` and `URL` are exempt.

```tsx
// ❌ BF049 — a Map prop used by client code cannot survive hydration
'use client'
export function Foo({ data }: { data: Map<string, number> }) {
  return <button onClick={() => console.log(data.get('x'))}>go</button>
}
```

#### Fix

Pass a JSON-serializable value and rebuild the rich value on the client:

```tsx
// ✅ Fixed
'use client'
export function Foo({ entries }: { entries: [string, number][] }) {
  return <button onClick={() => console.log(new Map(entries).get('x'))}>go</button>
}
```

See [Props Reactivity](../reactivity/props-reactivity.md).

<a id="bf054"></a>

### BF054 — Built-in `<Async>` / `<Region>` Used Without Import

A bare `<Async>` or `<Region>` tag is used without importing it from `@barefootjs/client`. The built-ins are recognised by their import, not by tag name; your own component with that name is fine as long as it is imported or declared.

```tsx
// ❌ BF054
export function Page() {
  return <Async fallback={<p>Loading…</p>}><Body /></Async>
}
```

#### Fix

Add `import { Async } from '@barefootjs/client'`. See [API Reference](./api-reference.md).

<a id="bf056"></a>

### BF056 — Authored Call to `formatDate`

`formatDate` from `@barefootjs/client` is called in a template position. It is the compiler's own lowering target for `.toLocaleDateString()`, not an authored API, and this fires on every adapter.

```tsx
// ❌ BF056
import { formatDate } from '@barefootjs/client'
export function Post({ createdAt }: { createdAt: Date }) {
  return <time>{formatDate(createdAt, 'YYYY-MM-DD')}</time>
}
```

#### Fix

Use `.toLocaleDateString()` with literal options, which compiles to the same helper on every adapter, or defer the call with `{/* @client */ formatDate(createdAt, 'YYYY-MM-DD')}`.

```tsx
// ✅ Fixed
export function Post({ createdAt }: { createdAt: Date }) {
  return <time>{createdAt.toLocaleDateString('en-US', { timeZone: 'UTC' })}</time>
}
```

See [API Reference](./api-reference.md).

---

## Quick Reference

| Code | Description |
|------|-------------|
| BF001 | Missing `"use client"` directive |
| BF003 | Client component importing server component |
| BF011 | Module-level reactive declaration without `/* @client */` |
| BF013 | Reactive primitive called through a namespace import |
| BF021 | Unsupported predicate/comparator shape |
| BF023 | Missing key in list |
| BF029 | Fragment-wrapped conditional return branch never hydrates |
| BF044 | Signal/memo getter passed without calling it |
| BF049 | Rich-typed prop not hydratable |
| BF054 | Built-in `<Async>` / `<Region>` used without import |
| BF056 | Authored call to `formatDate` |
| BF101 | No template-language lowering for the expression |
| BF102 | Adapter-specific condition not supported |
