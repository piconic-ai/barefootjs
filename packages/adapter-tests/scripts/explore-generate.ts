/**
 * Bounded state-space exploration generator (#3046).
 *
 * Mirrors `pairwise-generate.ts`'s driver shape: for every scenario in
 * `explore/scenarios`, enumerate the reachable states and action paths
 * (`explore/explorer.ts`), then render ONE fresh fixture per distinct
 * state — SSR HTML with `props: { initial: state }` plus the scenario's
 * client JS — into `.explore/` (gitignored) via
 * `generateSharedComponentSnapshotCore`, so `e2e/explore.playwright.ts`
 * can host each state through `fixture-host.ts` exactly like a real
 * fixture and compare "clicked here from the initial state" against
 * "rendered fresh at this state".
 *
 * Classification per scenario (same four-way vocabulary as the mutation
 * and pairwise sweeps):
 *
 *   - `'ok'`           — compiled clean and every state rendered; a
 *                        `states`/`paths` table follows.
 *   - `'refused'`      — an error-severity diagnostic. A PASS for this
 *                        sweep too (sound-or-loud): a loud refusal is an
 *                        acceptable outcome, and a scenario written to
 *                        probe reconciliation that gets refused instead
 *                        is a finding of its own kind, reported not hidden.
 *   - `'broken'`       — no diagnostic, but a state's render crashed or
 *                        produced empty output — a genuine finding.
 *   - `'inapplicable'` — never produced here (every scenario has an
 *                        initial state to render); kept for schema parity.
 *
 * Also writes `<scenario>.ir.json` (the ComponentIR, `outputIR`) and the
 * TSX source into the manifest, so a failure artifact can carry both
 * without the browser leg re-compiling anything.
 *
 * Usage: `bun run explore:generate` (see `package.json`).
 */

import { execSync } from 'node:child_process'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { HonoAdapter } from '@barefootjs/hono/adapter'
import { compileJSX } from '@barefootjs/jsx'
import { explore } from '../explore/explorer'
import { SCENARIOS } from '../explore/scenarios'
import type { Scenario } from '../explore/scenario'
import { generateSharedComponentSnapshotCore, seedFromId } from '../src/snapshot-generator'
import type { SharedFixtureSpec } from '../fixtures/_helpers'

const HERE = dirname(fileURLToPath(import.meta.url))
export const EXPLORE_DIR = resolve(HERE, '../.explore')
export const MANIFEST_PATH = resolve(EXPLORE_DIR, 'manifest.json')

export type ExploreStatus = 'ok' | 'refused' | 'broken' | 'inapplicable'

export interface ExploreStateEntry {
  /** Discovery index — also the fixture id suffix. */
  index: number
  /** `canonicalStateKey` of `state`. */
  key: string
  state: unknown
  /** `fixture-host.ts` route key: `explore__<scenario>__s<index>`. */
  fixtureId: string
  /** Basenames under `.explore/`. */
  htmlFile: string
  clientJsFile: string
}

export interface ExplorePathEntry {
  id: string
  actions: string[]
  /** `index` of the state this path ends in (its start is always state 0). */
  toIndex: number
}

export interface ExploreManifestEntry {
  scenarioId: string
  componentName: string
  description: string
  status: ExploreStatus
  maxDepth: number
  /** The scenario's TSX, verbatim — carried so failure artifacts are self-contained. */
  source: string
  /** Error-severity diagnostic codes, present only for `status: 'refused'`. */
  diagnosticCodes?: string[]
  /** Present only for `status: 'broken'`. */
  brokenReason?: string
  /** Present only for `status: 'ok'`. */
  irFile?: string
  states?: ExploreStateEntry[]
  paths?: ExplorePathEntry[]
}

export interface ExploreManifest {
  /** `git rev-parse HEAD` at generation time, or `'unknown'` outside a checkout. */
  commit: string
  scenarios: ExploreManifestEntry[]
}

export function stateFixtureId(scenarioId: string, index: number): string {
  return `explore__${scenarioId}__s${index}`
}

function gitHead(): string {
  try {
    return execSync('git rev-parse HEAD', { cwd: HERE, encoding: 'utf8' }).trim()
  } catch {
    return 'unknown'
  }
}

/**
 * The spec handed to `generateSharedComponentSnapshotCore` purely to
 * satisfy its signature via `sourceOverride` — same trick as
 * `pairwise-generate.ts`'s `specFor`: `sourceRoot: 'shared'` with no
 * `additionalComponents` short-circuits every sibling-resolution helper
 * to "no siblings" without touching disk.
 */
function specFor(scenario: Scenario<unknown, string>, fixtureId: string, state: unknown): SharedFixtureSpec {
  return {
    id: fixtureId,
    sourceRoot: 'shared',
    componentName: scenario.componentName,
    sourceFile: scenario.componentName,
    description: `Explore state ${fixtureId} of scenario ${scenario.id}`,
    props: { initial: state },
  }
}

async function sweepOne(scenario: Scenario<unknown, string>): Promise<ExploreManifestEntry> {
  const base = {
    scenarioId: scenario.id,
    componentName: scenario.componentName,
    description: scenario.description,
    maxDepth: scenario.bounds.maxDepth,
    source: scenario.source,
  }

  // Classify first, cheaply: a loud refusal never needs the render loop.
  const probe = compileJSX(scenario.source, `${scenario.componentName}.tsx`, { adapter: new HonoAdapter(), outputIR: true })
  const errorDiagnostics = probe.errors.filter(e => e.severity === 'error')
  if (errorDiagnostics.length > 0) {
    return { ...base, status: 'refused', diagnosticCodes: [...new Set(errorDiagnostics.map(e => e.code))].sort() }
  }

  let exploration: ReturnType<typeof explore>
  try {
    exploration = explore(scenario)
  } catch (err) {
    return { ...base, status: 'broken', brokenReason: `explore() threw: ${(err as Error).message}` }
  }

  const irFile = `${scenario.id}.ir.json`
  const ir = probe.files.find(f => f.type === 'ir' && (f.componentName === undefined || f.componentName === scenario.componentName))
  writeFileSync(resolve(EXPLORE_DIR, irFile), (ir?.content ?? 'null') + '\n')

  const states: ExploreStateEntry[] = []
  for (const explored of exploration.states) {
    const fixtureId = stateFixtureId(scenario.id, explored.index)
    try {
      const { html, clientJs } = await generateSharedComponentSnapshotCore(specFor(scenario, fixtureId, explored.state), {
        sourceOverride: scenario.source,
        outDir: EXPLORE_DIR,
        outBasename: fixtureId,
        seed: seedFromId(fixtureId),
      })
      if (html.trim() === '' || clientJs.trim() === '') {
        return { ...base, status: 'broken', brokenReason: `state s${explored.index} rendered empty HTML or client JS with no diagnostic` }
      }
      states.push({
        index: explored.index,
        key: explored.key,
        state: explored.state,
        fixtureId,
        htmlFile: `${fixtureId}.html`,
        clientJsFile: `${fixtureId}.client.js`,
      })
    } catch (err) {
      return { ...base, status: 'broken', brokenReason: `state s${explored.index}: ${(err as Error).message}` }
    }
  }

  const indexByKey = new Map(exploration.states.map(s => [s.key, s.index]))
  const paths: ExplorePathEntry[] = exploration.paths.map(p => ({
    id: p.id,
    actions: [...p.actions],
    toIndex: indexByKey.get(p.toKey)!,
  }))

  return { ...base, status: 'ok', irFile, states, paths }
}

async function main(): Promise<void> {
  rmSync(EXPLORE_DIR, { recursive: true, force: true })
  mkdirSync(EXPLORE_DIR, { recursive: true })

  const manifest: ExploreManifest = { commit: gitHead(), scenarios: [] }
  const counts: Record<ExploreStatus, number> = { ok: 0, refused: 0, broken: 0, inapplicable: 0 }
  let totalStates = 0
  let totalPaths = 0

  for (const scenario of SCENARIOS) {
    const entry = await sweepOne(scenario)
    manifest.scenarios.push(entry)
    counts[entry.status]++
    const detail =
      entry.status === 'refused'
        ? ` [${entry.diagnosticCodes?.join(',')}]`
        : entry.status === 'broken'
          ? ` — ${entry.brokenReason}`
          : ` — ${entry.states!.length} states, ${entry.paths!.length} paths (depth ≤ ${entry.maxDepth})`
    if (entry.status === 'ok') {
      totalStates += entry.states!.length
      totalPaths += entry.paths!.length
    }
    console.log(`[${entry.status}] ${entry.scenarioId}${detail}`)
  }

  writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2) + '\n')
  console.log(
    `\n${SCENARIOS.length} scenarios — ok=${counts.ok} refused=${counts.refused} broken=${counts.broken} inapplicable=${counts.inapplicable}; ` +
      `${totalStates} state fixtures, ${totalPaths} paths`,
  )
  console.log(`Manifest written to ${MANIFEST_PATH}`)
}

await main()
