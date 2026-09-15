---
title: Vite Plugin
description: The `@barefootjs/vite` plugin — its options, what it writes to disk in build and dev, and where the adapter-specific builders fit.
---

# Vite Plugin

`@barefootjs/vite` is the build entry point. It compiles every `.tsx` component under the directories you name into a server template for your adapter and client JS for the browser, and hands the client JS to Vite for bundling, hashing, chunking, tree-shaking, and minification. BarefootJS keeps only the JSX → (template, client JS) compile; everything else is stock Vite config.

This page covers the core plugin. Most apps do not call it directly — they use their adapter's own builder (`@barefootjs/hono/vite`, `@barefootjs/go-template/vite`, ...), which constructs the adapter and calls this plugin underneath. See [Adapter builders](#adapter-builders) below.

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

`vite build` produces the templates and the hashed client bundle. `vite dev` serves component modules from the dev server and regenerates the templates with dev-server URLs baked in.

## Options

`barefoot()` takes exactly four BarefootJS-specific fields. Bundling, hashing, chunking, minification, the dev server, `base`, and `outDir` are Vite's own config and are deliberately not duplicated here.

| Option | Type | Description |
|--------|------|-------------|
| `adapter` | `TemplateAdapter` | A constructed adapter instance (`new GoTemplateAdapter({ packageName: 'main' })`). The plugin never constructs adapters itself. |
| `components` | `(string \| ComponentDirEntry)[]` | Source directories to scan for `.tsx` components, relative to the Vite root or absolute. Entries are processed in array order; when the same file is reachable under two entries, the first wins. |
| `templates` | `string` (optional) | Where compiled templates, `.ssr-defaults.json`, and adapter-generated types land, relative to the Vite root or absolute. This is a backend source directory your server reads, not `build.outDir`. |
| `afterEmit` | `(ctx: AfterEmitContext) => void \| Promise<void>` (optional) | Escape hatch called once per eager pass, after templates are written. See [`afterEmit`](#afteremit). |

### `components` entries

A plain string is exactly `{ dir: string }`. Use the object form only when a directory needs per-directory compile behavior:

```ts
components: [
  'src/components',
  { dir: '../ui/components', cssLayerPrefix: 'ui', skipDirs: ['shared'] },
]
```

| Field | Description |
|-------|-------------|
| `dir` | Source directory to scan. |
| `cssLayerPrefix` | Wraps every static class string under `dir` in a `layer-{value}:` prefix so a library's base classes land in a lower cascade layer than app overrides. Set it on library entries, leave it off app entries. See [Style Overrides](../components/styling.md). |
| `skipDirs` | Directory names to skip anywhere under `dir`. |

### `templates` omitted

Leave `templates` unset only for an adapter whose `generate()` output is always empty — `CSRAdapter` is the one shipped case, since CSR has no template backend. The plugin still compiles every discovered component (client JS is unaffected) but writes nothing on the adapter's behalf: no templates, no `.ssr-defaults.json`, no `manifest.json`, and `afterEmit` never fires. If a component turns out to produce a real template anyway, the eager pass fails loudly instead of dropping it. See [CSR](../adapters/csr.md).

## What gets written

Two passes run. The **graph pass** is Vite's normal `transform`: Rollup visits every `'use client'` `.tsx` module reachable from `build.rollupOptions.input`, the plugin compiles it, and the resulting client JS is bundled like any other module. The **eager pass** walks every `.tsx` under `components` directly, because server-only components never appear in Rollup's module graph but still need a template. In `vite build` it runs in `writeBundle`, once the manifest is final; in `vite dev` it runs when the dev server starts listening and again on every tracked `.tsx` change.

The eager pass writes, under `templates`, mirroring each component's position under its `components` directory:

| File | Contents |
|------|----------|
| `<Component>.<ext>` | The compiled template, in the adapter's extension. Adapters with `templatesPerComponent` (Blade, Jinja2, ERB, ...) get one file per component instead of per source file. |
| `<Source>.ssr-defaults.json` | The SSR seed values for signals derived from optional props. Per component, like the template, on `templatesPerComponent` adapters. |
| `<Source>.types` | The adapter's raw `types` output for that source file (Go Props structs, for example). Per-file and uncombined — source material for an adapter builder, not a ready-to-compile file. |
| `manifest.json` | Every source file's `ssrDefaults` combined. The PHP, Python, and Ruby runtimes read this one file at request time instead of reassembling the per-component files themselves. |

`vite build` also writes Vite's own `build.manifest` under `build.outDir`; the plugin reads it to resolve each `'use client'` component's hashed entry URL and bakes that URL into the template's script registration. Transitively-shared chunks are emitted as `<link rel="modulepreload">` hints the same way.

## Dev server

`vite dev` splits origins: the backend renders pages on its own origin and Vite serves component modules on another. The plugin fills in a localhost-only `server.cors` default when you have not configured one, and bakes dev-server URLs (the `@vite/client` socket plus the component's own `.tsx` module) into each template in place of the hashed build URLs.

Two on-disk markers accompany dev output:

- `<templates>/.barefootjs-dev-build` flags the directory as holding dev artifacts with localhost URLs baked in. `vite build` overwrites every template and removes the file.
- `<templates>/../.dev/build-id` is the cross-language dev-reload sentinel. The adapter runtimes poll this fixed path and trigger a browser reload when its value changes.

On a tracked change the plugin re-runs the entire eager pass rather than diffing dependents — a change to a shared signal module or a child component changes the parent's template too. The content-hash compile cache makes the full pass cheap: every unchanged file is a cache hit.

## `afterEmit`

`afterEmit` fires once at the end of either eager pass — `mode: 'build'` from `writeBundle`, `mode: 'dev'` from the dev pass — after every template has been written. It fires from both passes because a derived file such as Go's `components.go` has to exist for `go run .` to compile even in dev.

The context is deliberately narrow:

| Field | Description |
|-------|-------------|
| `types` | `Map<string, string>` of raw per-file `types` output, keyed by the source file's absolute path. Empty when nothing produced types. |
| `projectDir` | Absolute Vite project root. |
| `templatesDir` | Absolute path of the configured `templates` directory. |
| `outDir` | Absolute path of Vite's `build.outDir`. |
| `mode` | `'build'` or `'dev'`. |

It does not carry emitted client JS. Post-compile rewriting of client JS is not something the plugin offers a hook for, and closing that door by type rather than by convention is the reason the context stays this small.

Every shipped adapter builder uses `afterEmit` for its per-language post-processing — combining `types` fragments into one `components.go`, or writing a generated asset map for a hand-written client entry. An app-level `vite.config.ts` rarely needs it.

## Adapter builders

Each adapter package exposes a `/vite` subpath that composes this plugin: it constructs the adapter for you, drops the `adapter` option, and adds its own language-specific options and post-processing.

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

The builder's `barefoot` is both a named and the default export, matching the core plugin, so switching adapters changes only the import specifier. Each builder returns a `Plugin[]`, because some of them attach a small companion plugin to capture Vite's resolved config for their `afterEmit` work.

The core package also re-exports a set of helpers for builders to reuse — `discoverComponents`, `loadManifest`, `resolveScriptAssets`, `joinBaseAndFile`, `devModuleUrl`, `devRequestPath`, `resolveDevOrigin`, `toPosixRelative`. They exist so a builder resolves script and asset URLs the same way the core plugin does instead of re-deriving them.

Each builder's options are typed on its subpath (`HonoViteOptions`, `GoTemplateViteOptions`, ...). The adapter pages show the builders in working configs: [Hono](../adapters/hono-adapter.md#adding-to-an-existing-project), [Perl](../adapters/perl-adapter.md), [Ruby](../adapters/ruby-adapter.md), [Python](../adapters/python-adapter.md), [PHP](../adapters/php-adapter.md), [Rust](../adapters/rust-adapter.md).

## Stability

The core plugin's four options, `ComponentDirEntry`, `AfterEmitContext`, and the files it writes are **beta**: a breaking change ships in a minor release with a migration note in the changelog.

The adapter builders (`@barefootjs/*/vite`) and the helpers the core package re-exports for them are **alpha** and may change without notice. Pin exact versions if you depend on them.

## Tooling

The plugin attaches its options to the returned plugin's `api` (`BarefootPluginApi`), Vite's own convention for exposing plugin state to other tools. The `bf` CLI reads `vite.config.ts` through Vite's `loadConfigFromFile`, finds the plugin by name (`PLUGIN_NAME`, exported alongside `barefoot`), and takes `api.options.components` as its source directories — so `bf` needs no config of its own.
