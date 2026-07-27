/**
 * Build for the `barefoot-lazy` SSR bench app — the lazy effect-graph
 * measurement spike tracked in spec/slot-unification.md §8 ("row-level lazy
 * EFFECT-GRAPH construction"). Hand-written prototype, throwaway quality.
 *
 * Derivation, not a real pipeline: this app IS the eager `barefoot` SSR
 * bench app with exactly one hand-edit applied to its BUILT client bundle —
 * the `d0` (initBenchSsr) function's `mapArray` call + per-row renderItem
 * closure are replaced by the lazy loop implementation in
 * client/init-replacement.js + client/lazy-loop.js. SSR HTML, styles, the
 * hydration walker, and the timing wrapper are byte-identical copies of the
 * eager app's dist (the server render module is reused too — see
 * lib/render-server.ts).
 *
 * Splicing a minified bundle is inherently anchored to the current
 * compiler's output text. Every anchor is asserted and the build fails
 * loudly with a pointer here if the eager bundle drifts — acceptable for a
 * measurement spike, never for production code.
 */
import { existsSync } from 'node:fs'
import { mkdir, cp, rm } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const appDir = dirname(fileURLToPath(import.meta.url))
const distDir = join(appDir, 'dist')
const barefootDir = join(appDir, '..', 'barefoot')
const barefootDist = join(barefootDir, 'dist')

/** Minified names of the runtime primitives inside the eager bundle, with the
 * definition snippets used to assert they still mean what we alias. */
const RUNTIME_ALIASES: Array<{ alias: string; minified: string; definition: string }> = [
  { alias: '__bfCreateSignal', minified: 'g', definition: 'function g($,Y){' },
  { alias: '__bfCreateEffect', minified: 'x', definition: 'function x($,Y,Q="effect"){' },
]

/** Splice anchors inside the eager bundle's app section. */
const D0_START = 'function d0($,Y={}){'
const D0_END = 'function $1($,Y){' // the function immediately after d0

async function ensureBarefootDist(): Promise<void> {
  if (existsSync(join(barefootDist, 'app.client.js'))) return
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
    throw new Error(`barefoot-lazy: prerequisite barefoot SSR build failed (exit ${exitCode})`)
  }
}

function spliceLazyClient(eagerSrc: string, replacement: string, helpers: string): string {
  const startIdx = eagerSrc.indexOf(D0_START)
  const endIdx = eagerSrc.indexOf(D0_END)
  if (startIdx < 0 || endIdx < 0 || endIdx <= startIdx) {
    throw new Error(
      'barefoot-lazy: splice anchors for d0 not found in ../barefoot/dist/app.client.js — ' +
        'the eager bundle drifted; update the anchors in benchmarks/ssr/apps/barefoot-lazy/build.ts',
    )
  }
  const aliasLines: string[] = []
  for (const { alias, minified, definition } of RUNTIME_ALIASES) {
    if (!eagerSrc.includes(definition)) {
      throw new Error(
        `barefoot-lazy: runtime primitive assertion failed — expected "${definition}" in the eager bundle ` +
          `(minified name for ${alias}). Update RUNTIME_ALIASES in benchmarks/ssr/apps/barefoot-lazy/build.ts`,
      )
    }
    aliasLines.push(`var ${alias}=${minified};`)
  }
  return (
    eagerSrc.slice(0, startIdx) +
    `\n${replacement}\n` +
    eagerSrc.slice(endIdx) +
    `\n// --- lazy effect-graph spike (appended by barefoot-lazy/build.ts) ---\n` +
    `${aliasLines.join('')}\n` +
    helpers
  )
}

export async function build(): Promise<void> {
  await ensureBarefootDist()

  if (existsSync(distDir)) await rm(distDir, { recursive: true, force: true })
  await mkdir(distDir, { recursive: true })

  // SSR HTML + styles: byte-identical copies of the eager app's dist.
  await cp(join(barefootDist, 'index.html'), join(distDir, 'index.html'))
  await cp(join(barefootDist, 'styles.css'), join(distDir, 'styles.css'))

  const eagerSrc = await Bun.file(join(barefootDist, 'app.client.js')).text()
  // Strip comments + whitespace from the spike sources (JS-aware, via Bun's
  // transpiler — not regex) so the "Client JS" payload column compares
  // shipped code against the eager app's minified bundle, not this spike's
  // documentation comments. Identifiers are NOT renamed (the splice relies
  // on the __bfLazy* names).
  const transpiler = new Bun.Transpiler({ loader: 'js', minifyWhitespace: true })
  const replacement = transpiler.transformSync(await Bun.file(join(appDir, 'client', 'init-replacement.js')).text())
  const helpers = transpiler.transformSync(await Bun.file(join(appDir, 'client', 'lazy-loop.js')).text())
  await Bun.write(join(distDir, 'app.client.js'), spliceLazyClient(eagerSrc, replacement, helpers))
}

if (import.meta.main) {
  await build()
  console.log('barefoot-lazy: built SSR bench to benchmarks/ssr/apps/barefoot-lazy/dist')
}
