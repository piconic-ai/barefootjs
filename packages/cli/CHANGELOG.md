# @barefootjs/cli

## 0.1.2

### Patch Changes

- 6b567a9: Fix scaffold tsconfig paths order in Hono adapters so wrangler resolves compiled SSR templates (with hydration markers and script collection) instead of raw `'use client'` source files. Also bump vitest from `^2.0.0` to `^4.0.0` for npm/pnpm/yarn scaffolds to resolve esbuild vulnerability (GHSA-67mh-4wv8-2f99).

## 0.1.1

### Patch Changes

- c896b8b: Fix published packages: resolve workspace:\* and point exports to dist/
