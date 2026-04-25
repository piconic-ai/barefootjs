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
  predicate?: ParsedExpr     // Simple expression body
  blockBody?: ParsedStatement[] // Complex block body with if/return
  raw: string                // Original JS source
}
```

Adapters should render the filter as a conditional wrapper inside the loop (e.g., `if (condition) { children }`), not by pre-filtering the array. The filter param may differ from the loop param (e.g., filter uses `t`, loop uses `todo`) — adapters must map between them.

### Loop emission shapes (client JS)

The client JS emitter classifies each `IRLoop` into one of four shapes for code generation. The category is captured by the corresponding `*LoopPlan` type in `packages/jsx/src/ir-to-client-js/control-flow/plan/types.ts`:

| Shape | Body | Plan type | Client emission |
|---|---|---|---|
| **Static** | array is a constant literal (no signal) | `StaticLoopPlan` | `arr.forEach(...)` for reactive attrs / texts only |
| **Plain** | dynamic array, body is a plain element with no child components and no inner loops | `PlainLoopPlan` | `mapArray(() => arr, container, keyFn, renderItem)` returning a clone of the template |
| **Component** | dynamic array, body is a single child component (with optional nested child components) | `ComponentLoopPlan` | `mapArray(...)` whose `renderItem` calls `initChild` (SSR) or `createComponent` (CSR) |
| **Composite** | dynamic array, body is a plain element that **contains** at least one child component or inner loop | `CompositeLoopPlan` | `mapArray(...)` whose `renderItem` rebuilds the body element and dispatches both component init and inner-loop setup |

"Composite" specifically denotes the *plain-element-with-children* case. A loop whose body is a bare component is **Component**, not Composite — keeping the two separate avoids the historical "composite means two different things" confusion.

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

Adapters are **template-language specialists**. Their sole responsibility is converting IR into HTML templates with hydration markers (`bf-s`, `bf`, `bf-c`, etc.).

Adapters **must not** handle:
- **Module structure** — `export` keywords, default exports
- **Client-package import filtering** — Stripping `@barefootjs/client`, `@barefootjs/client` imports
- **Client JS generation** — Handled independently by `ir-to-client-js` (adapter-agnostic)

These concerns belong in the **compiler layer**, which orchestrates adapter output and client JS into the final module.

**Rationale:** If adapters take on module-structure concerns, every new adapter must re-implement them. The adapter conformance tests (HTML comparison) cannot catch gaps in these non-template concerns, leading to silent drift between adapters.

```
IR (ComponentIR)
 ├─→ Adapter: HTML template + markers only
 ├─→ Compiler: Module structure (imports, exports, assembly)
 └─→ ir-to-client-js: Client JS (adapter-independent)
```

The **hydration contract** between template and client JS is maintained through shared marker constants (`bf-s`, `bf`, `bf-c`). As long as an adapter's rendered HTML contains correct markers, client JS will hydrate it correctly regardless of the template language.

### Available Adapters

- **HonoAdapter** (`@barefootjs/hono`) - Generates hono/jsx compatible TSX
- **GoTemplateAdapter** (`@barefootjs/go-template`) - Generates Go html/template files
- **MojoAdapter** (`@barefootjs/mojolicious`) - Generates Mojolicious EP template files (.html.ep)

### Implementing a New Adapter

When implementing a new adapter, handle these concerns in addition to the basic `TemplateAdapter` interface:

#### Child Component Rendering

Child components produce `IRComponent` nodes. The adapter emits a call to the runtime's child-render mechanism (e.g., `render_child('name', prop => val)`). Key rules:

- **Skip `onXxx` callback props** — Event handler props (names matching `/^on[A-Z]/`) are client-only and should be omitted from SSR output.
- **Pass `_bf_slot` for static children** — Non-loop children have unique `slotId`s. Pass this to the child renderer so it can set the correct scope ID (`{parentScope}_{slotId}`). Loop children use `{ChildName}_{random}` pattern instead.
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

For complex block body filters (with `if/return` statements), collect all return paths and combine with OR logic. See `GoTemplateAdapter.renderBlockBodyCondition()` as reference.

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
| `higher-order` | `filter()`, `every()`, `some()` on arrays |

#### Standalone Higher-Order Expressions

Expressions like `todos().filter(t => !t.done).length` appear as `IRExpression` nodes (not inside loops). Use `parseExpression()` from `@barefootjs/jsx` to get the `ParsedExpr` AST, detect `higher-order` kind, and convert to the target language's equivalent (e.g., Perl `grep`, Go `bf_filter` helper).

#### Character Encoding

For non-JS backends, ensure proper UTF-8 handling:

- Template output should be character strings, with encoding handled by the framework's output layer
- JSON embedded in HTML attributes (`bf-p`) must not be double-encoded
- Add `<meta charset="UTF-8">` to HTML layouts

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
| BF025 | Unsupported destructure shape in `.map()` callback (rest element or computed property key) |
| BF030 | Type inference failed |
| BF031 | Props type mismatch |
| BF043 | Props destructuring breaks reactivity |
| BF044 | Signal/memo getter passed without calling it |

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
