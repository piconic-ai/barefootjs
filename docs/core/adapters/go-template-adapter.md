---
title: Go Template Adapter
description: Generate Go html/template files and type definitions from the compiler's IR.
---

# Go Template Adapter

Generates Go `html/template` files (`.tmpl`) and type definitions (`_types.go`) from the compiler's IR. The output is plain `html/template`, so any Go server can render it.

```sh
npm install @barefootjs/go-template
```

```typescript
// vite.config.ts
import { defineConfig } from 'vite'
import { barefoot } from '@barefootjs/go-template/vite'

export default defineConfig({
  plugins: barefoot({ components: ['components'], templates: 'dist/templates' }),
})
```

## Server integration

The scaffolder ships runnable starters for four Go servers, all built on this adapter:

```sh
npm create barefootjs@latest -- --adapter <name>
```

| `--adapter` | Framework | Router |
|-------------|-----------|--------|
| `echo` | [Echo](https://echo.labstack.com/) | `echo.Renderer` |
| `gin` | [Gin](https://gin-gonic.com/) | `gin.Engine` |
| `chi` | [Chi](https://go-chi.io/) | `chi.Router` (net/http) |
| `nethttp` | Go standard library | `http.ServeMux` |

Each scaffold parses the generated `.tmpl` files into a `template.Template` with `bf.FuncMap()`, then renders through `bf.NewRenderer(templates, layout)`. The layout is a `bf.LayoutFunc` that receives the rendered component, the collected scripts, and portals:

```go
root := template.New("").Funcs(bf.FuncMap())
template.Must(root.New("Tag").Parse("")) // stub referenced by the generated Slot template
template.Must(root.ParseGlob("dist/templates/*.tmpl"))

renderer := bf.NewRenderer(root, func(ctx *bf.RenderContext) string {
    return "<!doctype html><body>" + string(ctx.ComponentHTML) + string(ctx.Scripts) + "</body>"
})

html := renderer.Render(bf.RenderOptions{
    ComponentName: "Counter",
    Props:         &components.CounterProps{Initial: 0},
})
```

`Render` collects every client script the page needs and passes the `<script>` tags to the layout as `ctx.Scripts`, each at most once. Runnable examples for all four servers live under [`integrations/`](https://github.com/piconic-ai/barefootjs/tree/main/integrations).

## Options

```typescript
const adapter = new GoTemplateAdapter({ packageName: 'views' })
```

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `packageName` | `string` | `'components'` | Go package name for generated type files |

## Compiled output

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

```go-template
{{define "Counter"}}
{{if .Scripts}}{{.Scripts.Register "/static/client/barefoot.js"}}{{.Scripts.Register "/static/client/Counter.client.js"}}{{end}}
<div bf-s="{{bfScopeAttr .}}" {{bfPropsAttr .}}>
  <span bf="s1">Count: {{bfTextStart "s0"}}{{.Count}}{{bfTextEnd}}</span>
  <button bf="s2">+1</button>
</div>
{{end}}
```

Props become capitalized struct fields (`props.user.email` → `.User.Email`); operators, `.filter()`/`.sort()`/`.map()` chains and the other array methods translate to `bf_*` template functions from `bf.FuncMap()`. Vendor code-splitting is stock Vite `manualChunks` — see [Vite Plugin](../advanced/vite-plugin.md#code-splitting-vendors).

## Type generation

For each component the adapter generates an input struct (the external API), a props struct (adds the hydration fields), and a `New{Component}Props()` constructor that applies defaults:

```go
// The input type you construct: hydration fields are optional.
type CounterInput struct {
    ScopeID  string // Optional: if empty, a random ID is generated
    BfParent string // Optional: parent scope id
    BfMount  string // Optional: slot id in parent
    Initial  int
}

// The props type the template receives; hydration fields are `json:"-"`.
type CounterProps struct {
    ScopeID string `json:"-"`
    Scripts *bf.ScriptCollector `json:"-"`
    Initial int    `json:"initial"`
    // ... BfIsRoot, BfIsChild, BfParent, BfMount, BfDataKey, Portals, BfCallerProps (all `json:"-"`)
}

func NewCounterProps(input CounterInput) CounterProps
```

| TypeScript | Go |
|-----------|-----|
| `string` | `string` |
| `number` | `int` (or `float64` for decimals) |
| `boolean` | `bool` |
| `T[]` | `[]T` |
| `T \| undefined` | Pointer type `*T` or zero value |
| Object type | Named struct |

Child component props carry a `ScopeID` used for hydration. You do not mint these by hand: `Renderer.Render` backfills a unique `<Component>_<random>` id for any child (in a slice or a single field) whose `ScopeID` is empty, so build child props with just their data (`TodoItemProps{Todo: t}`). An explicit `ScopeID` is preserved when you need a stable id.
