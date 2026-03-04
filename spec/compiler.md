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
    ├── *.ir.json (intermediate output, optional)
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

### Hydration Markers

1. **Marked Template**: Template with hydration markers (used for both SSR and CSR)

   | Marker | Purpose | Example |
   |--------|---------|---------|
   | `bf-s` | Component scope boundary (`~` prefix = child) | `bf-s="Counter_a1b2"`, `bf-s="~Item_c3d4"` |
   | `bf` | Interactive element (slot) | `bf="s0"` |
   | `bf-p` | Serialized props JSON | `bf-p='{"initial":5}'` |
   | `bf-c` | Conditional element | `bf-c="s2"` |
   | `bf-po` | Portal owner scope ID | `bf-po="Dialog_a1b2"` |
   | `bf-pi` | Portal container ID | `bf-pi="bf-portal-1"` |
   | `bf-pp` | Portal placeholder | `bf-pp="bf-portal-1"` |
   | `bf-i` | List item marker | `bf-i` |

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
- `IRConditional` - Ternary/logical conditionals
- `IRLoop` - Array mapping (.map()), with optional `filterPredicate` and `sortComparator`
- `IRComponent` - Child component references
- `IRSlot` - Slot placeholders

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

### Available Adapters

- **HonoAdapter** (`@barefootjs/hono`) - Generates hono/jsx compatible TSX
- **GoTemplateAdapter** (`@barefootjs/go-template`) - Generates Go html/template files

---

## Error Codes

| Code | Description |
|------|-------------|
| BF001 | Missing 'use client' directive |
| BF002 | Invalid directive position |
| BF003 | Client component importing server component |
| BF010 | Unknown signal reference |
| BF011 | Signal used outside component |
| BF020 | Invalid JSX expression |
| BF021 | Unsupported JSX pattern (e.g., filter predicate or sort comparator too complex for template compilation) |
| BF030 | Type inference failed |
| BF031 | Props type mismatch |
| BF043 | Props destructuring breaks reactivity |
| BF044 | Signal/memo getter passed without calling it |
| BF045 | Component in JSX prop may cause silent hydration failure |

### Error Format

```
error[BF001]: 'use client' directive required for components with createSignal

  --> src/components/Counter.tsx:3:1
   |
 3 | import { createSignal } from '@barefootjs/dom'
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

**Sort comparators**: Only simple `(a, b) => a.field - b.field` patterns are supported. Complex comparators (`.localeCompare()`, block body, multi-field) trigger BF021.

```
error[BF021]: Expression cannot be compiled to marked template: Sort comparator 'a.name.localeCompare(b.name)' is not a simple subtraction pattern (a.field - b.field)

  --> src/components/List.tsx:9:30
   |
 9 |             {items().sort((a, b) => a.name.localeCompare(b.name)).map(t => (
   |                           ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
   |
   = help: Add /* @client */ to evaluate this expression on the client only
```

**Supported sort patterns**:
- `sort((a, b) => a.price - b.price)` → ascending by `price`
- `toSorted((a, b) => b.priority - a.priority)` → descending by `priority`
- `filter(...).sort(...).map(...)` → filter + sort chaining
- `sort(...).filter(...).map(...)` → sort + filter chaining

**Suppression with `@client`**: If the developer intentionally wants client-only evaluation, add `/* @client */` before the expression. This suppresses the BF021 error:

```tsx
{/* @client */ todos().filter(t => t.items.some(i => i.done)).map(t => (
  <li>{t.name}</li>
))}
```

When `@client` is present, the compiler skips template generation for that expression without emitting an error.

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

---

## Open Questions

1. **Type inference depth** - How deeply to resolve types like `Pick<T, K>`?
2. **Source maps** - Generate source maps for Client JS debugging?
3. **Constant ordering** - How to handle dependencies more robustly?
