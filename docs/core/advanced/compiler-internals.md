---
title: Compiler Internals
description: How the BarefootJS compiler transforms JSX into marked templates and client JavaScript.
---

# Compiler Internals

This page explains how the BarefootJS compiler transforms JSX source into marked templates and client JavaScript. Understanding these internals is useful for debugging compilation issues, writing custom adapters, or contributing to the compiler.

## Pipeline Overview

```
┌─────────────────────────────────────────────────────┐
│  JSX Source (.tsx with "use client")                 │
└──────────────────────┬──────────────────────────────┘
                       ↓
┌──────────────────────┴──────────────────────────────┐
│  1. Analyzer (analyzer.ts)                          │
│     Single-pass AST visitor                         │
│     Extracts: signals, memos, effects, props, types │
└──────────────────────┬──────────────────────────────┘
                       ↓
┌──────────────────────┴──────────────────────────────┐
│  2. JSX → IR (jsx-to-ir.ts)                         │
│     Transforms JSX AST to IR node tree              │
│     Assigns slotIds, detects reactivity             │
└──────────────────────┬──────────────────────────────┘
                       ↓
          ┌────────────┴────────────┐
          ↓                         ↓
┌─────────┴─────────┐  ┌───────────┴──────────┐
│ 3a. Adapter        │  │ 3b. IR → Client JS   │
│ IR → Template      │  │ ir-to-client-js/     │
│ (e.g., Hono JSX)   │  │ Hydration code       │
└────────────────────┘  └──────────────────────┘
```

## Entry Points

```typescript
// Async — reads files from disk
compileJSX(entryPath: string, readFile: ReadFileFn, options: CompileOptions): Promise<CompileResult>

// Sync — source string input
compileJSXSync(source: string, filePath: string, options: CompileOptions): CompileResult
```

Both support multi-component files — the compiler detects all exported components and compiles each independently, then merges the output.

---

## Phase 1: Analysis

The analyzer (`analyzer.ts`) performs a **single-pass** AST walk using TypeScript's compiler API. It collects everything the later phases need:

### What the Analyzer Extracts

| Category | Data | Example |
|----------|------|---------|
| Signals | getter/setter names, initial value, type | `[count, setCount] = createSignal(0)` |
| Memos | name, computation expression, type | `doubled = createMemo(() => count() * 2)` |
| Effects | effect body | `createEffect(() => { ... })` |
| onMounts | callback body | `onMount(() => { ... })` |
| Props | parameter style, type info, defaults | `(props: ButtonProps)` or `({ label }: Props)` |
| Imports | source, specifiers | `import { createSignal } from '@barefootjs/dom'` |
| Constants | name, value, dependencies | `const baseClass = 'btn'` |
| Functions | name, body, parameters | `function handleClick() { ... }` |
| Types | interfaces, type aliases | `interface ButtonProps { ... }` |
| JSX Return | the return statement's JSX | `return <button>...</button>` |
| Conditional Returns | early returns inside `if` blocks | `if (loading) return <Spinner />` |

### `"use client"` Validation

The analyzer checks for the `"use client"` directive at the top of the file. If the file contains reactive APIs (`createSignal`, `createEffect`, event handlers) but lacks the directive, it emits **BF001**:

```
error[BF001]: 'use client' directive required for components with createSignal
```

### Props Destructuring Detection

When props are destructured in the function parameter, the analyzer emits **BF043** (warning):

```tsx
// ⚠️ BF043: Destructuring captures values once — may lose reactivity
function Child({ count }: Props) { ... }

// ✅ No warning — direct access maintains reactivity
function Child(props: Props) { ... }
```

The warning can be suppressed with `// @bf-ignore props-destructuring`.

---

## Phase 2: JSX → IR

The `jsxToIR` function (`jsx-to-ir.ts`) transforms the analyzed JSX AST into the IR node tree.

### Reactivity Detection

The core decision at this phase is: **is this expression reactive?**

The compiler uses a two-tier detection strategy:

1. **TypeChecker path** — Walks the AST and checks each node's type for the `Reactive<T>` brand via `checker.getTypeAtLocation()`. This detects all reactive getters: signals, memos, and library-provided reactive accessors (e.g., `FieldReturn.error`, `FormReturn.isSubmitting`).

2. **Regex fallback** — Pattern-matches known signal/memo names and props references. Used when the TypeChecker cannot resolve imported types.

An expression is reactive if it matches any of:
- A `Reactive<T>`-branded type (via TypeChecker)
- A signal getter: `count()` — regex pattern `\bcount\s*\(`
- A memo: `doubled()` — same pattern
- A props reference: `props.value` — per-prop name matching (excludes `children`)
- A local constant derived from any of the above (taint analysis)

Reactive expressions get a `slotId` assigned, which becomes a `bf` hydration marker in the output.

### Slot ID Assignment

Elements receive a `slotId` (making them findable during hydration) when they have:

1. Event handlers (`onClick`, `onInput`, etc.)
2. Dynamic children (reactive expressions, loops, conditionals)
3. Reactive attributes (`class={expr()}`, `value={signal()}`)
4. Refs (`ref={callback}`)
5. Component references (always need initialization)

### Filter/Sort Chain Parsing

The compiler parses `.filter()` and `.sort()` chains before `.map()` for template-level evaluation:

```tsx
{todos().filter(t => !t.done).sort((a, b) => a.date - b.date).map(t => (
  <li>{t.name}</li>
))}
```

Simple patterns (e.g., `t => !t.done`, `(a, b) => a.price - b.price`) can be compiled for template-level evaluation. Complex patterns trigger **BF021** with a suggestion to use `/* @client */`. See [Error Codes Reference](./error-codes.md#bf021--unsupported-jsx-pattern) for details.

### Auto Scope Wrapping

If a component's IR root is a Provider (Context.Provider) with no wrapper element, the compiler wraps it in `<div style="display:contents">` to provide a DOM anchor for scope identification during hydration. The scope element is passed directly as the first argument to the init function.

---

## Phase 3a: Template Generation (Adapter)

Adapters implement the `TemplateAdapter` interface to convert IR nodes into backend-specific templates. See [Adapter Architecture](../adapters/adapter-architecture.md) for the full interface.

Each adapter handles:
- `renderElement()` — HTML elements with hydration markers
- `renderExpression()` — Dynamic values in the target template language
- `renderConditional()` — Template-level conditionals
- `renderLoop()` — Template-level iteration (with filter/sort if supported)
- `renderComponent()` — Child component includes

---

## Phase 3b: Client JS Generation

The `ir-to-client-js` module generates minimal JavaScript for hydration. It operates in several sub-phases:

### 1. Element Collection

Walk the IR tree and categorize elements:

| Category | Description | Example |
|----------|-------------|---------|
| `interactiveElements` | Elements with event handlers | `<button onClick={...}>` |
| `dynamicElements` | Elements with reactive text | `<span>{count()}</span>` |
| `conditionalElements` | Ternary/logical conditionals | `{open() ? <A/> : <B/>}` |
| `loopElements` | Array `.map()` loops | `{items().map(...)}` |
| `refElements` | Elements with ref callbacks | `<input ref={inputRef}>` |
| `reactiveAttrs` | Elements with reactive attributes | `<div class={cls()}>` |
| `clientOnlyElements` | `/* @client */` expressions | Skipped during SSR |

### 2. Dependency Resolution

Constants and functions are sorted by dependency:

```typescript
// "Early" constants — no reactive deps, emitted first
const baseClass = 'btn'
const THRESHOLD = 10

// "Late" constants — reference signals/memos, emitted after signal creation
const displayValue = `Count: ${count()}`
```

### 3. Controlled Signal Detection

The compiler detects when a signal name matches a prop name:

```tsx
function Switch(props: Props) {
  const [checked, setChecked] = createSignal(props.checked ?? false)
  //     ^^^^^^^ matches props.checked
}
```

This generates a sync effect immediately after the signal creation:

```javascript
createEffect(() => {
  const __val = props.checked
  if (__val !== undefined) setChecked(__val)
})
```

### 4. Code Generation Order

The generated `init` function follows this structure:

```javascript
import { $, $t, createEffect, createMemo, createSignal, hydrate, onMount } from '@barefootjs/dom'

export function initCounter(__scope, props = {}) {
  if (!__scope) return

  // 1. Props extraction (with defaults)
  const label = props.label ?? 'Click'

  // 2. Early constants (no reactive deps)
  const baseClass = 'counter'

  // 3. Local functions / handlers (before signals so signal initializers
  //    can reference them, e.g., createSignal(toArray(props.x)))
  const handleClick = () => { setCount(n => n + 1) }

  // 4. Signals, memos, controlled signal sync, and late constants
  const [count, setCount] = createSignal(props.initial ?? 0)
  createEffect(() => {                          // controlled signal sync
    const __val = props.initial
    if (__val !== undefined) setCount(__val)
  })
  const doubled = createMemo(() => count() * 2)
  const displayValue = `Count: ${count()}`      // late constant (reactive deps)

  // 5. Element references (always destructured, always returns array)
  //    $()  — regular elements:  find(scope, '[bf="id"]')
  //    $t() — text nodes:        find comment marker <!--bf:id-->
  //    $c() — child components:  find(scope, '[bf-s$="_id"]')
  const [_s3] = $(__scope, 's3')
  const [_s0, _s2] = $t(__scope, 's0', 's2')

  // 6. Dynamic text updates
  createEffect(() => {
    const __val = count()
    if (_s0) _s0.nodeValue = String(__val)
  })

  // 7. Reactive attribute updates
  createEffect(() => {
    if (_s3) { _s3.disabled = !!(count() > 10) }
  })

  // 8. Conditional updates
  // insert(_s4, () => isOpen() ? panelHtml : null)

  // 9. Loop updates
  // reconcileElements(_s5, items(), getKey, renderItem)

  // 10. Event handlers
  if (_s3) _s3.onclick = handleClick

  // 11. Reactive prop bindings / child component props
  // 12. Ref callbacks
  // 13. User-defined effects and onMounts
  createEffect(() => { console.log('Count changed:', count()) })
  onMount(() => { console.log('Mounted') })

  // 14. Provider setup and child component initialization
}

// Registration: hydrate() registers the component and initializes all
// instances on the page. Template inclusion depends on two factors:
// 1. Static template (no signal deps) → always included
// 2. CSR fallback template → only when used as a child component
// Top-level-only components with signals skip template to save bytes.
hydrate('Counter', { init: initCounter })
```

### 5. Import Detection

The generator scans the output code and includes only the `@barefootjs/dom` imports actually used:

```javascript
import { $, $t, createEffect, createMemo, createSignal, hydrate, onMount } from '@barefootjs/dom'
```

### 6. Template Registration

The compiler decides whether to include a `template` function in the `hydrate()` call based on two factors:

**Static template** — When `canGenerateStaticTemplate()` returns true (no signal-dependent expressions), a lightweight template is always included:

```javascript
hydrate('Button', {
  init: initButton,
  template: (props) => `<button class="${props.className ?? ''}" bf="s0">${props.children}</button>`
})
```

**CSR fallback template** — When a component has signals (can't generate a static template) but is used as a child by another component in the same file, a CSR fallback template is generated. This template replaces signal calls with initial values so `createComponent()` can render the component in loops and conditionals:

```javascript
// StatusBadge is used by Dashboard in the same file → gets CSR fallback
hydrate('StatusBadge', {
  init: initStatusBadge,
  template: (props) => `<span bf="s0">${props.active ? 'on' : 'off'}</span>`
})

// Dashboard is top-level only → no template (saves bytes)
hydrate('Dashboard', { init: initDashboard })
```

**No template** — Top-level-only components with signals skip template generation entirely. They are hydrated from server-rendered HTML and never need to be created dynamically by `createComponent()`.

---

## Multi-Component Files

When a file exports multiple components, the compiler uses a **two-pass** approach:

1. **Pass 1** — Detects all exports via `listExportedComponents()`, then runs analysis and JSX → IR for each component
2. **Between passes** — Scans all IRs with `collectComponentNamesFromIR()` to build a `usedAsChild` set (components referenced by other components in the same file)
3. **Pass 2** — Runs adapter generation and client JS generation for each component, passing `usedAsChild` so that only child components get CSR fallback templates
4. Merges templates — deduplicates shared imports and type definitions
5. Merges client JS — combines imports by source module

```tsx
// Both compiled from the same file
export function Button(props: ButtonProps) { ... }
export function IconButton(props: IconButtonProps) { ... }
```

---

## Debugging Tips

### View the IR

```typescript
const result = compileJSXSync(source, 'file.tsx', { adapter })
console.log(JSON.stringify(result.ir, null, 2))
```

### View generated client JS

```typescript
console.log(result.clientJs)
```

