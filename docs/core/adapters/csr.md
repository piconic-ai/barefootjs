---
title: CSR (Client-Side Rendering)
description: Render BarefootJS components directly in the browser without a server-rendered template.
---

# CSR (Client-Side Rendering)

CSR renders BarefootJS components directly in the browser, without any server-rendered initial HTML. Use it when the server can't (or shouldn't) emit the initial markup.

Unlike the other entries in this section, CSR is not an IR→template adapter. It reuses the client-side template function that the compiler generates for each component, and mounts the resulting DOM into a container you pick.

## When to use CSR

Typical case: **static file hosting**. You have an HTML file you drop onto S3, GitHub Pages, or any static CDN — no backend renders the page. CSR lets you add interactive BarefootJS components to that page without setting up a server template.

When you do control the server (Hono, Go, etc.), prefer SSR + hydration instead. It renders faster to first paint and works without JavaScript enabled for static parts.

## Configuration

Set `clientOnly: true` in `barefoot.config.ts`. This skips marked template output and emits only client JS plus the runtime bundle:

```typescript
// barefoot.config.ts
import { createConfig } from '@barefootjs/hono/build'

export default createConfig({
  components: ['./components'],
  outDir: 'dist',
  clientOnly: true,
})
```

Build output:

```
dist/
└── components/
    ├── barefoot.js        # client runtime bundle
    └── Counter.client.js  # compiled component
```

## API

```typescript
import { render } from '@barefootjs/client'

render(container, componentName, props?)
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `container` | `HTMLElement` | Target element. Its content is replaced. |
| `componentName` | `string` | Registered component name (same as the exported JSX function). |
| `props` | `Record<string, unknown>` | Optional props passed to the component. |

The component must be registered first by importing its `.client.js` file — that import triggers the compiler-generated `registerComponent` / `registerTemplate` calls.

## Example

```html
<!DOCTYPE html>
<html>
<head>
  <script type="importmap">
    { "imports": { "@barefootjs/client": "/static/components/barefoot.js" } }
  </script>
</head>
<body>
  <div id="app"></div>
  <script type="module">
    import { render } from '@barefootjs/client'
    await import('/static/components/Counter.client.js')
    render(document.getElementById('app'), 'Counter', { initialCount: 0 })
  </script>
</body>
</html>
```

See [`integrations/csr/`](https://github.com/piconic-ai/barefootjs/tree/main/integrations/csr) for a runnable end-to-end example.
