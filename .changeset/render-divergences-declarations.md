---
"@barefootjs/jsx": patch
"@barefootjs/go-template": patch
"@barefootjs/erb": patch
"@barefootjs/mojolicious": patch
"@barefootjs/xslate": patch
"@barefootjs/twig": patch
"@barefootjs/jinja": patch
"@barefootjs/blade": patch
"@barefootjs/rust": patch
---

Publish each template adapter's render-level conformance divergences as a machine-readable `renderDivergences` export (new `RenderDivergences` type in `@barefootjs/jsx`) — the render-level sibling of `conformancePins`. The Priority-12 edge-case sweep (#2168) skipped fixtures that render differently from the Hono reference via per-test-file `skipJsx` literals, which made the docs compatibility matrix look all-green while divergences were only visible in test-file comments. Each adapter now declares those fixtures (with a one-line rationale) in `src/render-divergences.ts`; its conformance suite derives `skipJsx` from the same object so the published declaration and the test skips cannot drift, and `packages/compat` publishes both pins and render divergences in a new `fixtureDivergences` section of `ui/compat.lock.json`, rendered honestly on the docs compatibility-matrix page. No adapter runtime or codegen behavior changes.
