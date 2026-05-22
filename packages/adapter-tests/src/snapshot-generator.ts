/**
 * Shared-component fixture snapshot generator.
 *
 * Library-shaped wrapper around the snapshot pipeline both
 * `scripts/snapshot.ts` (interactive CLI) and
 * `scripts/generate-expected-html.ts` (auto-update workflow entry point)
 * call into, so the fixture-hydrate layer and the inline-expectedHtml
 * conformance corpus stay in sync from a single source of truth.
 */

import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { renderHonoComponent } from '@barefootjs/hono/test-render'
import { HonoAdapter } from '@barefootjs/hono/adapter'
import { compileJSX, combineParentChildClientJs } from '@barefootjs/jsx'
import {
  SHARED_COMPONENTS_DIR,
  SNAPSHOT_DIR,
  loadAllSharedSpecs,
  sharedFixtureInstanceId,
  sourceFileBasename,
  type SharedFixtureSpec,
} from '../fixtures/_helpers'

/**
 * Derive a stable 32-bit seed from a fixture id so each fixture's PRNG
 * state is a pure function of its own id — adding or reordering fixtures
 * never churns another fixture's frozen output (#1494). FNV-1a 32-bit.
 */
function seedFromId(id: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

/**
 * Temporarily swap `Math.random` for a seeded PRNG (mulberry32) while
 * `fn` runs, then restore. Scoped tightly around the SSR render so the
 * compiled-template `__scopeId = name + Math.random()...` fallback in
 * `HonoAdapter` produces byte-stable `bf-s` suffixes across regens —
 * otherwise every fixture regeneration that hits the random fallback
 * (loop children of `"use client"` roots) reshuffles those suffixes
 * and the snapshot file diffs even when nothing semantic changed (#1494).
 *
 * Restoration runs in `finally` so a throwing render does not leak the
 * stub into unrelated callers in the same process.
 */
async function withSeededMathRandom<T>(seed: number, fn: () => Promise<T>): Promise<T> {
  const originalRandom = Math.random
  let state = (seed >>> 0) || 1
  Math.random = () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  try {
    return await fn()
  } finally {
    Math.random = originalRandom
  }
}

async function compileClientJs(basename: string): Promise<string> {
  const sourcePath = resolve(SHARED_COMPONENTS_DIR, `${basename}.tsx`)
  const source = await Bun.file(sourcePath).text()
  const compiled = compileJSX(source, `${basename}.tsx`, { adapter: new HonoAdapter() })
  const file = compiled.files.find(f => f.type === 'clientJs')
  if (!file) {
    const errs = compiled.errors.map(e => `${e.severity}: ${e.message}`).join('\n')
    throw new Error(`No clientJs file in compileJSX output for ${basename}.tsx:\n${errs}`)
  }
  return file.content
}

export async function generateSharedComponentSnapshot(
  spec: SharedFixtureSpec,
): Promise<{ htmlBytes: number; clientJsBytes: number }> {
  const sourceBasename = sourceFileBasename(spec)
  const sourcePath = resolve(SHARED_COMPONENTS_DIR, `${sourceBasename}.tsx`)
  const source = await Bun.file(sourcePath).text()

  // Pin the root scope's `bf-s` via `__instanceId`. The shared id
  // helper keeps snapshot generation and adapter-conformance runs
  // aligned on the same `<ComponentName>_test` token, which both the
  // hydration walker and `normalizeHTML` know how to dispatch /
  // canonicalise.
  const ssrProps = { ...spec.props, __instanceId: sharedFixtureInstanceId(spec) }

  // SSR-side child injection. When the parent's template invokes child
  // components synchronously (no `/* @client */` deferral), the temp file
  // renderHonoComponent writes can't resolve their `./Child` imports — pass
  // each child's source through `components` so the helper inlines them.
  //
  // Key with the leading `./` so `renderHonoComponent`'s import-strip filter
  // (which does an exact-string match against the import path) matches the
  // `import Child from './Child'` line the compiled parent template emits.
  const components: Record<string, string> = {}
  for (const extra of spec.additionalComponents ?? []) {
    const extraSource = await Bun.file(
      resolve(SHARED_COMPONENTS_DIR, `${extra}.tsx`),
    ).text()
    components[`./${extra}.tsx`] = extraSource
  }

  const ssrHtml = await withSeededMathRandom(seedFromId(spec.id), () =>
    renderHonoComponent({
      source,
      adapter: new HonoAdapter(),
      props: ssrProps,
      // Pin the target export — `Object.keys(mod)` iterates alphabetically
      // for dynamically imported modules in Bun, so multi-component files
      // can otherwise render the wrong component.
      componentName: spec.componentName,
      components: Object.keys(components).length > 0 ? components : undefined,
    }),
  )

  let clientJs: string
  const extras = spec.additionalComponents ?? []
  if (extras.length === 0) {
    clientJs = await compileClientJs(sourceBasename)
  } else {
    // Use `combineParentChildClientJs` (same helper `bf build` uses) to
    // inline child component bundles into the parent and resolve the
    // `import '/* @bf-child:... */'` placeholders the compiler emits.
    // Raw concat would leave the placeholders intact and the browser
    // would 404 on `/* @bf-child:... */` URLs.
    const files = new Map<string, string>()
    files.set(sourceBasename, await compileClientJs(sourceBasename))
    for (const extra of extras) {
      files.set(extra, await compileClientJs(extra))
    }
    const combined = combineParentChildClientJs(files)
    clientJs = combined.get(sourceBasename) ?? files.get(sourceBasename)!
  }

  const htmlOut = resolve(SNAPSHOT_DIR, `${spec.id}.html`)
  const clientJsOut = resolve(SNAPSHOT_DIR, `${spec.id}.client.js`)
  writeFileSync(htmlOut, ssrHtml.trim() + '\n')
  writeFileSync(clientJsOut, clientJs.trimEnd() + '\n')

  return { htmlBytes: ssrHtml.length, clientJsBytes: clientJs.length }
}

export async function generateAllSharedComponentSnapshots(
  filter?: { ids?: ReadonlyArray<string> },
): Promise<{ generated: number; specs: SharedFixtureSpec[] }> {
  const all = await loadAllSharedSpecs()
  const requested = filter?.ids
  const selected = requested
    ? all.filter(s => requested.includes(s.id))
    : all

  if (requested && selected.length !== requested.length) {
    const knownIds = all.map(s => s.id).join(', ')
    const unknown = requested.filter(id => !all.some(s => s.id === id))
    throw new Error(
      `Unknown fixture id(s): ${unknown.join(', ')}. Known: ${knownIds}`,
    )
  }

  for (const spec of selected) {
    const { htmlBytes, clientJsBytes } = await generateSharedComponentSnapshot(spec)
    console.log(
      `[${spec.id}] wrote ${spec.id}.html (${htmlBytes}B) + ` +
        `${spec.id}.client.js (${clientJsBytes}B)`,
    )
  }

  return { generated: selected.length, specs: selected }
}
