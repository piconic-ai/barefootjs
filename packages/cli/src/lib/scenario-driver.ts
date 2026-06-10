// Scenario driver for `bf debug profile --scenario` (#1690, SR2/SR7).
//
// Drives a component's *instrumented* build through a real DOM and records the
// reactive event stream the analyses consume. The "auto" scenario mounts the
// component and fires every interactive element once — a zero-config profile
// that needs no scenario file, so a component can be profiled the moment it has
// a handler.
//
// happy-dom + the client runtime are imported lazily, so the static modes
// (`bf debug profile <component>` / `--diff`) carry no DOM dependency.

import { writeFileSync, mkdtempSync, rmSync, readFileSync, existsSync, statSync } from 'fs'
import { join, dirname, resolve } from 'path'
import { tmpdir } from 'os'
import type { ProfilerEvent } from '@barefootjs/shared'

/** One compiled source in the scenario (a story file or one of its imports). */
export interface SourceFile {
  source: string
  filePath: string
}

export interface ScenarioResult {
  events: ProfilerEvent[]
  /** Tag of the mounted root element. */
  rootTag: string
  /** Interactive elements the auto scenario fired. */
  fired: number
  /**
   * Every source compiled for this run (story + its local imports). The report
   * builds a merged id index over these so events from composed sub-components
   * resolve.
   */
  sources: SourceFile[]
}

/**
 * The compiled client JS of an external published `@barefootjs/*` runtime
 * package the auto runner can't profile (e.g. `@barefootjs/chart`,
 * `@barefootjs/xyflow`), or null when there is none.
 *
 * Such a package ships a prebuilt dist that imports `@barefootjs/client`
 * directly. The driver's import-rewriting pass only fixes *this* component's own
 * `@barefootjs/client/runtime` imports, not the ones buried in an external
 * bundle, so a dynamic run can't resolve the client runtime from the package's
 * cache directory and bun throws an opaque module-resolution stack (#1849 B3).
 *
 * We detect the condition *before* the run, from our own deterministic compiler
 * output: any `@barefootjs/*` import the compiler leaves in the emitted client JS
 * other than the handled `@barefootjs/client[/...]` and `@barefootjs/jsx[/...]`
 * families is an un-rewritable external runtime package. Reading the import graph
 * we generate — rather than classifying bun's resolution *error message* — keeps
 * this stable across bun versions and importer-path formatting, which the old
 * message-matching heuristic was fragile to.
 *
 * `@barefootjs/client[/...]` is excluded because `/runtime` is rewritten to an
 * absolute path before the run and the package root is never emitted; `@barefootjs/
 * jsx[/...]` because it is a compile-time-only dependency the compiler transforms
 * away (it never reaches the runtime import).
 *
 * Both import forms the compiler can emit are matched: a named/default `import …
 * from '<pkg>'` and a bare side-effect `import '<pkg>'` (see
 * `collectExternalImports` in `@barefootjs/jsx`), so a side-effect-only external
 * import can't slip past pre-flight detection.
 */
export function externalRuntimeImport(clientJs: string | string[]): string | null {
  const chunks = Array.isArray(clientJs) ? clientJs : [clientJs]
  for (const chunk of chunks) {
    for (const m of chunk.matchAll(/import\s+(?:[^'"\n]*from\s*)?['"](@barefootjs\/[^'"]+)['"]/g)) {
      const spec = m[1]
      if (spec === '@barefootjs/client' || spec.startsWith('@barefootjs/client/')) continue
      if (spec === '@barefootjs/jsx' || spec.startsWith('@barefootjs/jsx/')) continue
      return spec
    }
  }
  return null
}

/** Component names the compiled client JS registers, in emission order. */
function registeredNames(clientJs: string): string[] {
  const names: string[] = []
  for (const m of clientJs.matchAll(/hydrate\(\s*['"]([A-Za-z_]\w*)['"]/g)) names.push(m[1])
  return names
}

/**
 * Pick which registered component to mount. Prefer the requested name (exact,
 * then case-insensitive — `collapsible` → `Collapsible`); otherwise the first
 * registered component (the file's primary export).
 */
function pickMountName(requested: string | undefined, registered: string[]): string | undefined {
  if (registered.length === 0) return undefined
  if (requested) {
    const exact = registered.find(n => n === requested)
    if (exact) return exact
    const ci = registered.find(n => n.toLowerCase() === requested.toLowerCase())
    if (ci) return ci
  }
  return registered[0]
}

/** A handler the IR knows about: which slot it's on and which event fires it. */
interface HandlerSlot {
  slotId: string
  eventName: string
}

/** Build a bubbling DOM event of the right class for `eventName`. */
function makeEvent(eventName: string): Event {
  if (/^(click|dblclick|mouse|pointer|contextmenu)/.test(eventName)) {
    return new window.MouseEvent(eventName, { bubbles: true, cancelable: true })
  }
  if (/^key/.test(eventName)) {
    return new window.KeyboardEvent(eventName, { bubbles: true, cancelable: true })
  }
  return new window.Event(eventName, { bubbles: true, cancelable: true })
}

/**
 * Fire every handler the IR knows about (`graph.domBindings` of type `event`)
 * on its `[bf="<slotId>"]` element(s) — including list items (delegated) and
 * branch handlers — so coverage reflects real interactions, not just buttons.
 * Falls back to clicking buttons/links when no handler slots resolve.
 */
function fireHandlers(root: HTMLElement, handlers: HandlerSlot[]): number {
  let fired = 0
  const seen = new Set<HTMLElement>()
  for (const h of handlers) {
    const targets: HTMLElement[] = []
    if (root.matches(`[bf="${h.slotId}"]`)) targets.push(root)
    for (const el of Array.from(root.querySelectorAll<HTMLElement>(`[bf="${h.slotId}"]`))) targets.push(el)
    for (const el of targets) {
      el.dispatchEvent(makeEvent(h.eventName))
      seen.add(el)
      fired++
    }
  }
  if (fired === 0) {
    // No IR-resolved targets in the live DOM (e.g. wrapper component) — fall
    // back to the generic clickable sweep.
    const SELECTOR = 'button, a, [role="button"], [onclick]'
    const set = new Set<HTMLElement>()
    if (root.matches(SELECTOR)) set.add(root)
    for (const el of Array.from(root.querySelectorAll<HTMLElement>(SELECTOR))) set.add(el)
    for (const el of (set.size > 0 ? [...set] : [root])) {
      el.dispatchEvent(makeEvent('click'))
      fired++
    }
  }
  return fired
}

/** Resolve a relative import specifier to a `.tsx`/`.ts`/`index` file, or null. */
function resolveLocalFile(spec: string): string | null {
  for (const cand of [spec, `${spec}.tsx`, `${spec}.ts`, join(spec, 'index.tsx'), join(spec, 'index.ts')]) {
    if (existsSync(cand) && statSync(cand).isFile()) return cand
  }
  return null
}

/**
 * Rewrite the relative imports a compiled chunk still carries before it is
 * written to the temp file (#1873). The compiler preserves imports of plain
 * (non-component) local modules verbatim — `import { x } from '../lib/helper'`
 * — and those specifiers would otherwise resolve against the temp directory
 * and fail with a raw "Cannot find module".
 *
 * - An import of a file whose compiled client JS is already concatenated into
 *   this run is dropped: chunks share one module scope, so its declarations
 *   are already visible (this covers the `./x.client.js` rewrites of
 *   cross-file signal imports too).
 * - An import of a plain local module is rewritten to the absolute path of
 *   the original source file, which bun imports directly (`.ts` included).
 * - An unresolvable specifier throws an actionable error instead of letting
 *   the run die in bun's module resolver.
 */
function rewriteLocalImports(js: string, chunkPath: string, inlined: Set<string>): string {
  const chunkDir = dirname(chunkPath)
  return js.replace(
    /^(import\s+(?:[^'"\n]*from\s*)?)['"](\.[^'"]+)['"];?\s*$/gm,
    (_line, head: string, spec: string) => {
      // A `.client.js` specifier is the compiled output of a sibling client
      // file — resolve it through that file's source.
      const resolved = resolveLocalFile(join(chunkDir, spec.replace(/\.client\.js$/, '')))
      if (!resolved) {
        throw new Error(
          `"${spec}" (imported by ${chunkPath}) does not resolve to a local file, so the ` +
            'dynamic scenario runner cannot load it. Check the import path, or use the ' +
            'static budget (`bf debug profile <component>`), which needs no run.',
        )
      }
      const abs = resolve(resolved)
      return inlined.has(abs) ? '' : `${head}${JSON.stringify(abs)}`
    },
  )
}

/**
 * Walk a file's transitive local (relative) imports into a flat,
 * dependency-first source list — so a component (or story) that composes
 * separately-registered children (`<Collapsible><CollapsibleTrigger/>…`)
 * brings every piece it needs: each child registers via `hydrate(...)` before
 * the root mounts, and its handlers enter the discovery set.
 *
 * `seedSource` lets the caller supply already-read content for the entry file
 * (the `bf debug profile <component>` path reads it before resolving), avoiding
 * a redundant disk read and honouring any in-memory override.
 */
function loadWithLocalImports(entryPath: string, seedSource?: string): SourceFile[] {
  const out: SourceFile[] = []
  const visited = new Set<string>()
  const visitImport = (p: string): void => {
    const resolved = resolveLocalFile(p)
    if (!resolved || visited.has(resolved)) return
    visited.add(resolved)
    const source = readFileSync(resolved, 'utf-8')
    for (const m of source.matchAll(/from\s+['"](\.[^'"]+)['"]/g)) {
      visitImport(join(dirname(resolved), m[1]))
    }
    out.push({ source, filePath: resolved })
  }
  // Resolve the entry on disk. With no seed AND no on-disk file there is
  // nothing to load — return empty so `runFileScenario` still surfaces its
  // specific "Cannot read scenario file" error for a missing story path
  // (the auto path always supplies `seedSource`, so it is unaffected).
  const entryResolved = resolveLocalFile(entryPath)
  if (seedSource === undefined && !entryResolved) return out
  // The entry is included from its seed (or disk). Its `filePath` may be
  // synthetic (in-memory tests, stdin) and need not exist on disk. Resolve its
  // local imports against the *resolved* file's directory (so a directory spec
  // that maps to `…/index.tsx` resolves siblings correctly), falling back to the
  // entry spec's dir when synthetic; missing imports are skipped so a
  // partial/standalone component still profiles.
  if (entryResolved) visited.add(entryResolved)
  const entrySource = seedSource ?? readFileSync(entryResolved!, 'utf-8')
  const entryDir = dirname(entryResolved ?? entryPath)
  for (const m of entrySource.matchAll(/from\s+['"](\.[^'"]+)['"]/g)) {
    visitImport(join(entryDir, m[1]))
  }
  out.push({ source: entrySource, filePath: entryResolved ?? entryPath })
  return out
}

/**
 * Load a scenario "story" file and its local imports (see
 * `loadWithLocalImports`).
 */
function loadStory(storyPath: string): SourceFile[] {
  return loadWithLocalImports(storyPath)
}

/**
 * Mount a set of compiled sources in happy-dom, fire every IR-known handler,
 * and record the event stream (SR2). The last source's primary component is the
 * mount root (the others register so composition resolves). Shared by the
 * `auto` and scenario-file modes.
 */
async function runScenario(sources: SourceFile[], mountName?: string): Promise<ScenarioResult> {
  const { GlobalRegistrator } = await import('@happy-dom/global-registrator')
  if (typeof (globalThis as { window?: unknown }).window === 'undefined') {
    GlobalRegistrator.register()
  }

  const jsx = await import('@barefootjs/jsx')
  const { compileJSX, testAdapter } = jsx

  // Compile each source in profile mode; concatenate (deps first) so every
  // hydrate(...) registration is present before mount. Track which source
  // files produced a chunk so `rewriteLocalImports` can tell an
  // already-inlined client file from a plain helper module.
  const clientChunks: { js: string; filePath: string }[] = []
  const inlined = new Set<string>()
  let rootClientJs = ''
  for (const s of sources) {
    const out = compileJSX(s.source, s.filePath, { adapter: testAdapter, profile: true })
    const js = out.files.find((f: { type: string }) => f.type === 'clientJs')?.content as string | undefined
    if (js) {
      clientChunks.push({ js, filePath: s.filePath })
      inlined.add(resolve(s.filePath))
      rootClientJs = js
    }
  }
  if (clientChunks.length === 0) {
    throw new Error(
      'No client JS emitted — nothing reactive to profile. Use the static budget instead.',
    )
  }

  // Bail out before the run if any chunk still imports an external published
  // `@barefootjs/*` runtime package: its prebuilt dist imports `@barefootjs/
  // client` directly and the import-rewriting pass below can't reach inside it,
  // so the dynamic run would fail with an opaque module-resolution stack from
  // the package's cache directory. Surface an actionable message instead, named
  // for the actual package (#1849 B3).
  const external = externalRuntimeImport(clientChunks.map(c => c.js))
  if (external) {
    throw new Error(
      `"${mountName ?? 'component'}" imports the external package ${external}, whose compiled ` +
        'output imports `@barefootjs/client` directly — the dynamic scenario runner cannot ' +
        "resolve that from the package's cache directory. Profile it with a pre-bundled " +
        '`--scenario <story.tsx>`, or use the static budget (`bf debug profile <component>`), ' +
        'which needs no run.',
    )
  }

  // Merge handler slots from every component in every source (a file may hold
  // several, e.g. a headless set) so all interactions fire.
  const handlers: HandlerSlot[] = []
  for (const s of sources) {
    let names: string[] = []
    try {
      names = jsx.listComponentFunctions(s.source, s.filePath)
    } catch {
      names = []
    }
    for (const name of names.length > 0 ? names : [undefined]) {
      try {
        const { graph } = jsx.buildComponentAnalysis(s.source, s.filePath, name)
        for (const b of graph.domBindings) {
          if (b.type === 'event') {
            handlers.push({ slotId: b.slotId, eventName: b.label.match(/^(\w+)\s+handler/)?.[1] ?? 'click' })
          }
        }
      } catch {
        /* skip a component the analyzer can't read */
      }
    }
  }

  // The dynamic profiler imports the real client runtime. In-tree, that package
  // resolves to its built `dist/` (unlike `@barefootjs/jsx`, which exports src),
  // so a fresh checkout that ran `bun install` but not `bun run build` fails here
  // with an opaque "Cannot find module" — turn it into an actionable message.
  let runtimePath: string
  try {
    runtimePath = import.meta.resolve('@barefootjs/client/runtime')
  } catch {
    throw new Error(
      "The client runtime (@barefootjs/client/runtime) isn't built — the dynamic " +
        'profiler needs it. Build the client package first (e.g. `bun run build`, or ' +
        '`bun run --filter @barefootjs/client build`), then re-run with --scenario. ' +
        'The static budget (`bf debug profile <component>`) needs no build.',
    )
  }
  // Concatenating multiple compiled chunks duplicates their runtime imports
  // (`import { createComponent, hydrate, … }`). Collect the union of imported
  // names, strip every per-chunk runtime import, and prepend a single one.
  const RUNTIME_IMPORT = /^import\s*\{([^}]*)\}\s*from\s*['"]@barefootjs\/client\/runtime['"];?\s*$/gm
  const names = new Set<string>()
  for (const chunk of clientChunks) {
    for (const m of chunk.js.matchAll(RUNTIME_IMPORT)) {
      for (const n of m[1].split(',')) {
        const t = n.trim()
        if (t) names.add(t)
      }
    }
  }
  const body = clientChunks
    .map(c => rewriteLocalImports(c.js, c.filePath, inlined))
    .join('\n')
    .replace(RUNTIME_IMPORT, '')
    .replace(/^import\s+['"]@barefootjs\/client\/runtime['"];?\s*$/gm, '')
    .replace(/^import '\/\* @bf-child:\w+ \*\/'\n/gm, '')
  const rewritten = `import { ${[...names].join(', ')} } from ${JSON.stringify(runtimePath)}\n${body}`

  const dir = mkdtempSync(join(tmpdir(), 'bf-profile-'))
  const file = join(dir, 'component.mjs')
  writeFileSync(file, rewritten)

  try {
    // External-package imports are caught pre-flight (see `externalRuntimeImport`
    // above), so a failure here is a genuine run error worth surfacing as-is.
    await import(file)
    const rt = (await import(runtimePath)) as {
      createRecordingSink: () => { sink: unknown; events: ProfilerEvent[] }
      setProfilerSink: (s: unknown) => void
      createComponent: (name: string, props: Record<string, unknown>) => HTMLElement
    }

    const name = pickMountName(mountName, registeredNames(rootClientJs))
    if (!name) throw new Error('Could not determine the component name to mount (none registered).')

    const rec = rt.createRecordingSink()
    rt.setProfilerSink(rec.sink)
    try {
      let el: HTMLElement
      try {
        el = rt.createComponent(name, {})
        document.body.appendChild(el)
      } catch (err) {
        // A bare mount of a component that depends on a context provider (or
        // other composition) throws while its init runs. Turn that into an
        // actionable message instead of a raw stack.
        throw new Error(
          `Mounting "${name}" standalone failed: ${(err as Error).message}. ` +
            'It likely needs a context provider or composition — profile it with ' +
            '`--scenario <story.tsx>` that renders it the way it is used.',
        )
      }
      const fired = fireHandlers(el, handlers)
      return { events: rec.events, rootTag: el.tagName.toLowerCase(), fired, sources }
    } finally {
      rt.setProfilerSink(null)
    }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

/**
 * Auto scenario: compile one component in profile mode, mount it, and fire its
 * handlers. Zero-config — no scenario file needed.
 */
export async function runAutoScenario(
  source: string,
  filePath: string,
  componentName?: string,
): Promise<ScenarioResult> {
  // Pull in the target's local child-component imports (#1796): a compound
  // component (`<Collapsible><CollapsibleTrigger/>…`) keeps its toggle handler
  // in a separately-registered child. Without the child's source compiled, the
  // child never registers, the mount can't wire it, and handler discovery reads
  // 0/0 even though the composition has handlers. Loading the import graph
  // (dependency-first, root last) registers every child and surfaces their
  // handlers — matching what `--scenario <story.tsx>` does, with no story file.
  const sources = loadWithLocalImports(filePath, source)
  return runScenario(sources, componentName)
}

/**
 * Scenario-file mode: `<file>` is a story `.tsx` that composes the target
 * (importing it + its sub-components). The driver compiles the story and every
 * local import, mounts the story, and fires all handlers — so headless/compound
 * components (whose handlers live in user-composed children) get exercised.
 */
export async function runFileScenario(storyPath: string): Promise<ScenarioResult> {
  const sources = loadStory(storyPath)
  if (sources.length === 0) throw new Error(`Cannot read scenario file: ${storyPath}`)
  return runScenario(sources)
}
