---
title: Adapter Architecture
description: How adapters convert the compiler's IR into server-renderable template formats.
---

# Adapter Architecture

An adapter converts the compiler's IR into a template format your server can render.


## Role

1. **Phase 1** parses JSX → backend-agnostic `ComponentIR` (JSON tree)
2. **Phase 2a** adapter converts IR → marked template in target language
3. **Phase 2b** generates client JS from IR (no adapter involved)

```
ComponentIR (JSON)
    ↓
┌───────────────────────────────┐
│         TemplateAdapter       │
│                               │
│  renderElement()              │
│  renderExpression()           │
│  renderConditional()          │
│  renderLoop()                 │
│  renderComponent()            │
│  ...                          │
└───────────────────────────────┘
    ↓
Marked Template + optional types
```

Each IR node is translated into the target template language with hydration markers (`bf-*` attributes).


## `TemplateAdapter` Interface

```typescript
interface TemplateAdapter {
  name: string       // Adapter identifier (e.g., 'hono', 'go-template')
  extension: string  // Output file extension (e.g., '.hono.tsx', '.tmpl')

  // Main entry point
  generate(ir: ComponentIR, options?: AdapterGenerateOptions): AdapterOutput

  // Node rendering — one method per IR node type
  renderNode(node: IRNode): string
  renderElement(element: IRElement): string
  renderExpression(expr: IRExpression): string
  renderConditional(cond: IRConditional): string
  renderLoop(loop: IRLoop): string
  renderComponent(comp: IRComponent): string

  // Hydration markers
  renderScopeMarker(instanceIdExpr: string): string
  renderSlotMarker(slotId: string): string
  renderCondMarker(condId: string): string

  // Optional: type generation for typed languages
  generateTypes?(ir: ComponentIR): string | null
}
```

### `generate()`

```typescript
interface AdapterOutput {
  template: string     // The generated template code
  types?: string       // Optional generated types (Go structs, etc.)
  extension: string    // File extension for the output
}
```

### `AdapterGenerateOptions`

```typescript
interface AdapterGenerateOptions {
  skipScriptRegistration?: boolean  // For child components bundled in parent
  scriptBaseName?: string           // For non-default exports sharing a parent's client JS
}
```

### Node rendering methods

| Method | IR Node | Responsibility |
|--------|---------|----------------|
| `renderElement()` | `IRElement` | HTML elements with attributes, events, and hydration markers |
| `renderExpression()` | `IRExpression` | Dynamic expressions (e.g., `{count()}`, `{props.name}`) |
| `renderConditional()` | `IRConditional` | Ternaries and `&&`/`||` expressions |
| `renderLoop()` | `IRLoop` | `.map()`, `.filter().map()`, `.sort().map()` chains |
| `renderComponent()` | `IRComponent` | Nested component invocations |
| `renderNode()` | `IRNode` | Dispatcher — routes to the correct method based on node type |

### Hydration marker methods

| Method | Marker | Purpose |
|--------|--------|---------|
| `renderScopeMarker()` | `bf-s` | Component boundary for scoped hydration |
| `renderSlotMarker()` | `bf` | Interactive element identifier |
| `renderCondMarker()` | `bf-c` | Conditional block for DOM switching |


## `BaseAdapter` Class

`BaseAdapter` implements the `TemplateAdapter` interface with a `renderChildren()` utility:

```typescript
abstract class BaseAdapter implements TemplateAdapter {
  abstract name: string
  abstract extension: string

  // ... all abstract methods from TemplateAdapter

  renderChildren(children: IRNode[]): string {
    return children.map(child => this.renderNode(child)).join('')
  }
}
```

Extending `BaseAdapter` is optional.


## IR Node Types

Each adapter must handle all IR node types:

### `IRElement`

An HTML element with attributes, events, and children.

```typescript
{
  type: 'element'
  tag: string              // 'div', 'button', 'input', etc.
  attrs: IRAttribute[]     // Static and dynamic attributes
  events: IREvent[]        // Event handlers (onClick, onChange, etc.)
  children: IRNode[]       // Child nodes
  slotId: string | null    // Hydration slot ID (e.g., 'slot_0')
  needsScope: boolean      // True if this is the component root
}
```

### `IRExpression`

A dynamic expression in the template.

```typescript
{
  type: 'expression'
  expr: string             // The JS expression (e.g., 'count()', 'props.name')
  reactive: boolean        // True if the expression depends on signals
  slotId: string | null    // Slot ID for client updates
  clientOnly?: boolean     // True if wrapped in /* @client */
}
```

### `IRConditional`

A ternary or logical expression that produces different output.

```typescript
{
  type: 'conditional'
  condition: string        // The JS condition
  whenTrue: IRNode         // Rendered when condition is true
  whenFalse: IRNode        // Rendered when condition is false
  reactive: boolean        // True if the condition depends on signals
  slotId: string | null    // Slot ID for DOM switching
}
```

### `IRLoop`

An array iteration (`.map()`, optionally chained with `.filter()` or `.sort()`).

```typescript
{
  type: 'loop'
  array: string            // The array expression
  param: string            // Iterator parameter name
  index: string | null     // Index parameter name
  children: IRNode[]       // Loop body
  isStaticArray: boolean   // True if iterating a prop (not a signal)
  filterPredicate?: {...}  // For .filter().map() chains
  sortComparator?: {...}   // For .sort().map() chains
}
```

### `IRComponent`

A nested component invocation.

```typescript
{
  type: 'component'
  name: string             // Component name (e.g., 'TodoItem')
  props: IRProp[]          // Props passed to the component
  children: IRNode[]       // Children (slots)
  slotId: string | null    // Slot ID if parent binds event handlers
}
```

### Other node types

| Type | Description |
|------|-------------|
| `IRText` | Static text content |
| `IRFragment` | Fragment (`<>...</>`) wrapper |
| `IRSlot` | `{children}` or `<Slot />` placeholder |
| `IRIfStatement` | Top-level if/else if/else blocks |
| `IRProvider` | Context provider wrapper |
| `IRTemplateLiteral` | Template literal expressions |


## Hydration Markers

`bf-*` attributes tell the client JS where to attach behavior:

| Marker | Example | Purpose |
|--------|---------|---------|
| `bf-s` | `<div bf-s="Counter_a1b2">` | Component boundary — scopes all queries inside |
| `bf` | `<p bf="slot_0">` | Interactive element — target for effects and event handlers |
| `bf-c` | `<div bf-c="slot_2">` | Conditional block — target for DOM switching |



## Script Registration

Adapters register client JS during server rendering to ensure each script loads exactly once:

- **Hono**: `useRequestContext()` collects script paths; `BfScripts` renders the `<script>` tags.
- **Go Template**: `ScriptCollector` tracks needed scripts; renders `<script>` tags at page end.


## Type Generation

For typed backends, `generateTypes()` produces type definitions alongside the template. The Go Template adapter generates:

- **Go structs** for component input and props types
- **JSON tags** for prop serialization
- **Constructor functions** like `New{Component}Props()` with default values

```go
// Generated by GoTemplateAdapter
type CounterInput struct {
    Initial int `json:"initial"`
}

type CounterProps struct {
    Initial  int    `json:"initial"`
    ScopeID  string `json:"scopeId"`
}

func NewCounterProps(input CounterInput) CounterProps {
    return CounterProps{
        Initial: input.Initial,
    }
}
```

Dynamically-typed adapters (like Hono) skip this.
