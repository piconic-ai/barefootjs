/**
 * The absolute virtual path every harness compile should pass to
 * `compileJSX` (or a lower-level entry point that ends up at
 * `analyzeComponent`) in place of a bare relative filename like
 * `'component.tsx'` or `` `${fixture.id}.tsx` ``.
 *
 * ## The bug this fixes (#3220)
 *
 * `needsTypeBasedDetection(source)` (`packages/jsx/src/analyzer.ts`) is true
 * for any source that imports a `Reactive<T>`-branded package or contains a
 * `.map()` call. When true and no shared `ts.Program` is supplied,
 * `analyzeComponent` builds one itself via `createProgramForFile`, which
 * sets `baseUrl: path.dirname(path.resolve(filePath))`. A RELATIVE
 * `filePath` (`'component.tsx'`) resolves that `path.resolve` against
 * `process.cwd()` — so whether `import … from '@barefootjs/client'`
 * resolves its `.d.ts` (and therefore whether a `Reactive<T>` accessor like
 * `fetchPosts.isPending()` is classified as reactive, or silently
 * degrades to `any`) depends on which directory the harness happens to
 * run from. Repo root (no `node_modules/@barefootjs/*` there): everything
 * degrades to `any`. `cd packages/adapter-hono && bun test` (has its own
 * `node_modules/@barefootjs/client`): the brand is seen. Same fixture,
 * different answer, depending on `cwd`.
 *
 * A real `@barefootjs/vite` build never has this problem
 * (`packages/vite/src/corpus-program.ts` compiles every component at its
 * real, absolute path, so `node_modules` resolution is anchored at the
 * consuming project's own directory, not the build tool's `cwd`).
 *
 * `virtualComponentPath` gives every harness call site an absolute path
 * anchored under `packages/adapter-tests/` instead — a directory whose
 * `node_modules` resolves every `@barefootjs/*` package (this package
 * depends on `@barefootjs/client` and every first-party adapter as
 * `devDependencies` precisely so its own `node_modules` mirrors what a
 * real consumer sees). The result is independent of `process.cwd()`: a
 * fixture compiled through this path resolves `@barefootjs/*` types the
 * same way whether the harness runs from the repo root or from inside a
 * package directory — matching what `@barefootjs/vite` (and therefore
 * production) sees.
 *
 * The returned directory does not need to exist on disk. TypeScript's
 * module resolution only probes each ancestor directory for a
 * `node_modules` folder — it never requires the directory itself to be
 * real — so a synthetic subdirectory under `packages/adapter-tests` is
 * exactly as good as `packages/adapter-tests` itself for this purpose,
 * without risking a collision with a real file the package happens to
 * contain.
 *
 * ## Requirement: `@barefootjs/client` (and `@barefootjs/form`, for
 * fixtures that exercise it) must be BUILT
 *
 * Type resolution reads `dist/*.d.ts`, not `src/*.ts` — an unbuilt
 * `@barefootjs/client` silently regresses every caller of this helper
 * back to the unresolved (`any`) answer, with no error. Every CI job that
 * runs these tests already runs `bun run --filter '@barefootjs/client'
 * build` first (see `.github/workflows/ci.yml`, `ci-compat.yml`,
 * `update-fixtures.yml`) — keep it that way. Locally, run
 * `bun run --filter '@barefootjs/client' build` (and `--filter
 * '@barefootjs/form' build` for form-brand fixtures) before running these
 * tests directly from a fresh checkout.
 *
 * `virtual-path-resolves-brand.test.ts` is the guard: it fails loudly
 * when `@barefootjs/client`'s types don't resolve from this path, so a
 * missing build regresses as a red test rather than a silent
 * classification change.
 */
import path from 'node:path'

/**
 * Directory every virtual harness path is anchored under. Doesn't need to
 * exist on disk (see the module doc comment) — only its ancestor
 * `packages/adapter-tests/node_modules` does.
 */
const VIRTUAL_ROOT = path.resolve(import.meta.dir, '..', '__virtual__')

/**
 * Build the absolute path to pass as `compileJSX`'s (or
 * `analyzeComponent`'s) `filePath` argument for a harness compile.
 *
 * @param filename - The bare filename the fixture would otherwise use
 *   (e.g. `'component.tsx'`, `` `${fixture.id}.tsx` ``, a sibling
 *   component's declared name). Defaults to `'component.tsx'`, the
 *   harness's long-standing convention for a fixture's primary source.
 */
export function virtualComponentPath(filename = 'component.tsx'): string {
  return path.join(VIRTUAL_ROOT, filename)
}
