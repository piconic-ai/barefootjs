/**
 * The TypeChecker Program every harness compile hands `compileJSX` (or a
 * lower-level entry point that ends at `analyzeComponent`), so fixture type
 * resolution does not depend on `process.cwd()` (#3220).
 *
 * ## The bug this fixes
 *
 * The harness compiles fixtures under bare RELATIVE virtual names
 * (`'component.tsx'`, `` `${fixture.id}.tsx` ``, `'Test.tsx'`). When
 * `needsTypeBasedDetection(source)` is true and no Program is supplied,
 * the compiler builds one itself through `createProgramForFile`, which
 * resolves that relative name against `process.cwd()`. From the repo root
 * (no `node_modules/@barefootjs/*`) every `@barefootjs/*` import degrades
 * to `any` — a `Reactive<T>` accessor read like `fetchPosts.isPending()`
 * silently loses its brand — while `cd packages/adapter-hono && bun test`
 * resolves it. Same fixture, different compile, depending on the cwd.
 *
 * ## Why the filename stays relative
 *
 * `compileJSX`'s `filePath` is not only a type-resolution anchor: the
 * compiler FNV-hashes it into file-scope ids (`computeFileScope` —
 * `ToggleItem__<hash>`, `bf-region="<hash>:0"`). An absolute path would
 * make those hashes depend on where the repo is checked out, so every
 * call site keeps the relative filename it always used and ONLY the type
 * resolution is re-anchored, through `compileJSX`'s existing `program`
 * option (the same one `@barefootjs/vite` passes).
 *
 * `harnessProgramFor` builds that Program with `createProgramForFile`'s
 * `currentDirectory` host option: the relative `filename` is served at
 * `ANCHOR/filename` and the Program's `getCurrentDirectory()` is `ANCHOR`,
 * so `program.getSourceFile(filename)` resolves to the served source — the
 * exact check `compileJSX` makes before accepting a caller Program — and
 * `@barefootjs/*` imports resolve through `packages/adapter-tests`'s own
 * `node_modules` (this package depends on `@barefootjs/client` and every
 * first-party adapter so that directory mirrors a real consumer's).
 *
 * `ANCHOR` is a synthetic `__virtual__` subdirectory that does not exist on
 * disk: module resolution only probes its ancestors for `node_modules`, and
 * a relative import in a fixture (`./child`) can never collide with a real
 * file this package happens to contain.
 *
 * A Program is built only when `needsTypeBasedDetection(source)` is true —
 * exactly when the compiler would otherwise have built its own — so a
 * source the compiler compiles without a checker still compiles without
 * one (`namespace-import-primitive` depends on that).
 *
 * Two consequences of supplying a Program, both inert for today's corpus:
 * a supplied Program counts as "shared" for BF050, so a source importing
 * `@barefootjs/form` would no longer report BF050 (no fixture imports it);
 * and the compiler drops a caller Program when it rewrites the source
 * first (inline JSX callbacks, reactive-factory inlining) and falls back
 * to its own cwd-relative one. The client-JS scope gate pins that the
 * harness Program is accepted for every `jsxFixtures` source (entry and
 * `components`), against an exception ledger that is empty
 * today (`harness-program-ledger.ts`).
 *
 * ## Import it through `@barefootjs/adapter-tests/harness-program`
 *
 * The adapters' `test-render` modules import this file through that
 * narrow subpath, never the package barrel: the barrel loads the fixture
 * corpus, `bun:test` and happy-dom, and imports modules that import
 * `test-render` back (a cycle). Keep this module's imports to
 * `@barefootjs/jsx` and node builtins so the subpath stays that narrow.
 *
 * ## Requirement: `@barefootjs/client` must be BUILT
 *
 * Type resolution reads `dist/*.d.ts`. An unbuilt `@barefootjs/client`
 * silently regresses every caller back to `any`. Every CI job that runs
 * these tests builds it first (`ci.yml`, `ci-compat.yml`,
 * `update-fixtures.yml`); `harness-program-resolves-brand.test.ts` is the
 * guard that turns a missing build into a red test.
 */
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type ts from 'typescript'
import { compileJSX, createProgramForFile, needsTypeBasedDetection } from '@barefootjs/jsx'
import type { CompileOptionsWithAdapter, CompileResult } from '@barefootjs/jsx'

/**
 * Directory a harness compile's relative filename is resolved against for
 * type resolution. Never part of any emitted artifact.
 */
const ANCHOR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '__virtual__')

/**
 * The Program to pass as `compileJSX`'s `program` for a harness compile of
 * `source` under the relative `filename`, or `undefined` when the compiler
 * would not build a checker for this source at all.
 */
export function harnessProgramFor(source: string, filename: string): ts.Program | undefined {
  if (!needsTypeBasedDetection(source)) return undefined
  return createProgramForFile(source, filename, { currentDirectory: ANCHOR })?.program
}

/**
 * `compileJSX` with `harnessProgramFor`'s Program. `filename` must be the
 * relative virtual name the call site always used — it feeds the
 * file-scope hashes.
 */
export function compileFixtureJSX(
  source: string,
  filename: string,
  options: Omit<CompileOptionsWithAdapter, 'program'>,
): CompileResult {
  return compileJSX(source, filename, { ...options, program: harnessProgramFor(source, filename) })
}
