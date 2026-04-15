---
title: Error Codes Reference
description: Complete list of BF-prefixed compiler error codes with explanations and fixes.
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

### BF002 — Invalid Directive Position

**Trigger:** `"use client"` not first statement.

```tsx
// ❌ BF002
import { createSignal } from '@barefootjs/client'
"use client"
```

**Fix:** Move to the first line (before imports).

### BF003 — Client Component Importing Server Component

**Trigger:** Client component imports from a file without `"use client"`.

**Fix:** Add `"use client"` to the imported file, or import only types/constants.

---

## Signal Errors (BF010–BF012)

### BF010 — Unknown Signal Reference

**Trigger:** Undeclared signal getter referenced.

```tsx
"use client"
export function Counter() {
  return <span>{count()}</span>  // ❌ count not declared
}
```

**Fix:**

```tsx
const [count, setCount] = createSignal(0)
```

### BF011 — Signal Used Outside Component

**Trigger:** `createSignal` at module level.

```tsx
// ❌ BF011 — module-level signal
const [count, setCount] = createSignal(0)

export function Counter() {
  return <span>{count()}</span>
}
```

**Fix:**

```tsx
export function Counter() {
  const [count, setCount] = createSignal(0)
  return <span>{count()}</span>
}
```

### BF012 — Invalid Signal Usage

**Trigger:** Unsupported signal API pattern.

---

## JSX Errors (BF020–BF023)

### BF020 — Invalid JSX Expression

**Trigger:** Uncompilable JSX expression.

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

### BF022 — Invalid JSX Attribute

**Trigger:** Uncompilable attribute value.

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

## Type Errors (BF030–BF031)

### BF030 — Type Inference Failed

**Trigger:** Type inference failed for signal or expression.

### BF031 — Props Type Mismatch

**Trigger:** Prop value doesn't match declared type.

---

## Component Errors (BF040–BF044)

### BF040 — Component Not Found

**Trigger:** Unresolvable child component reference.

### BF041 — Circular Dependency

**Trigger:** Mutual component imports.

### BF042 — Invalid Component Name

**Trigger:** Non-PascalCase component name.

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
// ⚠️ BF044
<Child count={count} />  // Passing getter function, not the value
```

**Fix:**

```tsx
// ✅ Fixed
<Child count={count()} />
```

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
| BF002 | Error | Invalid directive position |
| BF003 | Error | Client component importing server component |
| BF010 | Error | Unknown signal reference |
| BF011 | Error | Signal used outside component |
| BF012 | Error | Invalid signal usage |
| BF020 | Error | Invalid JSX expression |
| BF021 | Error | Unsupported JSX pattern for SSR |
| BF022 | Error | Invalid JSX attribute |
| BF023 | Error | Missing key in list |
| BF030 | Error | Type inference failed |
| BF031 | Error | Props type mismatch |
| BF040 | Error | Component not found |
| BF041 | Error | Circular dependency |
| BF042 | Error | Invalid component name |
| BF043 | Warning | Props destructuring breaks reactivity |
| BF044 | Error | Signal/memo getter passed without calling it |
