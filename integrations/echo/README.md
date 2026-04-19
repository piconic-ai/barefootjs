# BarefootJS + Go Echo Example

This example demonstrates how to use BarefootJS with Go [Echo](https://echo.labstack.com/) framework for server-side rendering.

## Overview

BarefootJS compiles JSX components to Go `html/template` files, enabling:

1. **Server-side rendering** with Echo framework
2. **Client-side hydration** for interactive components
3. **Type-safe props** via generated Go struct definitions

## Quick Start

### 1. Build JSX Components

```bash
bun run build
```

This generates:
- `dist/templates/*.tmpl` - Go html/template files
- `dist/types/*_types.go` - Go struct definitions

### 2. Install Go Dependencies

```bash
bun run go:deps
# or
go mod tidy
```

### 3. Run Echo Server

```bash
bun run dev
```

This sets `APP_ENV=development` and runs `go run .`. In development mode the
server re-parses templates on every request, so edits picked up by
`bun run build:watch` show up on reload without restarting the server.

For production, build a binary and run it without `APP_ENV` set — templates are
then cached once at startup.

Open http://localhost:8080 in your browser.

## Project Structure

```
integrations/echo/
├── components/
│   └── Counter.tsx       # JSX component source
├── dist/
│   ├── templates/
│   │   └── Counter.tmpl  # Generated Go template
│   └── types/
│       └── Counter_types.go
├── build.ts              # JSX → Go template compiler
├── main.go               # Echo server
├── go.mod
├── package.json
└── README.md
```

## Generated Files

### Counter.tmpl

```gotemplate
{{define "Counter"}}
<div bf-s="{{.ScopeID}}">
  <p bf="slot_1">Count: <span bf="slot_0">{{.Count}}</span></p>
  <button bf="slot_2">+1</button>
  <button bf="slot_3">-1</button>
</div>
{{end}}
```

### Counter_types.go

```go
package components

type CounterProps struct {
    ScopeID string
    Initial int
    Count   int
}
```

## Echo Integration

### Template Renderer

```go
type TemplateRenderer struct {
    templates *template.Template
}

func (t *TemplateRenderer) Render(w io.Writer, name string, data interface{}, c echo.Context) error {
    return t.templates.ExecuteTemplate(w, name, data)
}
```

### Route Handler

```go
func counterHandler(c echo.Context) error {
    props := CounterProps{
        ScopeID: "counter-1",
        Initial: 0,
        Count:   0,
    }
    return c.Render(http.StatusOK, "Counter", props)
}
```

## Data Attributes

- `bf-s` - Component root with scope ID for hydration
- `bf="slotId"` - Reactive element marker
- `bf-c="condId"` - Conditional rendering marker

## Expression Conversion

| JSX | Go Template |
|-----|-------------|
| `{count()}` | `{{.Count}}` |
| `{user.name}` | `{{.User.Name}}` |
| `{items.map(...)}` | `{{range .Items}}...{{end}}` |
| `{cond ? a : b}` | `{{if .Cond}}a{{else}}b{{end}}` |
