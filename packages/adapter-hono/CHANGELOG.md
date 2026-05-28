# @barefootjs/hono

## 0.4.0

### Patch Changes

- 9992041: `BfImportMap` now emits `crossorigin` on its `<link rel="modulepreload">` hints (#1648). Cross-origin (CDN) module imports are CORS fetches, so a preload without `crossorigin` couldn't be matched and the browser would discard it and re-fetch — wasting the preload and logging a "preload was not used" warning. The attribute is harmless for same-origin module preloads (same credentials mode either way).

## 0.3.0

### Patch Changes

- 6b99644: `BfImportMap` now consumes `barefoot-externals.json` (#1639):

  - Add an optional `externals` prop (the parsed manifest). Its `importmap.imports` merge on top of the built-in `@barefootjs/client*` mappings, so islands importing configured externals (`zod`, `@barefootjs/form`, …) resolve in the browser instead of 404ing on bare specifiers.
  - Emit `<link rel="modulepreload">` for the manifest's `preloads`, toggleable via a new `preload` prop (defaults to `true`).
  - Keeps `app.ts` runtime-agnostic — the caller imports the JSON and passes it through, matching how `BfScripts` already takes `manifest`. Omitting `externals` preserves the prior client-only output.

## 0.2.0

### Minor Changes

- 89a6ad5: Add .entries()/.keys()/.values() iteration shapes (#1448 Tier B)

### Patch Changes

- Updated dependencies [2313724]
- Updated dependencies [bac95e6]
- Updated dependencies [4e4d31a]
- Updated dependencies [bff7df6]
- Updated dependencies [31ce089]
- Updated dependencies [89a6ad5]
  - @barefootjs/shared@0.2.0
  - @barefootjs/client@0.2.0
  - @barefootjs/jsx@0.2.0

## 0.1.3

### Patch Changes

- Updated dependencies [91523ba]
- Updated dependencies [a5a466c]
- Updated dependencies [a57e113]
  - @barefootjs/jsx@0.1.3
  - @barefootjs/client@0.1.3
  - @barefootjs/shared@0.1.3

## 0.1.2

### Patch Changes

- @barefootjs/client@0.1.2
- @barefootjs/jsx@0.1.2
- @barefootjs/shared@0.1.2

## 0.1.1

### Patch Changes

- c896b8b: Fix published packages: resolve workspace:\* and point exports to dist/
- Updated dependencies [c896b8b]
  - @barefootjs/client@0.1.1
  - @barefootjs/jsx@0.1.1
  - @barefootjs/shared@0.1.1
