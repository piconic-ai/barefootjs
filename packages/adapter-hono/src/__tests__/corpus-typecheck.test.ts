/**
 * Corpus type-check gate: compile EVERY `ui/components/ui/*` component with
 * the Hono adapter and run one tsc program over all emitted templates.
 *
 * #2559, #2565, and #2570 were each found by a downstream app migrating its
 * BarefootJS version, not by CI — the example-based consumer-typecheck cases
 * pin each *known* shape, but can't anticipate the next one. The real ui/
 * corpus can: it exercises every emitter path the library itself uses, so a
 * new type-level emission defect surfaces here as a new diagnostic.
 *
 * The gate holds the line at the CURRENT profile via `KNOWN_DIAGNOSTICS`
 * (issue #2573): a (component, TS code) pair outside the allowlist, or a
 * count above its allowlisted ceiling, fails. Fixing a family should ratchet
 * its entry down (or out) in the same PR — entries may only shrink.
 *
 * Heaviest test in this package (~30s compile + ~10s tsc), deliberately one
 * program for all templates so cross-template imports (`../button`,
 * `../../types`) resolve like a consumer app's.
 */
import { describe, expect, test } from 'bun:test'
import { cpSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import ts from 'typescript'
import { compileJSX } from '@barefootjs/jsx'
import { HonoAdapter } from '../adapter/index.ts'

const HERE = resolve(import.meta.dir)
const REPO = resolve(HERE, '../../../..')
const UI = join(REPO, 'ui/components/ui')
const UI_TYPES = join(REPO, 'ui/types/index.tsx')

/**
 * Pre-existing type-level debt in emitted templates, tracked in
 * https://github.com/piconic-ai/barefootjs/issues/2573 — see the issue for
 * the per-family mechanisms. Counts are ceilings: shrink them (or delete
 * the entry) when a family is fixed; never raise one to make a new defect
 * pass.
 */
const KNOWN_DIAGNOSTICS: Record<string, number> = {
  'carousel TS7005': 2,
  'carousel TS7034': 1,
  'chart TS17001': 6,
  'chart TS18046': 69,
  'chart TS2307': 2,
  'chart TS2322': 2,
  'chart TS7006': 34,
  'icon TS2322': 34,
  'slider TS2532': 1,
  'spinner TS2322': 1,
  'xyflow TS2304': 7,
  'xyflow TS2307': 2,
}

describe('ui corpus type-check gate (#2570 / #2573)', () => {
  test('emitted templates introduce no type diagnostics beyond the known debt', () => {
    const tmp = mkdtempSync(join(HERE, '.corpus-typecheck-'))
    try {
      mkdirSync(join(tmp, 'components', 'ui'), { recursive: true })
      // `../../types` (from a component) and `../../../types` (both shapes
      // appear in ui sources) — mirror the source tree's resolution targets.
      // Parent dirs created explicitly: `cpSync`'s parent-creation behaviour
      // for file→file copies is an implementation detail not worth relying on.
      mkdirSync(join(tmp, 'types'), { recursive: true })
      mkdirSync(join(tmp, 'components', 'types'), { recursive: true })
      cpSync(UI_TYPES, join(tmp, 'types', 'index.tsx'))
      cpSync(UI_TYPES, join(tmp, 'components', 'types', 'index.tsx'))

      const roots: string[] = []
      for (const name of readdirSync(UI).sort()) {
        let source: string
        try {
          source = readFileSync(join(UI, name, 'index.tsx'), 'utf8')
        } catch {
          continue
        }
        const result = compileJSX(source, join(UI, name, 'index.tsx'), {
          adapter: new HonoAdapter(),
        })
        // A component the compiler refuses outright is a different failure
        // class (covered by conformance) — this gate is about the emitted
        // templates, so refusals must not silently shrink its coverage.
        expect(result.errors.filter(e => e.severity === 'error')).toEqual([])
        const template = result.files.find(f => f.type === 'markedTemplate')?.content
        if (!template) continue
        const dir = join(tmp, 'components', 'ui', name)
        mkdirSync(dir, { recursive: true })
        const out = join(dir, 'index.tsx')
        writeFileSync(out, template)
        roots.push(out)
      }
      // The corpus is the coverage — a collapse in compiled-template count
      // would make the diagnostic assertions below pass vacuously.
      expect(roots.length).toBeGreaterThanOrEqual(60)

      const program = ts.createProgram(roots, {
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

      const counts = new Map<string, number>()
      const samples = new Map<string, string>()
      for (const d of ts.getPreEmitDiagnostics(program)) {
        const component = d.file
          ? d.file.fileName.replace(`${tmp}/components/ui/`, '').replace('/index.tsx', '')
          : '(no file)'
        const key = `${component} TS${d.code}`
        counts.set(key, (counts.get(key) ?? 0) + 1)
        if (!samples.has(key)) {
          samples.set(key, ts.flattenDiagnosticMessageText(d.messageText, ' ').slice(0, 200))
        }
      }

      const violations: string[] = []
      for (const [key, count] of [...counts].sort()) {
        const allowed = KNOWN_DIAGNOSTICS[key]
        if (allowed === undefined) {
          violations.push(`NEW ${key} x${count} — ${samples.get(key)}`)
        } else if (count > allowed) {
          violations.push(`GREW ${key}: ${allowed} -> ${count} — ${samples.get(key)}`)
        }
      }
      expect(violations).toEqual([])
    } finally {
      rmSync(tmp, { recursive: true, force: true })
    }
  }, 180_000)
})
