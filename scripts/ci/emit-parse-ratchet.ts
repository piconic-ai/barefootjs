#!/usr/bin/env bun
/**
 * The emit-parse ratchet (#3516). Logic and rationale:
 * `scripts/lib/emit-parse-ratchet.ts`.
 *
 *   bun scripts/ci/emit-parse-ratchet.ts            # check the tree against emit-parse-baseline.json
 *   bun scripts/ci/emit-parse-ratchet.ts --update   # regenerate emit-parse-baseline.json
 *   bun scripts/ci/emit-parse-ratchet.ts --update --force
 *     # also when the tree has more calls than the committed baseline: refused
 *     # without --force, so a regeneration can only lower the baseline
 *
 * Runs from the repository root whatever the current directory, so paths in
 * the baseline are root-relative.
 */
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  BASELINE_FILE,
  REGENERATE_COMMAND,
  type EmitParseBaseline,
  type TreeCounts,
  compareToBaseline,
  formatVerdict,
  growth,
  measureSource,
  serializeBaseline,
} from '../lib/emit-parse-ratchet'

const root = fileURLToPath(new URL('../..', import.meta.url))
const baselinePath = resolve(root, BASELINE_FILE)
const update = process.argv.includes('--update')
const force = process.argv.includes('--force')

/**
 * Phase 2: the client-JS emitter, the shared adapter layer and every template
 * adapter. `adapter-tests` is the conformance harness, not an emitter.
 */
function phase2Dirs(): string[] {
  const adapters = readdirSync(resolve(root, 'packages'))
    .filter(name => name.startsWith('adapter-') && name !== 'adapter-tests')
    .map(name => `packages/${name}/src`)
  return ['packages/jsx/src/ir-to-client-js', 'packages/jsx/src/adapters', ...adapters]
    .filter(dir => existsSync(resolve(root, dir)) && statSync(resolve(root, dir)).isDirectory())
    .sort()
}

/**
 * Shipping sources under `dir`: no tests, no declarations, and none of the
 * adapters' dev-only render harnesses (`test-render.ts`), which run a backend
 * for the conformance suite rather than emit anything.
 */
function sources(dir: string): string[] {
  return readdirSync(dir).flatMap(name => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return name === '__tests__' ? [] : sources(path)
    if (!name.endsWith('.ts') || name.endsWith('.test.ts') || name.endsWith('.d.ts')) return []
    return name === 'test-render.ts' ? [] : [path]
  })
}

function measureTree(): TreeCounts {
  const tree: TreeCounts = {}
  for (const dir of phase2Dirs()) {
    for (const file of sources(resolve(root, dir))) {
      const path = relative(root, file)
      const counts = measureSource(path, readFileSync(file, 'utf8'))
      if (Object.keys(counts).length > 0) tree[path] = counts
    }
  }
  return tree
}

const tree = measureTree()
const previous: EmitParseBaseline | null = existsSync(baselinePath)
  ? (JSON.parse(readFileSync(baselinePath, 'utf8')) as EmitParseBaseline)
  : null

if (update) {
  const grown = previous ? growth(tree, previous) : []
  if (grown.length > 0 && !force) {
    console.error(
      `${BASELINE_FILE} not written: the tree has more parser calls than the committed baseline — ` +
        'a regenerated baseline would accept them. Remove them instead, or pass --force and say why in the PR:\n' +
        formatVerdict({ ok: false, total: 0, violations: grown }),
    )
    process.exit(1)
  }
  writeFileSync(baselinePath, serializeBaseline(tree))
  const total = Object.values(tree).reduce((n, counts) => n + Object.values(counts).reduce((m, c) => m + c, 0), 0)
  console.log(`${BASELINE_FILE}: ${total} parser calls in Phase 2 code`)
  process.exit(0)
}

if (!previous) {
  console.error(`${BASELINE_FILE} is missing — run \`${REGENERATE_COMMAND}\` and commit it.`)
  process.exit(1)
}
const verdict = compareToBaseline(tree, previous)
if (verdict.ok) {
  console.log(`emit-parse ratchet: ok — ${verdict.total} parser calls in Phase 2 code, none above the baseline`)
  process.exit(0)
}
console.error(formatVerdict(verdict))
process.exit(1)
