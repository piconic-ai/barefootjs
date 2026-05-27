# @barefootjs/cli

## 1.0.0

### Minor Changes

- 4e4d31a: Add `bf debug events` command for tracing event handler -> setter -> signal -> DOM update paths

### Patch Changes

- 57262dd: Move @barefootjs/cli from dependencies to devDependencies in generated package.json. The CLI is a build tool, not a runtime dependency.

## 0.1.3

### Patch Changes

- 3335b89: Add block-level `<Tabs>`/`<Tab>` support to the MDX-lite parser and Tabs projector for adapter code tabs

## 0.1.2

### Patch Changes

- 6b567a9: Fix scaffold tsconfig paths order in Hono adapters so wrangler resolves compiled SSR templates (with hydration markers and script collection) instead of raw `'use client'` source files. Also bump vitest from `^2.0.0` to `^4.0.0` for npm/pnpm/yarn scaffolds to resolve esbuild vulnerability (GHSA-67mh-4wv8-2f99).

## 0.1.1

### Patch Changes

- c896b8b: Fix published packages: resolve workspace:\* and point exports to dist/
