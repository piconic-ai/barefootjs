# @barefootjs/xyflow

## 0.33.0

## 0.32.0

## 0.31.10

## 0.31.9

## 0.31.8

## 0.31.7

## 0.31.6

## 0.31.5

## 0.31.4

## 0.31.3

## 0.31.2

## 0.31.1

## 0.31.0

### Patch Changes

- 74861c0: Stop shipping a source map with the xyflow browser bundle

  `build:browser` passed `--sourcemap`, so `xyflow.browser.min.js` ended with
  a `//# sourceMappingURL=` comment and the published tarball carried a
  520 KB `xyflow.browser.min.js.map` next to it — the only production
  artifact in the repo that still shipped one. Dropped the flag.

  The bundle is unchanged otherwise (116.5 KB, 131 modules). `dist/*.d.ts.map`
  declaration maps are untouched: those serve editor go-to-definition for TS
  consumers and are never fetched by a browser.

  App builds were already clean — a `vite build` through `@barefootjs/vite`
  emits no `sourceMappingURL` and no `.map` (verified against
  `integrations/hono`'s `dist/static/components/assets/`). Vite's dev server
  still inlines a base64 map into each served module, which is what makes
  DevTools show the original `.tsx` rather than compiled client JS; that is
  dev-only and never reaches a production bundle.

## 0.30.6

## 0.30.5

## 0.30.4

## 0.30.2

## 0.30.1

## 0.30.0

## 0.29.0

## 0.28.1

### Patch Changes

- 92460a7: Drop the `__bfFlowStore` host-element escape hatch — nothing read it, and its premise was false

  `attachFlowSubsystems` stamped the flow store onto the host
  `<div class="bf-flow">` so that, per its comment, "descendants that miss
  `FlowContext`" could reach it via `el.closest('.bf-flow').__bfFlowStore`. The
  stated cause was that `<Flow renderNode={Fn}>` hydrates its children as a
  top-level scope outside the `FlowContext.Provider`, leaving `useFlow()` —
  and therefore `useViewport()` / `useNodes()` / `useEdges()` /
  `useNodesInitialized()`, which all call it — returning `undefined`.

  Two things were wrong with that.

  **Nothing read the property.** The only references in the repository were the
  write itself and a unit test asserting the write. The would-be consumer,
  `FlowNodeTypeBridge`, does not walk the DOM for the store — it tolerates
  `store === undefined` and falls back to `props.forNode`. So this was a
  write-only global on a public DOM element.

  **The premise does not hold in the rendered DOM.** Walking up from a
  `.bf-flow__node` in a browser, the provider's context map (`__bfCtx`) sits on
  the `<div class="bf-flow">` host itself — an ancestor of every node — and
  `useContext` resolves by walking `parentElement`. A connected descendant
  therefore finds the store no matter which scope it was hydrated as. Which
  scope the hydration walker chose never mattered; only ancestry does.

  The one shape that genuinely returned `undefined` was a child running its
  `init` while its row was still **detached**, so the `parentElement` walk had no
  ancestors to find and fell through to the global last-writer-wins context
  store. That is fixed at the root in the client runtime — loop rows are
  connected before `init` runs — rather than by giving the store a second lookup
  path. A second path would also have been the wrong shape: it hides the
  ordering bug instead of surfacing it, and only for consumers who know to look.

  `__bfFlowStore` was an undocumented internal expando, never part of
  `@barefootjs/xyflow`'s exported surface and not mentioned in the docs, so
  nothing in this repository changes behaviour. It was on a public DOM element
  though, so code outside this repository could have reached it — if you read
  `el.closest('.bf-flow').__bfFlowStore`, switch to `useFlow()` (or the derived
  `useViewport()` / `useNodes()` / `useEdges()`), which resolves through context
  from any connected descendant of the flow.

  The unit test is repurposed to pin the removal, asserting the property is not
  even _present_ — a value check would also pass against an attach that stamped
  the key and assigned `undefined`, which is still an expando. Beyond the dead
  code, the comment claimed a live product defect that did not exist, and that
  misreading fed a wrong priority call — which is the more expensive half of what
  is being removed here.

## 0.28.0

## 0.27.0

## 0.26.4

## 0.26.3

## 0.26.2

## 0.26.1

## 0.26.0

## 0.25.0

## 0.24.1

## 0.24.0

## 0.23.0

## 0.22.0

## 0.21.4

## 0.21.3

## 0.21.2

## 0.21.1

## 0.21.0

## 0.20.0

## 0.19.1

## 0.19.0

## 0.18.7

## 0.18.6

## 0.18.5

## 0.18.4

## 0.18.3

## 0.18.2

## 0.18.1

## 0.18.0

## 0.17.1

## 0.17.0

## 0.16.0

## 0.15.2

## 0.15.1

## 0.15.0

## 0.14.0

## 0.13.0

## 0.12.0

## 0.11.0

## 0.10.1

## 0.10.0

## 0.9.6

## 0.9.5

## 0.9.4

## 0.9.3

## 0.9.2

## 0.9.1

## 0.9.0

## 0.8.0

## 0.7.0

## 0.6.1

## 0.6.0

## 0.5.3

## 0.5.2

## 0.5.1

## 0.5.0

## 0.4.0

## 0.3.0

### Patch Changes

- b136f8d: Remove internal @barefootjs/\* from published devDependencies to avoid npm registry dependency graph pollution

## 0.2.0

### Patch Changes

- Updated dependencies [2313724]
- Updated dependencies [bac95e6]
- Updated dependencies [4e4d31a]
- Updated dependencies [bff7df6]
- Updated dependencies [31ce089]
- Updated dependencies [89a6ad5]
  - @barefootjs/client@0.2.0
  - @barefootjs/jsx@0.2.0

## 0.1.3

### Patch Changes

- Updated dependencies [91523ba]
- Updated dependencies [a5a466c]
- Updated dependencies [a57e113]
  - @barefootjs/jsx@0.1.3
  - @barefootjs/client@0.1.3

## 0.1.2

### Patch Changes

- @barefootjs/client@0.1.2
- @barefootjs/jsx@0.1.2

## 0.1.1

### Patch Changes

- c896b8b: Fix published packages: resolve workspace:\* and point exports to dist/
- Updated dependencies [c896b8b]
  - @barefootjs/client@0.1.1
  - @barefootjs/jsx@0.1.1
