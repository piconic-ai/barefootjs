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

### BF003 — Client Component Importing Server Component

**Trigger:** Client component imports from a file without `"use client"`.

**Fix:** Add `"use client"` to the imported file, or import only types/constants.

---

## Signal Errors (BF011)

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

## JSX Errors (BF021–BF023)

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

// ❌ BF021 — block bodies, localeCompare, ternary operators, etc. are not supported
{items().sort((a, b) => { return a.price - b.price }).map(...)}
{items().sort((a, b) => a.name.localeCompare(b.name)).map(...)}
```

#### Workaround

```tsx
{/* @client */ todos().filter(t => t.items.some(i => i.done)).map(t => (
  <li>{t.name}</li>
))}
```

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

## Component Errors (BF043–BF044)

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
| BF021 | Error | Unsupported JSX pattern for SSR |
| BF023 | Error | Missing key in list |
| BF043 | Warning | Props destructuring breaks reactivity |
| BF044 | Error | Signal/memo getter passed without calling it |
| BF054 | Error | Built-in `<Async>` / `<Region>` used without `@barefootjs/client` import |
