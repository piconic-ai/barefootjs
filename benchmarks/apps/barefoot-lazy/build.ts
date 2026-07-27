/**
 * Build for the `barefoot-lazy` DOM bench app — the lazy effect-graph
 * measurement spike tracked in spec/slot-unification.md §8 ("row-level lazy
 * EFFECT-GRAPH construction"). Hand-written prototype, throwaway quality.
 *
 * Derivation, not a real pipeline: this app IS the eager `barefoot` DOM
 * bench app's built dist with exactly one hand-edit applied to
 * components/Bench.client.js — the `mapArray` call + per-row renderItem
 * closure are replaced by the lazy loop implementation in
 * client/loop-replacement.js + client/lazy-loop.js. index.html, styles.css,
 * and the runtime bundle (components/barefoot.js) are byte-identical
 * copies. Top-level signals (rows/selected) and the delegated tbody click
 * handler stay exactly as compiled; ONLY the row loop becomes lazy.
 *
 * The splice is anchored to the current compiler's (unminified) output
 * text; anchors are asserted and the build fails loudly with a pointer
 * here if the eager output drifts — acceptable for a measurement spike.
 */
import { existsSync } from 'node:fs'
import { mkdir, cp, rm } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const appDir = dirname(fileURLToPath(import.meta.url))
const distDir = join(appDir, 'dist')
const barefootDir = join(appDir, '..', 'barefoot')
const barefootDist = join(barefootDir, 'dist')

/** Splice anchors inside the eager app's unminified Bench.client.js. */
const LOOP_START = "  mapArray(() => rows(), _s11, (row) => String(row.id), (row, __idx, __existing) => {"
const LOOP_END = "  }, 'l0')\n"

async function ensureBarefootDist(): Promise<void> {
  if (existsSync(join(barefootDist, 'components', 'Bench.client.js'))) return
  const proc = Bun.spawn({
    cmd: ['bun', join(barefootDir, 'build.ts')],
    stdout: 'pipe',
    stderr: 'pipe',
  })
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ])
  if (exitCode !== 0) {
    console.error(stdout)
    console.error(stderr)
    throw new Error(`barefoot-lazy: prerequisite barefoot DOM app build failed (exit ${exitCode})`)
  }
}

function spliceLazyClient(eagerSrc: string, replacement: string, helpers: string): string {
  const startIdx = eagerSrc.indexOf(LOOP_START)
  if (startIdx < 0) {
    throw new Error(
      'barefoot-lazy: mapArray splice anchor not found in ../barefoot/dist/components/Bench.client.js — ' +
        'the eager output drifted; update the anchors in benchmarks/apps/barefoot-lazy/build.ts',
    )
  }
  const endIdx = eagerSrc.indexOf(LOOP_END, startIdx)
  if (endIdx < 0) {
    throw new Error(
      "barefoot-lazy: mapArray end anchor (\"  }, 'l0')\") not found — " +
        'update the anchors in benchmarks/apps/barefoot-lazy/build.ts',
    )
  }
  return (
    eagerSrc.slice(0, startIdx) +
    replacement +
    eagerSrc.slice(endIdx + LOOP_END.length) +
    '\n// --- lazy effect-graph spike (appended by barefoot-lazy/build.ts) ---\n' +
    helpers
  )
}

export async function build(): Promise<void> {
  await ensureBarefootDist()

  if (existsSync(distDir)) await rm(distDir, { recursive: true, force: true })
  await mkdir(join(distDir, 'components'), { recursive: true })

  await cp(join(barefootDist, 'index.html'), join(distDir, 'index.html'))
  await cp(join(barefootDist, 'styles.css'), join(distDir, 'styles.css'))
  await cp(join(barefootDist, 'components', 'barefoot.js'), join(distDir, 'components', 'barefoot.js'))

  const eagerSrc = await Bun.file(join(barefootDist, 'components', 'Bench.client.js')).text()
  // Strip comments from the spike sources (JS-aware, via Bun's transpiler —
  // not regex) so the "shipped JS" column compares code against code, not
  // this spike's documentation comments. The eager Bench.client.js is
  // unminified, so no whitespace minification here (identifiers are never
  // renamed either way — the splice relies on the __bfLazy* names).
  const transpiler = new Bun.Transpiler({ loader: 'js' })
  const replacement = transpiler.transformSync(await Bun.file(join(appDir, 'client', 'loop-replacement.js')).text())
  const helpers = transpiler.transformSync(await Bun.file(join(appDir, 'client', 'lazy-loop.js')).text())
  await Bun.write(join(distDir, 'components', 'Bench.client.js'), spliceLazyClient(eagerSrc, replacement, helpers))
}

if (import.meta.main) {
  await build()
  console.log('barefoot-lazy: built to benchmarks/apps/barefoot-lazy/dist')
}
