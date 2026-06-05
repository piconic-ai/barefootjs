---
title: Go Template Adapter
description: Generate Go html/template files and type definitions from the compiler's IR.
---

# Go Template Adapter

Generates Go `html/template` files (`.tmpl`) and type definitions (`_types.go`) from the compiler's IR.

```
npm install @barefootjs/go-template
```


## Server integration

The adapter is **web-framework-agnostic** — it emits plain Go `html/template`
files plus a small runtime (`FuncMap`, `Renderer`), so any server that can
parse and execute `html/template` can render the output. The scaffolder
(`npm create barefootjs@latest -- --adapter <name>`) ships runnable starters
for four Go servers, all built on this adapter:

| `--adapter` | Framework | Router |
|-------------|-----------|--------|
| `echo` | [Echo](https://echo.labstack.com/) | `echo.Renderer` |
| `gin` | [Gin](https://gin-gonic.com/) | `gin.Engine` |
| `chi` | [Chi](https://go-chi.io/) | `chi.Router` (net/http) |
| `nethttp` | Go standard library | `http.ServeMux` |

Each scaffold loads the generated `.tmpl` files into a `template.Template`
with `bf.FuncMap()`, then renders a component through `bf.NewRenderer(...)`.
Runnable end-to-end examples for all four live under
[`integrations/`](https://github.com/piconic-ai/barefootjs/tree/main/integrations).


## Basic Usage

```typescript
import { compile } from '@barefootjs/jsx'
import { GoTemplateAdapter } from '@barefootjs/go-template'

const adapter = new GoTemplateAdapter()
const result = compile(source, { adapter })

// result.template  → .tmpl file content
// result.types     → _types.go file content
// result.clientJs  → .client.js file content
```


## Options

```typescript
const adapter = new GoTemplateAdapter({
  packageName: 'views',
})
```

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `packageName` | `string` | `'components'` | Go package name for generated type files |


## Output Format

### Server Component

**Source:**

```tsx
export function Greeting(props: { name: string }) {
  return <p>Hello, {props.name}!</p>
}
```

**Output (.tmpl):**

```go-template
{{define "Greeting"}}
<p bf-s="{{bfScopeAttr .}}" {{bfPropsAttr .}} bf="s1">
  Hello, {{bfTextStart "s0"}}{{.Name}}{{bfTextEnd}}!
</p>
{{end}}
```

- `bfScopeAttr` — generates the `bf-s` scope ID
- `bfPropsAttr` — serializes props for client hydration
- `bfTextStart` / `bfTextEnd` — text node markers (rendered as `<!--bf:s0-->...<!--/-->`)

### Client Component

**Source:**

```tsx
"use client"
import { createSignal } from '@barefootjs/client'

export function Counter(props: { initial?: number }) {
  const [count, setCount] = createSignal(props.initial ?? 0)

  return (
    <div>
      <span>Count: {count()}</span>
      <button onClick={() => setCount(n => n + 1)}>+1</button>
    </div>
  )
}
```

**Output (.tmpl):**

```go-template
{{define "Counter"}}
{{if .Scripts}}{{.Scripts.Register "/static/client/barefoot.js"}}{{.Scripts.Register "/static/client/Counter.client.js"}}{{end}}
<div bf-s="{{bfScopeAttr .}}" {{bfPropsAttr .}}>
  <span bf="s1">Count: {{bfTextStart "s0"}}{{.Count}}{{bfTextEnd}}</span>
  <button bf="s2">+1</button>
</div>
{{end}}
```


## Expression Translation

### Property Access

```
props.name       →  .Name
props.user.email →  .User.Email
```

Field names are automatically capitalized to follow Go conventions.

### Comparisons

| JavaScript | Go Template |
|-----------|-------------|
| `a === b` | `eq .A .B` |
| `a !== b` | `ne .A .B` |
| `a > b` | `gt .A .B` |
| `a < b` | `lt .A .B` |
| `a >= b` | `ge .A .B` |
| `a <= b` | `le .A .B` |

### Arithmetic

| JavaScript | Go Template |
|-----------|-------------|
| `a + b` | `bf_add .A .B` |
| `a - b` | `bf_sub .A .B` |
| `a * b` | `bf_mul .A .B` |
| `a / b` | `bf_div .A .B` |

### Logical Operators

| JavaScript | Go Template |
|-----------|-------------|
| `a && b` | `and .A .B` |
| `a \|\| b` | `or .A .B` |
| `!a` | `not .A` |


## Array Methods

### `.map()`

```tsx
{items().map(item => <li key={item}>{item}</li>)}
```

```go-template
{{range $_, $item := .Items}}
<li>{{bfTextStart "s0"}}{{.Item}}{{bfTextEnd}}</li>
{{end}}
```

### `.filter().map()`

```tsx
{items().filter(item => item.active).map(item => <li key={item.id}>{item.name}</li>)}
```

```go-template
{{range $_, $item := .Items}}{{if .Active}}
<li>{{bfTextStart "s0"}}{{.Item.Name}}{{bfTextEnd}}</li>
{{end}}{{end}}
```

For complex filter predicates, the adapter generates template block functions.

### `.sort().map()` / `.toSorted().map()`

```tsx
{items.toSorted((a, b) => a.priority - b.priority).map(t => <li key={t.id}>{t.name}</li>)}
```

```go-template
{{range bf_sort .Items "Priority" "asc"}}
<li>{{bfTextStart "s0"}}{{.Name}}{{bfTextEnd}}</li>
{{end}}
```

### Other Array Methods

| JavaScript | Go Template |
|-----------|-------------|
| `arr.find(fn)` | `bf_find` |
| `arr.findIndex(fn)` | `bf_find_index` |
| `arr.every(fn)` | `bf_every` |
| `arr.some(fn)` | `bf_some` |
| `arr.length` | `len .Arr` |


## Type Generation

For each component, the adapter generates:

1. **Input struct** — external API
2. **Props struct** — internal representation (includes hydration fields)
3. **Constructor** — `New{Component}Props()` with defaults

### Type Mapping

| TypeScript | Go |
|-----------|-----|
| `string` | `string` |
| `number` | `int` (or `float64` for decimals) |
| `boolean` | `bool` |
| `T[]` | `[]T` |
| `T \| undefined` | Pointer type `*T` or zero value |
| Object type | Named struct |

### Nested Components

```tsx
export function TodoList({ items }: { items: TodoItem[] }) {
  return (
    <ul>
      {items.map(item => <TodoItem key={item.id} {...item} />)}
    </ul>
  )
}
```

Child component props carry a `ScopeID` used for hydration. You don't have to
mint these by hand: `bf.Renderer.Render` backfills a unique
`<Component>_<random>` id for any child (in a slice or a single field) whose
`ScopeID` is empty — the same shape the generated `New{Component}Props()`
constructor uses. Build child props with just the data they need (e.g.
`TodoItemProps{Todo: t}`) and the runtime fills in the rest. Setting `ScopeID`
explicitly still works and is preserved when you need a stable id.

## Conditional Rendering

Ternaries become `{{if}}...{{else}}...{{end}}`:

**Source:**

```tsx
{loggedIn() ? <span>Welcome back!</span> : <span>Please log in</span>}
```

**Output:**

```go-template
{{if .LoggedIn}}<span bf-c="s0">Welcome back!</span>{{else}}<span bf-c="s0">Please log in</span>{{end}}
```

Element branches use `bf-c` for conditional markers. Text-only ternaries use `bfComment` markers instead.


## Script Registration

Client components register their scripts via the `.Scripts` interface:

```go-template
{{if .Scripts}}{{.Scripts.Register "/static/client/barefoot.js"}}{{.Scripts.Register "/static/client/Counter.client.js"}}{{end}}
```

The `ScriptCollector` tracks needed scripts and renders `<script>` tags at page end. Each script loads at most once.


## Importmap (externals)

This adapter sets `importMapInjection: 'html-snippet'`, so when you configure [`externals`](../advanced/code-splitting.md), `bf build` emits a ready-to-include `barefoot-importmap.html` next to `barefoot-externals.json`. Parse the build output directory into your template set and include the snippet in your page `<head>`:

```go-template
{{ template "barefoot-importmap.html" . }}
```

See [Code splitting & externals](../advanced/code-splitting.md#template-string-adapters) for what the snippet contains and how the manifest is generated.


## Go Helper Functions

These helper functions must be in the Go template `FuncMap`:

| Function | Purpose |
|----------|---------|
| `bf_add`, `bf_sub`, `bf_mul`, `bf_div` | Arithmetic operations |
| `bf_neg` | Unary negation |
| `bf_filter` | Filter a slice by field/value |
| `bf_sort` | Sort a slice by field/direction |
| `bf_find`, `bf_find_index` | Find element/index in a slice |
| `bf_every`, `bf_some` | Test if all/any elements match |
| `bf_json` | JSON-encode a value for props serialization |
| `bf_concat` | String concatenation |

Provided by the BarefootJS Go runtime package.
