/**
 * Content-hash keyed cache of full `CompileResult` objects.
 *
 * Both the graph pass (`transform`, driven by Rollup visiting `.tsx`
 * modules) and the eager pass (`writeBundle`, driven by a directory walk
 * that isn't gated on the module graph at all — see the design's rationale
 * for why server-only components need it) call `compileFile()` for the
 * same source files. Keying by content hash rather than just by file path
 * means a file edited between the two passes (or across a `--watch`
 * rebuild) always recompiles, while an unchanged file is compiled exactly
 * once no matter which pass reaches it first.
 */
import { createHash } from 'node:crypto'
import type { CompileResult } from '@barefootjs/jsx'

function hashContent(content: string): string {
  return createHash('sha256').update(content).digest('hex')
}

interface CacheRow {
  hash: string
  result: CompileResult
}

export class CompileCache {
  private rows = new Map<string, CacheRow>()

  /**
   * Return the cached `CompileResult` for `absPath` if its content hash
   * matches what's cached; otherwise call `compile()`, cache the result,
   * and return it. `compile()` runs at most once per distinct
   * `(absPath, content)` pair.
   */
  getOrCompile(
    absPath: string,
    content: string,
    compile: () => CompileResult,
  ): CompileResult {
    const hash = hashContent(content)
    const cached = this.rows.get(absPath)
    if (cached && cached.hash === hash) return cached.result

    const result = compile()
    this.rows.set(absPath, { hash, result })
    return result
  }

  /** Look up a previously cached result without recompiling. */
  peek(absPath: string): CompileResult | undefined {
    return this.rows.get(absPath)?.result
  }

  /** Drop a single file's cached entry — used when a file is deleted
   * (dev watcher `'unlink'`) so a later file recreated at the same path
   * never reuses a stale result keyed only by path, not content. */
  delete(absPath: string): void {
    this.rows.delete(absPath)
  }

  clear(): void {
    this.rows.clear()
  }
}
