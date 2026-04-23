/**
 * Shared ts.Program construction for whole-corpus builds.
 *
 * The per-file `createProgramForFile` helper pays ~500 ms of Program
 * setup for every invocation because it re-parses node_modules type
 * declarations each time. On a 196-file corpus that is ~98 seconds of
 * pure overhead.
 *
 * `createProgramForCorpus` builds one Program containing every entry
 * file as a root so the Program is constructed once per build. The
 * returned Program can be reused across `compileJSX` calls via
 * `CompileOptions.program`, letting every file benefit from type-based
 * reactive-primitive detection for a fixed amortized cost (~440 ms in
 * measurements against site/ui/components).
 *
 * Build-time measurement (site/ui/components, 196 files, M4 Mac):
 *   Baseline (Program per file, heuristic-gated): 1361 ms total
 *   Forced (Program per file, no gate):          78893 ms total
 *   Shared (this helper):                         1883 ms total
 *                                                  (= 440 ms build + 1444 ms compile)
 *
 * The baseURL is inferred from the common parent directory of the
 * provided files; callers who need a specific tsconfig layout can
 * override it via options.
 */

import ts from 'typescript'
import path from 'path'

export interface SharedProgramOptions {
  /** Override baseUrl for module resolution. Defaults to common parent of files. */
  baseUrl?: string
  /** Extra compilerOptions merged over the defaults. */
  compilerOptions?: ts.CompilerOptions
}

function commonParent(paths: string[]): string {
  if (paths.length === 0) return process.cwd()
  if (paths.length === 1) return path.dirname(paths[0])
  const split = paths.map((p) => path.resolve(p).split(path.sep))
  const min = Math.min(...split.map((s) => s.length))
  const parts: string[] = []
  for (let i = 0; i < min; i++) {
    const first = split[0][i]
    if (split.every((s) => s[i] === first)) parts.push(first)
    else break
  }
  return parts.join(path.sep) || path.sep
}

/**
 * Build one ts.Program that knows about every file in `files`. Suitable
 * for whole-corpus builds (CLI, site adapters) where many files share a
 * type dependency graph.
 */
export function createProgramForCorpus(
  files: string[],
  options: SharedProgramOptions = {}
): ts.Program {
  const baseUrl = options.baseUrl ?? commonParent(files)
  const compilerOptions: ts.CompilerOptions = {
    target: ts.ScriptTarget.Latest,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    jsx: ts.JsxEmit.ReactJSX,
    strict: true,
    skipLibCheck: true,
    noEmit: true,
    allowJs: false,
    esModuleInterop: true,
    baseUrl,
    ...options.compilerOptions,
  }
  const absolute = files.map((f) => path.resolve(f))
  return ts.createProgram(absolute, compilerOptions)
}
