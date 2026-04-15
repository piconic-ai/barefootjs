---
title: Go Template Adapter
description: Generate Go html/template files and type definitions from the compiler's IR.
---

# Go Template Adapter

Generates Go `html/template` files (`.tmpl`) and type definitions (`_types.go`) from the compiler's IR.

```
npm install @barefootjs/go-template
```


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
export function Greeting({ name }: { name: string }) {
  return <h1>Hello, {name}</h1>
}
```

**Output (.tmpl):**

```go-template
{{define "Greeting"}}
<h1>Hello, {{.Name}}</h1>
{{end}}
```

**Output (_types.go):**

```go
package components

type GreetingInput struct {
    Name string `json:"name"`
}

type GreetingProps struct {
    Name string `json:"name"`
}

func NewGreetingProps(input GreetingInput) GreetingProps {
    return GreetingProps{
        Name: input.Name,
    }
}
```

### Client Component

**Source:**

```tsx
"use client"
import { createSignal } from '@barefootjs/client'

export function Counter({ initial = 0 }: { initial?: number }) {
  const [count, setCount] = createSignal(initial)

  return (
    <div>
      <p>{count()}</p>
      <button onClick={() => setCount(n => n + 1)}>+1</button>
    </div>
  )
}
```

**Output (.tmpl):**

```go-template
{{define "Counter"}}
{{template "bf_register_script" "Counter"}}
<div bf-s="{{bfScopeAttr .}}" {{bfPropsAttr .}}>
  <p bf="slot_0">{{.Initial}}</p>
  <button bf="slot_1">+1</button>
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
{items.map(item => <li>{item.name}</li>)}
```

```go-template
{{range .Items}}
<li>{{.Name}}</li>
{{end}}
```

### `.filter().map()`

```tsx
{items.filter(t => t.completed).map(t => <li>{t.name}</li>)}
```

```go-template
{{range bf_filter .Items "Completed" true}}
<li>{{.Name}}</li>
{{end}}
```

For complex filter predicates, the adapter generates template block functions.

### `.sort().map()` / `.toSorted().map()`

```tsx
{items.toSorted((a, b) => a.priority - b.priority).map(t => <li>{t.name}</li>)}
```

```go-template
{{range bf_sort .Items "Priority" "asc"}}
<li>{{.Name}}</li>
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

## Conditional Rendering

Ternaries become `{{if}}...{{else}}...{{end}}`:

**Source:**

```tsx
{isActive ? <span>Active</span> : <span>Inactive</span>}
```

**Output:**

```go-template
{{if .IsActive}}<span>Active</span>{{else}}<span>Inactive</span>{{end}}
```


## Script Registration

Each client component registers its script:

```go-template
{{template "bf_register_script" "Counter"}}
```

The `ScriptCollector` tracks needed scripts and renders `<script>` tags at page end. Each script loads at most once.


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
