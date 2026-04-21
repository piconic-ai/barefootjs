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
