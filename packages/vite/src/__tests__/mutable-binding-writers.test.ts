/**
 * Regression (#2598): a mutable binding that survives into the emitted SSR
 * template must keep the declarations that WRITE it.
 *
 * Reachability is seeded from the RENDERED JSX, after the client-only
 * attributes are stripped — `ref={setRef}` leaves no `setRef` behind, and
 * `onClick={handleClick}` renders as `onClick={() => {}}`. Pruning code
 * reachable only from a handler is deliberate; it is client-only.
 *
 * The hole is a `let` that outlives its writer. It survives because some
 * OTHER surviving declaration reads it, while its only assignment sat in a
 * pruned handler — so the template declares it, reads it, and never assigns
 * it. TypeScript then concludes it is permanently `null`, narrows every
 * guarded use to `never`, and each member access fails with TS2339.
 *
 * The fixture reproduces the shape from the wild (piconic-ai/koma's
 * FrameEditor), and the asymmetry that makes it reachable at all:
 *
 *   <pre ref={handleHighlightRef} />   intrinsic — `ref` is STRIPPED, so
 *                                      the handler is pruned
 *   <Editable ref={handleTextareaRef}/> child component — props survive
 *                                      VERBATIM, so its handler is kept,
 *                                      which keeps `syncScroll`, which
 *                                      keeps `highlightEl` alive with no
 *                                      writer left
 *
 * A fixture with only intrinsic elements does NOT reproduce: the whole
 * cluster is pruned together and nothing is left to narrow. The child
 * component is load-bearing.
 */
import { describe, test, expect, afterAll } from 'bun:test'
import { build } from 'vite'
import { mkdtemp, rm, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import ts from 'typescript'
import { HonoAdapter } from '@barefootjs/hono/adapter'
import { barefoot } from '../plugin.ts'

const FIXTURE_ROOT = resolve(import.meta.dirname, '../../e2e-fixture-refwriter')
const APP_ROOT = join(FIXTURE_ROOT, 'app')
const COMPONENTS_DIR = join(FIXTURE_ROOT, 'components')

describe('writers of surviving mutable bindings', () => {
  let outDir: string | undefined
  const templatesDir = join(APP_ROOT, 'dist/components')

  afterAll(async () => {
    // Guarded: if the test throws before `mkdtemp` returns, `outDir` is still
    // undefined and an unguarded `rm` would throw here, replacing the real
    // failure with a cleanup TypeError.
    if (outDir) await rm(outDir, { recursive: true, force: true })
    await rm(join(APP_ROOT, 'dist'), { recursive: true, force: true })
  })

  test('retains a ref handler whose binding survives, and the template type-checks', async () => {
    outDir = await mkdtemp(join(tmpdir(), 'barefoot-vite-refwriter-dist-'))

    await build({
      configFile: false,
      root: APP_ROOT,
      base: '/static/',
      logLevel: 'warn',
      build: { outDir, emptyOutDir: true },
      plugins: [
        barefoot({
          adapter: new HonoAdapter(),
          components: [COMPONENTS_DIR],
          templates: templatesDir,
        }),
      ],
    })

    const templatePath = join(templatesDir, 'ScrollSync.tsx')
    const template = await readFile(templatePath, 'utf8')

    // The binding survives (some surviving declaration reads it) …
    expect(template).toContain('let highlightEl')
    // … so its writer must survive with it. This is the line the bug dropped.
    expect(template).toContain('highlightEl = el')

    // `renderSeq` is written with `++` rather than `=`, from a declaration
    // retained only by this same closure — pins that update expressions
    // count as writes, not just assignment operators.
    expect(template).toContain('let renderSeq')
    expect(template).toContain('renderSeq++')

    // The symptom itself, not a proxy for it: type-check the emitted
    // template. Asserting on the retained source line alone would still pass
    // if some later change made the binding un-narrowable for a different
    // reason.
    const program = ts.createProgram([templatePath], {
      strict: true,
      noEmit: true,
      target: ts.ScriptTarget.ESNext,
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      jsx: ts.JsxEmit.ReactJSX,
      jsxImportSource: '@barefootjs/hono/jsx',
      lib: ['lib.esnext.d.ts', 'lib.dom.d.ts'],
      allowImportingTsExtensions: true,
      skipLibCheck: true,
    })
    // Asserted over the WHOLE error set, not a TS2339-only filter: this
    // fixture's emitted template compiles completely clean today, so any
    // error at all — a syntax break, an unresolved import, a wrong JSX
    // setting — is a real regression, and a narrow filter would let those
    // through while still claiming the template type-checks. TS2339 on
    // `never` is simply the member of that set this PR is about.
    const errors = ts
      .getPreEmitDiagnostics(program)
      .filter((d) => d.category === ts.DiagnosticCategory.Error)
      .map((d) => `TS${d.code}: ${ts.flattenDiagnosticMessageText(d.messageText, ' ')}`)
    expect(errors).toEqual([])
  }, 60_000)
})
