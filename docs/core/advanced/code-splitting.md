---
title: Vendor code-splitting
description: Split large vendor libraries into separately-cached browser chunks via barefoot.config.ts externals
---

# Vendor code-splitting

Apps that embed large libraries (xyflow, yjs, etc.) alongside BarefootJS components can reach 700–800 KB of client JS on first visit. Splitting those libraries out as separate browser chunks dramatically cuts repeat-visit transfer:

- **Cold visit**: ~36 % smaller because the common vendor bundle is served from disk cache
- **Warm visit**: ~70 % faster because only the changed component JS hits the network

## Configuration

Add an `externals` map to `barefoot.config.ts`. The CLI copies each package's browser-ready bundle to your output directory and emits `barefoot-externals.json`.

```ts
// barefoot.config.ts
import { defineConfig } from 'barefootjs/config'
import { HonoAdapter } from '@barefootjs/hono/adapter'

export default defineConfig({
  adapter: HonoAdapter(),
  minify: true,
  externalsBasePath: '/static/components/',

  externals: {
    // Local chunk — CLI copies the package's umd/unpkg/import entry
    '@barefootjs/xyflow': true,

    // Preload hint — adds <link rel="modulepreload"> to the importmap manifest
    yjs: { preload: true },

    // CDN passthrough — no local copy, importmap points at the remote URL
    lodash: { url: 'https://esm.sh/lodash@4.17.21', preload: true },
  },
})
```

### ExternalSpec

| Shape | Effect |
|---|---|
| `true` | Copy browser-ready entry to `outDir`, auto-resolve via `umd` → `unpkg` → `jsdelivr` → `import` |
| `{ preload: true }` | Same as `true`, also adds a preload hint to `barefoot-externals.json` |
| `{ url: string }` | CDN passthrough — skip copy, use URL as-is in importmap |
| `{ url: string, preload: true }` | CDN passthrough + preload hint |

### externalsBasePath

URL prefix for vendor chunk entries in the emitted importmap. Defaults to `/<runtimeSubdir>/` (e.g., `/components/` when using the default output layout). Set this explicitly if your static files are served from a different path:

```ts
externalsBasePath: '/static/components/'
```

## What the CLI emits

After build, `dist/barefoot-externals.json` contains three sections:

```json
{
  "importmap": {
    "imports": {
      "@barefootjs/xyflow":          "/static/components/xyflow.js",
      "yjs":                         "/static/components/yjs.js",
      "lodash":                      "https://esm.sh/lodash@4.17.21",
      "@barefootjs/client":          "/static/components/barefoot.js",
      "@barefootjs/client/runtime":  "/static/components/barefoot.js",
      "@barefootjs/client/reactive": "/static/components/barefoot.js"
    }
  },
  "preloads": [
    "/static/components/yjs.js",
    "https://esm.sh/lodash@4.17.21"
  ],
  "externals": [
    "@barefootjs/xyflow",
    "yjs",
    "lodash",
    "@barefootjs/client",
    "@barefootjs/client/runtime",
    "@barefootjs/client/reactive"
  ]
}
```

**`@barefootjs/client*` dedup is automatic.** Whenever `externals` is non-empty, the three `@barefootjs/client*` importmap entries are added unconditionally. This prevents reactive-primitive duplication — a class of silent failure where forgetting one entry inlines a second copy of the reactive runtime and breaks signals / context across the module boundary (see #927).

## Wiring the importmap into your renderer

Read `barefoot-externals.json` at startup and inject it into the HTML shell:

```tsx
// renderer.tsx
import externalsManifest from './dist/barefoot-externals.json'

const importMapScript = JSON.stringify(externalsManifest.importmap)

export const renderer = jsxRenderer(({ children }) => (
  <html>
    <head>
      <script type="importmap" dangerouslySetInnerHTML={{ __html: importMapScript }} />
      {externalsManifest.preloads.map(href => (
        <link rel="modulepreload" href={href} />
      ))}
    </head>
    <body>
      {children}
      <BfScripts />
    </body>
  </html>
))
```

## Template-string adapters

Some adapters have no render-time component like Hono's `BfImportMap` to read the manifest — they target a template-string language where you hand-write the HTML `<head>`. An adapter declares this by setting `importMapInjection: 'html-snippet'` (component-based adapters set `'component'` instead). For `html-snippet` adapters, `bf build` also emits a ready-to-include **`barefoot-importmap.html`** snippet next to `barefoot-externals.json`, generated from the same manifest:

```html
<!-- dist/barefoot-importmap.html -->
<script type="importmap">{"imports":{"@barefootjs/client":"/static/components/barefoot.js","yjs":"/static/components/yjs.js","lodash":"https://esm.sh/lodash@4.17.21"}}</script>
<link rel="modulepreload" href="/static/components/yjs.js">
<link rel="modulepreload" href="https://esm.sh/lodash@4.17.21">
```

Include this file in your page `<head>` using your template language's native include directive, and wire the build's output directory into the template search path so it resolves. The exact directive is language-specific — see your adapter's own documentation for the form it uses.

Which strategy an adapter uses is the single source of truth in its `TemplateAdapter.importMapInjection` value, enforced for every adapter by the cross-adapter importmap-injection contract in `@barefootjs/adapter-tests` — so this page does not need an entry per adapter.

## Using the externals list in your own bun build

The `externals` array in `barefoot-externals.json` lists every package that the browser will load via the importmap. Pass these as `--external` flags when bundling your app entries:

```sh
# Shell — build your DeskCanvas.tsx with all externals applied
EXTERNALS=$(jq -r '.externals[]' dist/barefoot-externals.json | sed 's/^/--external /' | tr '\n' ' ')
bun build worker/components/canvas/DeskCanvas.tsx \
  --outfile dist/static/components/canvas.js \
  --format esm --minify \
  $EXTERNALS
```

Or in JavaScript:

```ts
import manifest from './dist/barefoot-externals.json'

await Bun.build({
  entrypoints: ['./worker/components/canvas/DeskCanvas.tsx'],
  outdir: './dist/static/components',
  naming: 'canvas.[ext]',
  format: 'esm',
  minify: true,
  external: manifest.externals,
})
```
