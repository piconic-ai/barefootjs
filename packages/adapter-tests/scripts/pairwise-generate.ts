/**
 * Pairwise sweep generator (#2481 step 5, "Pairwise generator (t=2 floor)").
 * Mirrors `mutation-generate.ts`'s driver shape closely: builds the t=2
 * covering array (`pairwise/covering-array.ts`), composes each case
 * (`pairwise/compose.ts`), compiles it, and sorts the outcome into the
 * SAME four-way classification the mutation sweep uses:
 *
 *   - `'ok'`          — compiled clean; SSR HTML + client JS written to
 *                       `.pairwise/` (gitignored) via
 *                       `generateSharedComponentSnapshotCore`, so a later
 *                       PR's Playwright leg can feed each case through
 *                       `fixture-host.ts` exactly like a real fixture.
 *   - `'refused'`     — the compiler emitted an error-severity
 *                       diagnostic. This is a PASS for the pairwise
 *                       sweep too: per #2481's "callbacks — sound-or-loud"
 *                       design position, a loud refusal is one of the
 *                       acceptable outcomes, not a failure.
 *   - `'broken'`      — no diagnostic, but generation crashed (or
 *                       produced empty HTML/client JS) — a genuine
 *                       finding for triage in the follow-up PR.
 *   - `'inapplicable'` — not produced by this generator (every covering-
 *                       array case is, by construction, a complete axis
 *                       tuple with something to compose) but the field
 *                       stays in the manifest shape for parity with the
 *                       mutation sweep's schema.
 *
 * This script only sweeps and classifies — it does not triage, fix, or
 * quarantine anything it finds (that's the next PR, per #2481 step 6 and
 * the task that added this script).
 *
 * Usage: `bun run pairwise:generate` (see `package.json`).
 */

import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { HonoAdapter } from '@barefootjs/hono/adapter'
import { compileJSX } from '@barefootjs/jsx'
import { buildCoveringArray } from '../pairwise/covering-array'
import { composeCase } from '../pairwise/compose'
import type { AxisCombo } from '../pairwise/axes'
import { generateSharedComponentSnapshotCore, seedFromId } from '../src/snapshot-generator'
import type { SharedFixtureSpec } from '../fixtures/_helpers'

const HERE = dirname(fileURLToPath(import.meta.url))
export const PAIRWISE_DIR = resolve(HERE, '../.pairwise')
export const MANIFEST_PATH = resolve(PAIRWISE_DIR, 'manifest.json')

export type PairwiseStatus = 'ok' | 'refused' | 'broken' | 'inapplicable'

export interface PairwiseManifestEntry {
  /** Stable id: the axis tuple joined in `axes.ts`'s `AXIS_NAMES` order — also the seed fed to `withSeededMathRandom`. */
  id: string
  axes: AxisCombo
  status: PairwiseStatus
  componentName?: string
  props?: Record<string, unknown>
  interactions?: SharedFixtureSpec['interactions']
  /** Error-severity diagnostic codes, present only for `status: 'refused'`. */
  diagnosticCodes?: string[]
  /** Present only for `status: 'ok'` — basenames (no extension) under `.pairwise/`. */
  htmlFile?: string
  clientJsFile?: string
  /** Present only for `status: 'broken'` — the crash message or empty-output note. */
  brokenReason?: string
}

function idFor(combo: AxisCombo): string {
  return `state-${combo.state}__structure-${combo.structure}__binding-${combo.binding}__event-${combo.event}__callback-${combo.callback}`
}

/**
 * A pairwise case has no on-disk fixture file — `composeCase` produces the
 * source text directly — so this spec exists purely to satisfy
 * `generateSharedComponentSnapshotCore`'s signature via `sourceOverride`.
 * `sourceRoot: 'shared'` plus no `additionalComponents` keeps every
 * sibling-resolution helper it calls (`resolveSiblingComponents`,
 * `resolveSiblingModuleMap`) short-circuiting to "no siblings" without
 * ever touching disk — see those helpers' early-return branches for
 * `root === 'shared'` in `fixtures/_helpers.ts`.
 */
function specFor(id: string, componentName: string, props: Record<string, unknown> | undefined, interactions: SharedFixtureSpec['interactions']): SharedFixtureSpec {
  return {
    id,
    sourceRoot: 'shared',
    componentName,
    sourceFile: componentName,
    description: `Pairwise-generated case ${id}`,
    props,
    interactions,
  }
}

async function sweepOne(combo: AxisCombo): Promise<PairwiseManifestEntry> {
  const id = idFor(combo)
  const base: Pick<PairwiseManifestEntry, 'id' | 'axes'> = { id, axes: combo }

  let composed: ReturnType<typeof composeCase>
  try {
    composed = composeCase(combo)
  } catch (err) {
    return { ...base, status: 'broken', brokenReason: `composeCase threw: ${(err as Error).message}` }
  }

  const withCase: Pick<PairwiseManifestEntry, 'id' | 'axes' | 'componentName' | 'props' | 'interactions'> = {
    ...base,
    componentName: composed.componentName,
    props: composed.props,
    interactions: composed.interactions,
  }

  // Classify first, cheaply: a loud refusal never needs the full
  // render/combine pipeline below — it's a PASS on its own (same
  // short-circuit `mutation-generate.ts` uses).
  const probe = compileJSX(composed.source, `${composed.componentName}.tsx`, { adapter: new HonoAdapter() })
  const errorDiagnostics = probe.errors.filter(e => e.severity === 'error')
  if (errorDiagnostics.length > 0) {
    return { ...withCase, status: 'refused', diagnosticCodes: [...new Set(errorDiagnostics.map(e => e.code))].sort() }
  }

  try {
    const spec = specFor(id, composed.componentName, composed.props, composed.interactions)
    const { html, clientJs } = await generateSharedComponentSnapshotCore(spec, {
      sourceOverride: composed.source,
      outDir: PAIRWISE_DIR,
      outBasename: id,
      seed: seedFromId(id),
    })
    if (html.trim() === '' || clientJs.trim() === '') {
      return { ...withCase, status: 'broken', brokenReason: 'generation produced empty HTML or client JS with no diagnostic' }
    }
    return { ...withCase, status: 'ok', htmlFile: `${id}.html`, clientJsFile: `${id}.client.js` }
  } catch (err) {
    return { ...withCase, status: 'broken', brokenReason: (err as Error).message }
  }
}

async function main(): Promise<void> {
  rmSync(PAIRWISE_DIR, { recursive: true, force: true })
  mkdirSync(PAIRWISE_DIR, { recursive: true })

  const { cases, totalValidPairs } = buildCoveringArray()
  const manifest: PairwiseManifestEntry[] = []
  const counts: Record<PairwiseStatus, number> = { ok: 0, refused: 0, broken: 0, inapplicable: 0 }

  for (const combo of cases) {
    const entry = await sweepOne(combo)
    manifest.push(entry)
    counts[entry.status]++
    const detail =
      entry.status === 'refused'
        ? ` [${entry.diagnosticCodes?.join(',')}]`
        : entry.status === 'broken'
          ? ` — ${entry.brokenReason}`
          : ''
    console.log(`[${entry.status}] ${entry.id}${detail}`)
  }

  writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2) + '\n')
  console.log(
    `\n${cases.length} pairwise cases (t=2 floor over ${totalValidPairs} valid axis-value pairs) — ` +
      `ok=${counts.ok} refused=${counts.refused} broken=${counts.broken} inapplicable=${counts.inapplicable}`,
  )
  console.log(`Manifest written to ${MANIFEST_PATH}`)
}

await main()
