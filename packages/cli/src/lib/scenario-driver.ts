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
import { join, dirname } from 'path'
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
 * True when a dynamic-import error is bun failing to resolve `@barefootjs/
 * client` from inside a transitive external @barefootjs package whose compiled
 * dist imports the client runtime directly (e.g. the cached `@barefootjs/xyflow`
 * or `@barefootjs/chart` npm builds). The import-rewriting pass only fixes
 * `@barefootjs/client/runtime` in *this* component's chunks, not inside external
 * bundles, so those fail at `import(file)` (#1849 B3).
 *
 * Two shapes reach here:
 *   - bare `@barefootjs/client` — our own chunks never import the package root
 *     (only `@barefootjs/client/runtime`, rewritten to an absolute path), so a
 *     bare-root failure is the external signature outright.
 *   - a subpath like `@barefootjs/client/runtime` — this only counts when the
 *     failing importer is a third-party bundle (bun cache / node_modules). Our
 *     chunks are rewritten and the "isn't built" guard fires before `import()`,
 *     so an external importer is the only way a subpath failure lands here
 *     (the `chart` component surfaces exactly this).
 */
export function isExternalClientImportError(message: string): boolean {
  const m = /Cannot find (?:module|package) ['"]@barefootjs\/client(\/[^'"]*)?['"](?:\s+from\s+['"]([^'"]+)['"])?/.exec(
    message,
  )
  if (!m) return false
  const [, subpath, importer] = m
  if (!subpath) return true
  return importer != null && /[\\/](?:\.bun[\\/]install[\\/]cache|node_modules)[\\/]/.test(importer)
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
  // hydrate(...) registration is present before mount.
  const clientChunks: string[] = []
  let rootClientJs = ''
  for (const s of sources) {
    const out = compileJSX(s.source, s.filePath, { adapter: testAdapter, profile: true })
    const js = out.files.find((f: { type: string }) => f.type === 'clientJs')?.content as string | undefined
    if (js) {
      clientChunks.push(js)
      rootClientJs = js
    }
  }
  if (clientChunks.length === 0) {
    throw new Error(
      'No client JS emitted — nothing reactive to profile. Use the static budget instead.',
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
    for (const m of chunk.matchAll(RUNTIME_IMPORT)) {
      for (const n of m[1].split(',')) {
        const t = n.trim()
        if (t) names.add(t)
      }
    }
  }
  const body = clientChunks
    .join('\n')
    .replace(RUNTIME_IMPORT, '')
    .replace(/^import\s+['"]@barefootjs\/client\/runtime['"];?\s*$/gm, '')
    .replace(/^import '\/\* @bf-child:\w+ \*\/'\n/gm, '')
  const rewritten = `import { ${[...names].join(', ')} } from ${JSON.stringify(runtimePath)}\n${body}`

  const dir = mkdtempSync(join(tmpdir(), 'bf-profile-'))
  const file = join(dir, 'component.mjs')
  writeFileSync(file, rewritten)

  try {
    try {
      await import(file)
    } catch (err) {
      // A transitive external @barefootjs package (e.g. the cached `@barefootjs/
      // xyflow` npm build) imports `@barefootjs/client` directly in its compiled
      // dist. The import-rewriting pass above only rewrites `@barefootjs/client/
      // runtime` in *this* component's chunks, not inside external bundles, so
      // bun fails to resolve `@barefootjs/client` from the package's cache dir.
      // Surface an actionable message instead of the raw module-resolution stack
      // (#1849 B3).
      if (isExternalClientImportError((err as Error).message)) {
        throw new Error(
          `"${mountName ?? 'component'}" depends on an external @barefootjs package whose ` +
            'compiled output imports `@barefootjs/client` directly — the dynamic scenario ' +
            "runner cannot resolve that from the package's cache directory. Profile it with a " +
            'pre-bundled `--scenario <story.tsx>`, or use the static budget ' +
            '(`bf debug profile <component>`), which needs no run.',
        )
      }
      throw err
    }
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
