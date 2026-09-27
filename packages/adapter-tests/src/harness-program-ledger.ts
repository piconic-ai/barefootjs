/**
 * Harness-Program acceptance: the shared expectation and its exception
 * ledger (#3220).
 *
 * `compileJSX` (the `callerProgram` check in `compiler.ts`) and
 * `analyzeComponent` silently drop a caller Program whose SourceFile text
 * no longer matches the source they analyze — which happens whenever the
 * compiler rewrites the source first (inline JSX callbacks,
 * reactive-factory inlining) — and rebuild one with
 * `createProgramForFile(source, filePath)` WITHOUT a `currentDirectory`,
 * i.e. cwd-relative again, with nothing to say so. Counting Program
 * creations around a harness compile makes that fallback visible.
 *
 * Checked corpus-wide by the client-JS scope gate
 * (`__tests__/client-js-scope.test.ts`), which already compiles every
 * `jsxFixtures` source through `compileFixtureJSX`, and for `components`
 * sources under their literal key by
 * `__tests__/harness-program-resolves-brand.test.ts`.
 */
import { getCompilerCounters, needsTypeBasedDetection } from '@barefootjs/jsx'

/**
 * Shrink-only ledger of corpus sources whose harness Program `compileJSX`
 * is allowed to reject, keyed `<fixture id>` (entry source) or
 * `<fixture id>:<components key>`. Starts EMPTY and may only shrink.
 *
 * A fixture that reaches a source-rewrite path must fix the fallback
 * (carry the anchor through the rebuild) or be declared here with the
 * reason — never slip through as a silently cwd-dependent compile.
 */
export const HARNESS_PROGRAM_REJECTION_EXCEPTIONS: ReadonlySet<string> = new Set<string>([])

/**
 * Read after a `compileFixtureJSX(source, …)` run that started from
 * `resetCompilerCounters()` with instrumentation enabled. Returns a
 * description when the compile built a Program beyond the harness's own,
 * else `undefined`.
 *
 * `harnessProgramFor` builds exactly one Program when
 * `needsTypeBasedDetection(source)` holds (its gate) and none otherwise.
 * Anything beyond that is the compiler's cwd-relative fallback: the
 * harness Program was rejected, or, with none supplied, the compiler built
 * one for a rewritten source. The count does not depend on the filename
 * the source is compiled under.
 */
export function harnessProgramOverbuild(source: string): string | undefined {
  const expected = needsTypeBasedDetection(source) ? 1 : 0
  const actual = getCompilerCounters().programCreations
  return actual === expected ? undefined : `${actual} Program(s) built, expected ${expected}`
}
