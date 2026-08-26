/**
 * Mutation sweep generator (#2481 step 2, "mutation sweep v1"). Bun-only
 * (like `snapshot-generator.ts` itself — see that module's docstring on the
 * bun/Node two-phase split this design rests on): sweeps every shared
 * fixture spec against every mutation in `mutation/mutations.ts`, compiles
 * the mutant, and sorts the outcome into one of three buckets:
 *
 *   - `'ok'`      — compiled clean; SSR HTML + client JS written to
 *                   `.mutants/` (gitignored) through the same seeded-render
 *                   pipeline the frozen corpus uses
 *                   (`generateSharedComponentSnapshotCore`), so
 *                   `e2e/mutation.playwright.ts` can feed the mutant
 *                   through `fixture-host.ts` exactly like a real fixture.
 *   - `'refused'` — the compiler emitted an error-severity diagnostic. This
 *                   is a PASS for the mutation sweep: the compiler was loud
 *                   about something it can't lower, rather than silently
 *                   emitting broken output.
 *   - `'broken'`  — no diagnostic, but generation crashed (or produced
 *                   empty HTML/client JS) — a genuine finding. Every such
 *                   pair, plus every oracle failure `mutation.playwright.ts`
 *                   turns up on an `'ok'` mutant, belongs in
 *                   `e2e/mutation-quarantine.ts` with a tracking issue.
 *
 * A mutation whose `apply()` returns `null` for a given fixture (no
 * matching site — e.g. a component with no props for `alias-props`) is
 * recorded as `'inapplicable'` and skipped, not silently omitted: the
 * manifest is the full (fixture × mutation) matrix, so a coverage gap is
 * visible instead of merely absent.
 *
 * Usage: `bun run scripts/mutation-generate.ts` (invoked by `test:mutation`
 * ahead of the Playwright sweep; see `package.json`).
 */

import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'
import { HonoAdapter } from '@barefootjs/hono/adapter'
import { compileJSX } from '@barefootjs/jsx'
import { MUTATIONS_V1, type Mutation } from '../mutation/mutations'
import { componentSourcePath, loadAllSharedSpecs, sourceFileBasename, type SharedFixtureSpec } from '../fixtures/_helpers'
import { generateSharedComponentSnapshotCore, seedFromId } from '../src/snapshot-generator'

const HERE = dirname(fileURLToPath(import.meta.url))
export const MUTANTS_DIR = resolve(HERE, '../.mutants')
export const MANIFEST_PATH = resolve(MUTANTS_DIR, 'manifest.json')

export type MutantStatus = 'ok' | 'refused' | 'broken' | 'inapplicable'

export interface ManifestEntry {
  /** `${fixtureId}::${mutationId}` — also the seed fed to `withSeededMathRandom`. */
  id: string
  fixtureId: string
  mutationId: string
  status: MutantStatus
  componentName?: string
  props?: Record<string, unknown>
  interactions?: SharedFixtureSpec['interactions']
  /**
   * Inherited verbatim from the base fixture spec — needed so a mutant of
   * a fixture like `carousel` (embla via `externalImports`/`hostStyles`)
   * still gets a working host page; the mutation only ever touches the
   * fixture's own root source, never these harness-level declarations.
   */
  externalImports?: SharedFixtureSpec['externalImports']
  hostStyles?: SharedFixtureSpec['hostStyles']
  /** Error-severity diagnostic codes, present only for `status: 'refused'`. */
  diagnosticCodes?: string[]
  /** Present only for `status: 'ok'` — basenames (no extension) under `.mutants/`. */
  htmlFile?: string
  clientJsFile?: string
  /** Present only for `status: 'broken'` — the crash message or empty-output note. */
  brokenReason?: string
}

function fileBasename(fixtureId: string, mutationId: string): string {
  return `${fixtureId}__${mutationId}`
}

async function sweepOne(spec: SharedFixtureSpec, mutation: Mutation): Promise<ManifestEntry> {
  const id = `${spec.id}::${mutation.id}`
  const base: Pick<
    ManifestEntry,
    'id' | 'fixtureId' | 'mutationId' | 'componentName' | 'props' | 'interactions' | 'externalImports' | 'hostStyles'
  > = {
    id,
    fixtureId: spec.id,
    mutationId: mutation.id,
    componentName: spec.componentName,
    props: spec.props,
    interactions: spec.interactions,
    externalImports: spec.externalImports,
    hostStyles: spec.hostStyles,
  }

  const originalSource = await Bun.file(componentSourcePath(spec)).text()
  const sourceFile = ts.createSourceFile(
    `${sourceFileBasename(spec)}.tsx`,
    originalSource,
    ts.ScriptTarget.Latest,
    /*setParentNodes*/ true,
    ts.ScriptKind.TSX,
  )

  let mutatedSourceFile: ts.SourceFile | null
  try {
    mutatedSourceFile = mutation.apply(sourceFile)
  } catch (err) {
    return { ...base, status: 'broken', brokenReason: `mutation.apply threw: ${(err as Error).message}` }
  }
  if (!mutatedSourceFile) {
    return { ...base, status: 'inapplicable' }
  }

  const printer = ts.createPrinter({ newLine: ts.NewLineKind.LineFeed })
  const mutatedSource = printer.printFile(mutatedSourceFile)

  // Classify first, cheaply: a loud refusal never needs the full
  // render/combine pipeline below — it's a PASS on its own.
  const probe = compileJSX(mutatedSource, `${sourceFileBasename(spec)}.tsx`, { adapter: new HonoAdapter() })
  const errorDiagnostics = probe.errors.filter(e => e.severity === 'error')
  if (errorDiagnostics.length > 0) {
    return { ...base, status: 'refused', diagnosticCodes: [...new Set(errorDiagnostics.map(e => e.code))].sort() }
  }

  try {
    const outBasename = fileBasename(spec.id, mutation.id)
    const { html, clientJs } = await generateSharedComponentSnapshotCore(spec, {
      sourceOverride: mutatedSource,
      outDir: MUTANTS_DIR,
      outBasename,
      seed: seedFromId(id),
    })
    if (html.trim() === '' || clientJs.trim() === '') {
      return { ...base, status: 'broken', brokenReason: 'generation produced empty HTML or client JS with no diagnostic' }
    }
    return { ...base, status: 'ok', htmlFile: `${outBasename}.html`, clientJsFile: `${outBasename}.client.js` }
  } catch (err) {
    return { ...base, status: 'broken', brokenReason: (err as Error).message }
  }
}

async function main(): Promise<void> {
  rmSync(MUTANTS_DIR, { recursive: true, force: true })
  mkdirSync(MUTANTS_DIR, { recursive: true })

  const specs = await loadAllSharedSpecs()
  const manifest: ManifestEntry[] = []
  const counts: Record<MutantStatus, number> = { ok: 0, refused: 0, broken: 0, inapplicable: 0 }

  for (const spec of specs) {
    for (const mutation of MUTATIONS_V1) {
      const entry = await sweepOne(spec, mutation)
      manifest.push(entry)
      counts[entry.status]++
      const detail =
        entry.status === 'refused'
          ? ` [${entry.diagnosticCodes?.join(',')}]`
          : entry.status === 'broken'
            ? ` — ${entry.brokenReason}`
            : ''
      console.log(`[${entry.status}] ${entry.fixtureId} × ${entry.mutationId}${detail}`)
    }
  }

  writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2) + '\n')
  console.log(
    `\n${specs.length} fixtures × ${MUTATIONS_V1.length} mutations = ${manifest.length} pairs — ` +
      `ok=${counts.ok} refused=${counts.refused} broken=${counts.broken} inapplicable=${counts.inapplicable}`,
  )
  console.log(`Manifest written to ${MANIFEST_PATH}`)
}

await main()
