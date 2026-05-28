# @barefootjs/client

## 0.4.0

### Patch Changes

- @barefootjs/shared@0.4.0

## 0.3.0

### Patch Changes

- b136f8d: Remove internal @barefootjs/\* from published devDependencies to avoid npm registry dependency graph pollution
- 7e9570d: Fix CSR `render()` dropping all but the first root of a multi-root (fragment) component. `render()` now mounts every root element; for the multi-root case it recreates the SSR fragment layout (a `bf-scope:` comment marker before the sibling roots) so `$c()` resolves sibling child scopes via the comment range. The async hydration walk no longer re-initializes a `render()`'d fragment scope — the comment-scope path now honours `hydratedScopes`, matching the element-scope path — so multi-root components mount every root and initialize exactly once.
- 44c3466: Fix two mapArray bugs (#1627):

  - Hydration now removes orphaned SSR nodes when the client signal has fewer items than the server rendered.
  - Components created via `createComponent` (the CSR path mapArray takes for new loop items post-hydration) now thread their own scope id into `_parentScopeId`, so child components rendered by `renderChild` get parent-prefixed `bf-s`/`bf-h`/`bf-m` markers. This lets the component's init resolve them via `$c(scope, 'sN')` and wire up event handlers, matching the SSR convention.
  - @barefootjs/shared@0.3.0

## 0.2.0

### Patch Changes

- 2313724: Fix classifyDOMProp review issues: strict event detection, boolean attr DOM property handling, immutable BOOLEAN_ATTRS export
- bac95e6: Extract classifyDOMProp as single source of truth for DOM attribute vs JSX prop classification
- Updated dependencies [2313724]
- Updated dependencies [bac95e6]
- Updated dependencies [4e4d31a]
- Updated dependencies [bff7df6]
- Updated dependencies [31ce089]
- Updated dependencies [89a6ad5]
  - @barefootjs/shared@0.2.0
  - @barefootjs/jsx@0.2.0

## 0.1.3

### Patch Changes

- Updated dependencies [91523ba]
- Updated dependencies [a5a466c]
- Updated dependencies [a57e113]
  - @barefootjs/jsx@0.1.3
  - @barefootjs/shared@0.1.3

## 0.1.2

### Patch Changes

- @barefootjs/jsx@0.1.2
- @barefootjs/shared@0.1.2

## 0.1.1

### Patch Changes

- c896b8b: Fix published packages: resolve workspace:\* and point exports to dist/
- Updated dependencies [c896b8b]
  - @barefootjs/jsx@0.1.1
  - @barefootjs/shared@0.1.1
