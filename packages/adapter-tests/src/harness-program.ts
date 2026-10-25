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
 * `test-render` back (a cycle). Keep this module's imports to `typescript`,
 * `@barefootjs/jsx` and node builtins so the subpath stays that narrow.
 *
 * ## Requirement: `@barefootjs/client` must be BUILT
 *
 * Type resolution reads `dist/*.d.ts`. An unbuilt `@barefootjs/client`
 * regresses every caller back to `any`, and the emitted templates change
 * with it: go-template prints an inferred `string[]` signal's row through
 * `bf_text` instead of bare, and lowers its `.length` to a `.Length` field
 * read that fails at render time (#3637). Every CI job that runs these
 * tests builds it first (`ci.yml`, `ci-compat.yml`,
 * `update-fixtures.yml`).
 *
 * `harnessProgramFor` therefore checks, for every Program it builds, that
 * each `@barefootjs/client` import of the source resolves, and throws
 * naming the missing build when one does not. Without that check, a
 * compile run while `dist` was missing (a fresh worktree, or a build
 * still in progress) produced different output from the same source, and
 * looked like it depended on which fixtures had been compiled before it.
 * `harness-program-resolves-brand.test.ts` additionally pins that the
 * resolved types are the real ones.
 */
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'
import { compileJSX, createAnchoredProgram } from '@barefootjs/jsx'
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
  return harnessProgramAt(source, filename, ANCHOR)
}

/**
 * `harnessProgramFor` with an explicit anchor directory. Exported for the
 * guard's own test, which anchors where `@barefootjs/client` cannot
 * resolve.
 */
export function harnessProgramAt(source: string, filename: string, anchorDir: string): ts.Program | undefined {
  const program = createAnchoredProgram(source, filename, anchorDir)
  if (!program) return undefined
  const unresolved = unresolvedClientImports(program, filename, anchorDir)
  if (unresolved.length > 0) {
    throw new Error(
      `harness compile of ${filename}: ${unresolved.join(', ')} does not resolve from ${anchorDir}. ` +
        'Build it first (`bun run --filter @barefootjs/client build`): without its types every ' +
        'reactive primitive is typed `any` and adapter output silently changes (#3637).',
    )
  }
  return program
}

/**
 * The `@barefootjs/client` specifiers (`@barefootjs/client` or a subpath)
 * that `filename`'s imports and re-exports name but that do not resolve
 * to a file under `program`'s compiler options, as seen from `anchorDir`.
 * Resolved afresh on every call, never cached: a build that removes or
 * rewrites `dist` must not leave a stale answer behind.
 */
export function unresolvedClientImports(program: ts.Program, filename: string, anchorDir: string): string[] {
  const sourceFile = program.getSourceFile(filename)
  if (!sourceFile) return []
  const containingFile = path.join(anchorDir, filename)
  const unresolved = new Set<string>()
  for (const stmt of sourceFile.statements) {
    if (!ts.isImportDeclaration(stmt) && !ts.isExportDeclaration(stmt)) continue
    const specifier = stmt.moduleSpecifier
    if (!specifier || !ts.isStringLiteral(specifier)) continue
    const name = specifier.text
    if (name !== '@barefootjs/client' && !name.startsWith('@barefootjs/client/')) continue
    const resolved = ts.resolveModuleName(name, containingFile, program.getCompilerOptions(), ts.sys)
    if (!resolved.resolvedModule) unresolved.add(name)
  }
  return [...unresolved]
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
