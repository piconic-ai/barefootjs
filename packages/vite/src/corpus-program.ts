/**
 * Shared `ts.Program` management for the plugin's compile passes.
 *
 * Type-based reactivity detection (Reactive<T> brand classification, the
 * BF023/BF024 nullable-loop-key check) needs a `ts.TypeChecker`. Without a
 * caller-supplied Program, `compileJSX` falls back to building one Program
 * PER FILE — and `ts.createProgram`'s dominant cost is constructing the
 * lib.d.ts/node_modules type graph, not parsing the one source file
 * (~500-600 ms per call regardless of file size; ~44-109 s measured across
 * site/ui's 71 type-needing files). Worse than slow: for a file importing
 * a Reactive<T>-branded package (`@barefootjs/form`) the analyzer emits
 * BF050 at severity `error` when no shared Program was supplied, and the
 * plugin throws on error diagnostics — so without this manager such a file
 * cannot build through the plugin at all. See #2537.
 *
 * This manager keeps ONE Program whose roots are every discovered file
 * that `needsTypeBasedDetection` says needs a checker (a cheap content
 * test — the majority of components don't and never pay anything). The
 * type graph is built once per build (~hundreds of ms, amortized), and
 * watch-mode rebuilds go through `ts.createProgram`'s `oldProgram`
 * incremental path: unchanged files reuse their parsed SourceFiles, so a
 * single-file edit re-parses only that file (tens of ms).
 *
 * Contract with the analyzer: `compileJSX` only uses a supplied Program if
 * `program.getSourceFile(filePath).text` EXACTLY matches the source being
 * compiled (a mismatched Program is silently discarded, which would
 * re-open the per-file fallback and, for brand importers, BF050). Both
 * entry points verify that text match and rebuild — or fall back to a
 * virtual single-file Program for in-memory content that diverges from
 * disk — rather than ever handing back a Program the analyzer would
 * reject.
 */
import path from 'node:path'
import type ts from 'typescript'
import {
  createProgramForCorpus,
  createProgramForFile,
  needsTypeBasedDetection,
} from '@barefootjs/jsx'

export class CorpusProgramManager {
  private program: ts.Program | undefined
  private roots = new Set<string>()

  /**
   * (Re)build the corpus Program from a full discovery pass's snapshot.
   * Filters `files` down to the ones needing type-based detection; no-ops
   * entirely (keeping the existing Program) when the root set and every
   * root's on-Program text are unchanged — the common case for the dev
   * watcher's full re-runs, where `CompileCache` already makes unchanged
   * files free and this keeps the Program free too.
   *
   * Callers pass the content DISCOVERY read, and `createProgramForCorpus`'s
   * host re-reads from disk — the two can only diverge if the file changed
   * in the microseconds between, and `programFor`'s per-file text check
   * catches exactly that before any compile trusts the Program.
   */
  seed(files: readonly { absPath: string; content: string }[]): void {
    const needing = files
      .filter(f => needsTypeBasedDetection(f.content))
      .map(f => ({ abs: path.resolve(f.absPath), content: f.content }))

    if (needing.length === 0) {
      this.program = undefined
      this.roots.clear()
      return
    }

    const sameRoots =
      needing.length === this.roots.size && needing.every(f => this.roots.has(f.abs))
    const sameText =
      sameRoots &&
      this.program !== undefined &&
      needing.every(f => this.program!.getSourceFile(f.abs)?.text === f.content)
    if (sameText) return

    this.roots = new Set(needing.map(f => f.abs))
    this.rebuild()
  }

  /**
   * The Program to pass as `CompileOptions.program` when compiling
   * `absPath` with `content` — or `undefined` when the file doesn't need
   * type-based detection at all (the analyzer then never builds a checker,
   * and passing nothing costs nothing).
   *
   * Handles the two ways the seeded Program can be behind reality:
   * - `absPath` isn't a root yet (a needing file created after the last
   *   seed, reached by the graph pass before the next eager pass) or its
   *   disk content changed: add the root and rebuild incrementally.
   * - `content` diverges from what's on disk even after a rebuild (an
   *   in-flight edit): fall back to a virtual single-file Program built
   *   from `content` itself — the pre-manager per-file behavior, correct
   *   and BF050-suppressing, just slow, and only for that one file until
   *   disk catches up.
   */
  programFor(absPath: string, content: string): ts.Program | undefined {
    if (!needsTypeBasedDetection(content)) return undefined
    const abs = path.resolve(absPath)

    const cached = this.program?.getSourceFile(abs)
    if (cached && cached.text === content) return this.program

    this.roots.add(abs)
    this.rebuild()

    const rebuilt = this.program?.getSourceFile(abs)
    if (rebuilt && rebuilt.text === content) return this.program

    return createProgramForFile(content, abs)?.program
  }

  private rebuild(): void {
    try {
      this.program = createProgramForCorpus([...this.roots], {
        oldProgram: this.program,
      })
    } catch {
      // A failed corpus build degrades to `programFor`'s virtual
      // single-file fallback per needing file — slow but correct, and the
      // same failure would almost certainly hit the per-file path too.
      this.program = undefined
    }
  }
}
