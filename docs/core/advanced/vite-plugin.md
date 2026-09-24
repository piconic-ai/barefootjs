---
title: Vite Plugin
description: The `@barefootjs/vite` plugin — its options, what it writes to disk, the adapter builders, and how to split vendor chunks.
---

# Vite Plugin

`@barefootjs/vite` compiles every `.tsx` component under the directories you name into a server template plus client JS, and hands the client JS to Vite for bundling. Most apps use their adapter's builder instead of calling it directly — see [Adapter builders](#adapter-builders).

## Usage

```ts
// vite.config.ts
import { defineConfig } from 'vite'
import { barefoot } from '@barefootjs/vite'
import { HonoAdapter } from '@barefootjs/hono'

export default defineConfig({
  base: '/static/components/',           // public URL prefix of the client build
  build: { outDir: 'public/components' }, // client JS → served as static assets
  plugins: [
    barefoot({
      adapter: new HonoAdapter(),
      components: ['components'],         // .tsx source directories
      templates: 'dist/components',       // compiled templates → read by the server
    }),
  ],
})
```

`vite build` writes the templates and the hashed client bundle. `vite dev` serves the component modules itself, with a localhost-only CORS default because your backend renders on another origin, and rewrites the templates with dev-server URLs.

## Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `adapter` | `TemplateAdapter` | required | A constructed adapter instance (`new GoTemplateAdapter({ packageName: 'main' })`). |
| `components` | `(string \| ComponentDirEntry)[]` | required | Directories to scan for `.tsx` components, relative to the Vite root or absolute. First entry wins for a file reachable under two. |
| `templates` | `string` | unset | Where templates, `.ssr-defaults.json`, and adapter-generated types land — a backend source directory, not `build.outDir`. |
| `afterEmit` | `(ctx: AfterEmitContext) => void \| Promise<void>` | unset | Runs once after the templates are written, in build and in dev. |

Bundling, chunking, the dev server, `base`, and `outDir` are Vite's own config.

A `components` entry can be an object, `{ dir, cssLayerPrefix, skipDirs }`: `cssLayerPrefix: 'ui'` wraps every static class string under `dir` in a `layer-ui:` prefix so a library's base classes sit below app overrides (see [Style Overrides](../components/styling.md)); `skipDirs` names directories to skip.

Leave `templates` unset only for `CSRAdapter`, which has no template backend; the plugin still compiles every component but writes nothing. See [CSR](../adapters/csr.md).

`afterEmit` receives `{ types, projectDir, templatesDir, outDir, mode }`; the adapter builders use it to combine per-file `types` into, say, Go's `components.go`. An app config rarely needs it — see [`AfterEmitContext`](./api-reference.md#afteremitcontext).

## What gets written

Under `templates`, mirroring each component's position under its `components` directory:

| File | Contents |
|------|----------|
| `<Component>.<ext>` | The compiled template. Adapters with `templatesPerComponent` (Blade, Jinja2, ERB, ...) get one file per component instead of per source file. |
| `<Source>.ssr-defaults.json` | SSR seed values for signals derived from optional props. |
| `<Source>.types` | The adapter's raw `types` output (Go Props structs, for example) — input for an adapter builder, not a ready-to-compile file. |
| `manifest.json` | Every source file's `ssrDefaults` combined; the PHP, Python, and Ruby runtimes read it at request time. |

The hashed client entry URL of each `'use client'` component is baked into its template from Vite's `build.manifest`, with shared chunks as `<link rel="modulepreload">` hints.

## Adapter builders

Each adapter package exposes a `/vite` subpath that composes this plugin: it constructs the adapter for you, drops the `adapter` option, and adds its own language-specific options and post-processing.

`@barefootjs/hono/vite` · `@barefootjs/go-template/vite` · `@barefootjs/erb/vite` · `@barefootjs/jinja/vite` · `@barefootjs/blade/vite` · `@barefootjs/twig/vite` · `@barefootjs/mojolicious/vite` · `@barefootjs/xslate/vite` · `@barefootjs/pebble/vite` · `@barefootjs/rust/vite`

```ts
import { barefoot } from '@barefootjs/go-template/vite'

export default defineConfig({
  plugins: barefoot({
    components: ['src/components'],
    templates: 'internal/views',
    packageName: 'main',
    typesOutputFile: 'components.go',
  }),
})
```

`barefoot` is both a named and the default export in every builder, so switching adapters changes only the import specifier. Each builder returns a `Plugin[]` and types its options on its subpath (`GoTemplateViteOptions`, ...). The [API Reference](./api-reference.md#vite-plugin) lists each export with its stability tier — the core options are beta, the builders and re-exported helpers alpha — and documents the `BarefootPluginApi` hook the `bf` CLI uses to find the plugin.

## Code-splitting vendors

Splitting a large library (xyflow, yjs, ...) into its own cached chunk is stock Vite config, not a BarefootJS option:

```ts
export default defineConfig({
  plugins: [barefoot({ /* ... */ })],
  build: {
    rollupOptions: {
      output: {
        manualChunks: { xyflow: ['@barefootjs/xyflow'], yjs: ['yjs'] },
      },
    },
  },
})
```

Vite content-hashes the chunk and the plugin's `modulepreload` hints pick it up. See [Vite's chunking docs](https://vite.dev/guide/build.html#chunking-strategy).
