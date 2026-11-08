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

Each scaffold parses the generated `.tmpl` files into a `template.Template` with `bf.FuncMap()` and `bf.TemplateFuncMap(root)`, then renders through `bf.NewRenderer(templates, layout)`. The layout is a `bf.LayoutFunc` that receives the rendered component, the collected scripts, and portals:

```go
root := template.New("").Funcs(bf.FuncMap())
root.Funcs(bf.TemplateFuncMap(root)) // bf_tmpl: companion defines (JSX children, loop-row portal elements)
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
    Initial  bf.Opt[float64] `json:"initial,omitzero"` // `initial?: number`
}

// The props type the template receives; hydration fields are `json:"-"`.
type CounterProps struct {
    ScopeID string `json:"-"`
    Scripts *bf.ScriptCollector `json:"-"`
    Initial float64 `json:"initial"`
    // ... BfIsRoot, BfIsChild, BfParent, BfMount, BfDataKey, Portals, BfCallerProps (all `json:"-"`)
}

func NewCounterProps(input CounterInput) CounterProps
```

A required prop keeps its plain Go type. A prop whose type admits absence or
`null` (`initial?: number`, `c: string | null`, an optional or `unknown`
prop) is a `bf.Opt[T]` on the input struct; see [`null`, `undefined` and
`bf.Opt`](#null-undefined-and-bfopt).

| TypeScript | Go |
|-----------|-----|
| `string` | `string` |
| `number` | `float64` (printed as JS does: `3`, `1.5`, `1500000`) |
| `boolean` | `bool` |
| `T[]` | `[]T` |
| `x?: T`, `T \| null`, `T \| undefined` (prop) | `bf.Opt[T]` on the input struct |
| `x?: T` (field of an object type) | `bf.Opt[T]`, `json:",omitzero"` |
| `x?: T` (nested object field of an object type) | `bf.Opt[*T]`, `json:",omitzero"` |
| Object type | Named struct |

Child component props carry a `ScopeID` used for hydration. You do not mint these by hand: `Renderer.Render` backfills a unique `<Component>_<random>` id for any child (in a slice or a single field) whose `ScopeID` is empty, so build child props with just their data (`TodoItemProps{Todo: t}`). An explicit `ScopeID` is preserved when you need a stable id.

A `.map()` whose row is a child component gets a rows field named after the component's plural (`<Badge>` → `Badges []BadgeProps`). When a prop already has that Go name, including the array the loop ranges over (`props.labels.map(l => <Label text={l} />)`), the prop keeps its own field and type (`Labels []string`), and the rows go to `LabelRows`, numbered if that name is taken too. When the loop ranges over an array prop directly, `New{Component}Props()` builds the rows from it, so the input struct carries only the prop. A TypeScript type whose name ends in `Props` never becomes a Go struct, because it would collide with a component's generated props struct, so an array of it types as `[]interface{}`. Give row data types another name (`type ToggleSetting = { label: string }`).

## `null`, `undefined` and `bf.Opt`

Go's `nil` is JS `null`. JS `undefined` is `bf.Undefined`, a typed nil that
prints as the empty string and that `{{if}}` reads as false. The runtime
creates it only where JS reads `undefined`: a missing key or field, an index
out of range, an `at()` / `find()` miss, `?.` over a nullish receiver, the
`undefined` identifier and an omitted prop. Decoded data is never walked, so
JSON `null` stays `nil`. Test a value with `bf.IsUndefined`, `bf.IsNull` and
`bf.IsNullish` (`bf_is_undefined` / `bf_is_null` / `bf_is_nullish` in a
template), not `v == nil`: `bf.Undefined` boxed in an `any` is not `== nil`.

A JS prop has four states, and `bf.Opt[T]` holds all of them. Its zero value
is "not passed":

| JS caller | Go input field |
| --- | --- |
| prop omitted | field left out (the zero value) |
| `c={undefined}`, or a forwarded unset prop | `bf.Undef[string]()` |
| `c={null}` | `bf.Null[string]()` |
| `c="primary"` | `bf.Some("primary")` |

```go
in := ChipInput{Label: "x", C: bf.Some("primary")} // a value
in := ChipInput{Label: "x", C: bf.Null[string]()}  // null: 'chip ' + c renders "chip null"
in := ChipInput{Label: "x"}                        // omitted: "chip undefined", no bf-p key
var in ChipInput
err := json.Unmarshal(body, &in) // {"c":null} → Null, {} → omitted
```

`Passed()` is JS `'c' in props`, `V()` the JS value (`bf.Undefined`, `nil`
or the value), and `Value()` the held value or `T`'s zero value. A
destructure default (`{ c = 'x' }`) applies to an omitted or `undefined`
prop only; an explicit `null` keeps `null`. The `bf-p` hydration payload
follows `JSON.stringify`: an omitted or `undefined` prop is left out, a
`null` one is written as `null`.

An optional field of an object type (a loop row, `type Row = { id: number;
tone?: string; tags?: string[]; meta?: Meta }`) is a `bf.Opt[T]` too
(`bf.Opt[*Meta]` for a nested object), so a row can tell an omitted field
from `null` and from `''` / `[]`. An optional slice, map or object prop with
no default arrives in the template as its JS value: a `{{range}}` the adapter
generates over one iterates nothing for `null` or `undefined` (`bf_iter`).
Build rows with `bf.Some(...)` for the
fields you set; `encoding/json` fills them from JSON, and `omitzero` drops an
omitted one when the row is encoded. `bf.JSON` (`JSON.stringify`) drops an
`undefined` member and writes an `undefined` array element as `null`.

### Migrating to `bf.Opt`

Generated input structs change with this release of the runtime (a breaking
change, released as a 0.x minor), so host code that builds them changes too:

- Wrap each optional or nullable prop you pass in `bf.Some(...)`. A number
  needs its type when you pass a constant: `bf.Some[float64](0)`.
- Leave the field out to leave a prop unset. Passing `nil` (or a zero value)
  used to mean "unset"; a `bf.Null[T]()` now means JS `null`, which renders
  `btn null` in `'btn ' + c` and does not take a destructure default.
- Do the same for the optional fields of row structs
  (`Row{ID: 1, Tone: bf.Some("warm"), Meta: bf.Some(&Meta{})}`). An optional
  nested object field was a `*T`; it is a `bf.Opt[*T]` now.
- Read a value back with `V()`, `Value()` or `Passed()`; a hand-written
  template reads an optional row field as `{{bf_js .Tone}}` (or `.Tone.V`).
- `json.Unmarshal` into an input struct needs no change: a missing key stays
  omitted and `null` becomes `bf.Null[T]()`.
- `bf.Some` is now the `bf.Opt` constructor. The array helper behind
  `bf_some` (`.some(item => item.field)`) is `bf.SomeField`.

