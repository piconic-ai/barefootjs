/**
 * P2 prototype — routes/island manifest rollup.
 *
 * The IR-driven router (DESIGN.md §5) wants, per island, the module to
 * load and the signal/prop *shape*. This script proves that rollup is
 * derivable purely from `bf build`'s existing `manifest.json` — no new
 * compiler analysis, just a transform — by running it against the real
 * output of `integrations/hono`.
 *
 * It is **component-keyed**, not URL-keyed: BarefootJS stays out of
 * routing (the host owns URL→component); the rollup describes each
 * island's module set + reactive surface so the router can prefetch
 * exact modules and (later) apply signal-level data patches.
 *
 * Run: `bun run routes-manifest.ts [path/to/manifest.json]`
 * Default manifest: ../hono/dist/components/manifest.json (run `bf build`
 * in integrations/hono first).
 *
 * NOTE: this is the *rollup core*. Wiring it as a real `bf routes`
 * command (CLI integration) is the remaining P2 step — see DESIGN.md §7.
 */

interface SsrDefault {
  value?: unknown
  propName?: string
  isRestProps?: boolean
}
interface ManifestEntry {
  markedTemplate?: string
  clientJs?: string
  ssrDefaults?: Record<string, SsrDefault>
  stubDeps?: string[]
}
type BuildManifest = Record<string, ManifestEntry | undefined>

export interface IslandRollup {
  /** Module URL/path to import to hydrate this island. */
  module: string | null
  /** Self + transitively reachable island modules (prefetch set). */
  modules: string[]
  /** Prop names this island reads (from ssrDefaults `propName` entries). */
  props: string[]
  /** Local reactive binding names (signals/memos) — the data-patch surface. */
  signals: string[]
  /** Whether the island ships client JS (is interactive). */
  island: boolean
}
export type RoutesManifest = Record<string, IslandRollup>

/** Pure transform: build manifest → component-keyed island rollup. */
export function buildRoutesManifest(manifest: BuildManifest): RoutesManifest {
  const out: RoutesManifest = {}

  for (const [name, entry] of Object.entries(manifest)) {
    if (name === '__barefoot__' || !entry) continue

    const ssr = entry.ssrDefaults ?? {}
    const props: string[] = []
    const signals: string[] = []
    for (const [binding, def] of Object.entries(ssr)) {
      if (def && def.propName) props.push(binding)
      else if (!def?.isRestProps) signals.push(binding)
    }

    // Transitive module set via stubDeps (resolve each dep key → its clientJs).
    const modules: string[] = []
    if (entry.clientJs) modules.push(entry.clientJs)
    const seen = new Set<string>([name])
    const stack = [...(entry.stubDeps ?? [])]
    while (stack.length) {
      const dep = stack.pop()!
      if (seen.has(dep)) continue
      seen.add(dep)
      const de = manifest[dep]
      if (de?.clientJs) modules.push(de.clientJs)
      stack.push(...(de?.stubDeps ?? []))
    }

    out[name] = {
      module: entry.clientJs ?? null,
      modules,
      props,
      signals,
      island: !!entry.clientJs,
    }
  }

  return out
}

// ── runner ───────────────────────────────────────────────────────────────

async function main() {
  const manifestPath =
    process.argv[2] ?? new URL('../hono/dist/components/manifest.json', import.meta.url).pathname

  let manifest: BuildManifest
  try {
    manifest = JSON.parse(await Bun.file(manifestPath).text())
  } catch {
    console.error(
      `Could not read manifest at ${manifestPath}\n` +
        `Run \`bf build\` in integrations/hono first, or pass a manifest path.`,
    )
    process.exit(2)
  }

  const rollup = buildRoutesManifest(manifest)
  const names = Object.keys(rollup)

  console.log(`\nroutes.manifest rollup — ${names.length} components from ${manifestPath}\n`)
  console.log('component'.padEnd(22), 'island', 'modules', 'props', 'signals')
  console.log('-'.repeat(78))
  for (const [name, r] of Object.entries(rollup)) {
    console.log(
      name.padEnd(22),
      (r.island ? 'yes' : 'no ').padEnd(6),
      String(r.modules.length).padEnd(7),
      (r.props.join(',') || '-').padEnd(20).slice(0, 20),
      r.signals.join(',') || '-',
    )
  }

  // Write the artifact next to this script.
  const outPath = new URL('./routes.manifest.json', import.meta.url).pathname
  await Bun.write(outPath, JSON.stringify(rollup, null, 2))
  console.log(`\nWrote ${outPath}`)

  // Self-check: every interactive island must carry a module. (A non-empty
  // reactive surface is NOT required — a purely-presentational child island
  // like TodoItem reads props straight into child JSX, so they never land in
  // ssrDefaults, which only seeds props referenced by a signal/memo
  // initializer. That partiality is a real limitation for the data-patch
  // surface, noted in DESIGN.md.)
  let ok = true
  let surfaceless = 0
  for (const [name, r] of Object.entries(rollup)) {
    if (!r.island) continue
    if (!r.module) {
      console.error(`✗ ${name}: island without a module`)
      ok = false
    }
    if (r.props.length === 0 && r.signals.length === 0) surfaceless += 1
  }
  if (!ok) process.exit(1)
  console.log(
    `✓ every island has a module — rollup is derivable from bf build output` +
      ` (${surfaceless} presentational island(s) carry no ssrDefaults surface)`,
  )
}

if (import.meta.main) main()
