---
title: xyflow browser bundle
description: How to serve @barefootjs/xyflow as a pre-built browser chunk via an importmap
---

# xyflow browser bundle

`@barefootjs/xyflow` ships a pre-minified ESM variant, `dist/xyflow.browser.min.js`, with `@barefootjs/client*` left as externals. Apps that want to serve xyflow as an independently-cached static asset can copy this file instead of re-bundling.

## Why a pre-built variant

Bundling xyflow into a large client entry adds ~270 KB of d3 + wrapper code to every cold-visit payload. Re-bundling it manually as a separate chunk requires remembering three externals:

```
--external '@barefootjs/client'
--external '@barefootjs/client/runtime'
--external '@barefootjs/client/reactive'
```

Missing any one of them silently inlines a second copy of the reactive primitives, breaking signal propagation across the boundary (fitView becomes a no-op, `FlowContext` reads from the wrong owner, etc.). The pre-built variant has all three applied already.

## Setup

**1. Copy the file into your static output:**

```sh
cp node_modules/@barefootjs/xyflow/dist/xyflow.browser.min.js \
   public/static/components/xyflow.js

# Optional: copy the sourcemap for readable DevTools stacks
cp node_modules/@barefootjs/xyflow/dist/xyflow.browser.min.js.map \
   public/static/components/xyflow.js.map
```

**2. Add an importmap to your HTML:**

```html
<script type="importmap">
{
  "imports": {
    "@barefootjs/client":          "/static/components/barefoot.js",
    "@barefootjs/client/runtime":  "/static/components/barefoot.js",
    "@barefootjs/client/reactive": "/static/components/barefoot.js",
    "@barefootjs/xyflow":          "/static/components/xyflow.js"
  }
}
</script>
```

The three `@barefootjs/client*` entries all pointing at the same file is what makes the browser deduplicate them into a single module instance, so reactive primitives share one `Listener`/`Owner` global.

Two things to get right when hand-writing this snippet:

- **Escape `<` inside the importmap JSON.** A mapped URL containing `</script>` (unlikely for a static local path like the ones above, but possible if a URL is assembled dynamically) would close the `<script type="importmap">` element early. Before writing the serialized JSON into the `<script>` tag, replace every `<` character with its six-character Unicode escape for code point U+003C (backslash, `u`, `0`, `0`, `3`, `c`) — the JSON parser decodes that escape straight back to the original character, so the mapping itself is unaffected.
- **Add `crossorigin` if you also `modulepreload` a cross-origin URL** — e.g. pointing straight at the unpkg/jsDelivr URL from "package.json fields" below instead of the copied local file:

  ```html
  <link rel="modulepreload" href="https://unpkg.com/@barefootjs/xyflow" crossorigin>
  ```

  The actual `import` of a cross-origin module is always a CORS fetch, so without `crossorigin` the preload request doesn't match it — the browser discards the preload and fetches the module a second time. Harmless to include on a same-origin preload too, since the credentials mode is the same either way.

## package.json fields

The file is also exposed via the `umd` export condition and the `unpkg`/`jsdelivr` top-level fields:

```json
{
  "exports": {
    ".": {
      "umd":    "./dist/xyflow.browser.min.js",
      "import": "./dist/index.js"
    }
  },
  "unpkg":    "./dist/xyflow.browser.min.js",
  "jsdelivr": "./dist/xyflow.browser.min.js"
}
```

CDNs like unpkg and jsDelivr resolve the top-level fields automatically, so `https://unpkg.com/@barefootjs/xyflow` serves the pre-built variant.
