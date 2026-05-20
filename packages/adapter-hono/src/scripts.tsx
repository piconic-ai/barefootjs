/**
 * BfScripts Component
 *
 * Renders collected script tags at the end of the document body.
 * BarefootJS components collect their script URLs during SSR render,
 * and this component outputs them all at once to avoid DOM traversal issues.
 *
 * Usage:
 * ```tsx
 * import { BfScripts } from '@barefoot/hono/scripts'
 *
 * <html>
 *   <body>
 *     {children}
 *     <BfScripts manifest={manifest} base="/static/components/" />
 *   </body>
 * </html>
 * ```
 *
 * Pass `manifest` + `base` to follow stub references emitted by the
 * 'use client' import rewriter (#1241). Without those props the
 * component falls back to the JSX-driven script set, which misses
 * components reached only through imperative `createComponent()`
 * stub calls — see issue #1243.
 */

/** @jsxImportSource hono/jsx */

import { useRequestContext } from 'hono/jsx-renderer'
import { Fragment } from 'hono/jsx'
import { relPathFromComponentsBase, type BarefootBuildManifest } from './app'

export type CollectedScript = {
  src: string
}

export interface BfScriptsProps {
  /**
   * Build manifest from `dist/components/manifest.json`. When supplied
   * alongside `base`, the component follows each rendered entry's
   * `stubDeps` transitively and emits a `<script>` for every reachable
   * `.client.js` — necessary for pages that only touch a child
   * component through an imperative stub call (issue #1243).
   *
   * When omitted, behavior matches the pre-#1243 collector: only
   * components whose SSR function executed get a script tag.
   */
  manifest?: BarefootBuildManifest
  /**
   * URL base where the component bundles are served (e.g.
   * `/static/components/`). Required when `manifest` is supplied —
   * stubDep entries store dist-relative paths and the component
   * needs the URL prefix to emit a working `<script src>`.
   */
  base?: string
  /**
   * Extra manifest keys to treat as walk roots in addition to the
   * SSR-rendered set. Use this for pages that mount a `'use client'`
   * component via an inline `<script type="module">import "X.client.js"; render(root, "X", …)`
   * instead of SSR'ing `<X />` directly. Without `entryRoots`, the
   * walker has no anchor for `X`'s `stubDeps` and any sibling `'use
   * client'` `.tsx` reached only through the imperative
   * `createComponent` stub rewrite (#1240) never ships as a
   * `<script>`, leaving the runtime registry empty and rendering
   * `[ComponentName]` placeholders.
   *
   * The caller's inline `<script type="module">import …</script>`
   * already loads the root bundle, so the root itself is *not*
   * emitted as a separate `<script src>` — only the transitively
   * reached `stubDeps` are. See #1431.
   */
  entryRoots?: string[]
}

/**
 * Renders all collected BarefootJS script tags.
 * Place this component at the end of your <body> element.
 *
 * After rendering, sets 'bfScriptsRendered' flag to true.
 * Components rendered after BfScripts (e.g., inside Suspense boundaries)
 * will check this flag and output their scripts inline instead of
 * collecting them here.
 */
export function BfScripts(props: BfScriptsProps = {}) {
  try {
    const c = useRequestContext()

    // Mark that BfScripts has been rendered.
    // Components rendered after this point (e.g., inside Suspense)
    // should output their scripts inline.
    c.set('bfScriptsRendered', true)

    const scripts: CollectedScript[] = c.get('bfCollectedScripts') || []
    const outputSet: Set<string> = c.get('bfOutputScripts') || new Set()
    const { manifest, base, entryRoots } = props
    // `entryRoots` extends both the walk-root set AND the `excluded` set.
    // Walk-root so the root's `stubDeps` get visited (the manually-mounted
    // component never SSR'd, so it isn't in `bfOutputScripts`). Excluded
    // so the root's own `.client.js` isn't re-emitted — the caller's
    // inline `<script type="module">import "X.client.js"; render(...)`
    // already loaded it. See #1431.
    const roots = entryRoots && entryRoots.length > 0
      ? new Set([...outputSet, ...entryRoots])
      : outputSet
    if (entryRoots) for (const r of entryRoots) outputSet.add(r)
    const stubScripts = manifest && base
      ? collectStubDepScripts(manifest, base, roots, outputSet)
      : new Map<string, CollectedScript>()
    // Record stub-derived names on the same context flag so any later
    // SSR pass (e.g. a Suspense boundary that renders after this point)
    // won't double-emit the same `.client.js`. The flag's name keeps
    // it symmetric with the snippet in `addScriptCollection`.
    if (stubScripts.size > 0) c.set('bfOutputScripts', outputSet)

    // Reverse script order so child components load before parents.
    // During SSR, parent components render first and collect their scripts,
    // then child components add their scripts. But for hydration, children
    // need to register their templates before parents try to use createComponent().
    // barefoot.js must stay first since it provides the runtime.
    //
    // Stub-derived scripts must come BEFORE the component scripts in the
    // emitted order — `<script type="module">` tags evaluate in document
    // order with microtask checkpoints between them, so a parent's
    // `hydrate()`-scheduled walk fires (and its `init` calls
    // `createComponent(...)` against the stub) before any later module
    // script has registered. Within stubScripts, `collectStubDepScripts`
    // already returns DFS post-order (deps before their dependent), so
    // a chain A→B→C ships C, B, then the component bundle that stubs A.
    const barefootScript = scripts.find(s => s.src.includes('barefoot.js'))
    const componentScripts = scripts.filter(s => !s.src.includes('barefoot.js'))
    const finalScripts = [
      ...(barefootScript ? [barefootScript] : []),
      ...stubScripts.values(),
      ...componentScripts.reverse(),
    ]

    return (
      <Fragment>
        {finalScripts.map(({ src }) => (
          <script type="module" src={src} />
        ))}
      </Fragment>
    )
  } catch {
    // Context unavailable (e.g., not using jsxRenderer)
    return null
  }
}

/**
 * Walk stub-rewrite edges from each manifest entry in `roots`,
 * returning the script URLs for every transitively reachable
 * `.client.js` in **DFS post-order** — every dep precedes its
 * dependent in iteration order. Skips any name already present in
 * `excluded` (these have a script tag elsewhere). Mutates `excluded`
 * to record every dep that's been resolved so the caller can pass
 * it to the next SSR pass without double-emitting. Exported for tests.
 *
 * Typical call shape: `roots` ⊆ `excluded`. The caller passes the
 * set of components whose SSR function already pushed a `<script>`
 * (`bfOutputScripts`) as BOTH arguments — "these are already
 * emitted, now walk their stubDeps." A `roots` value already in
 * `excluded` is still walked (we need its `stubDeps`); a `dep`
 * already in `excluded` is recorded as visited but not re-emitted.
 *
 * Why post-order: `<script type="module">` tags evaluate in document
 * order with microtask checkpoints between them, so the first
 * script's `hydrate()`-scheduled walk fires before any later
 * module loads. A chain A→B→C must ship C, B, then A's bundle —
 * BFS order (B, C) would let B's hydration call
 * `createComponent('C', ...)` against an empty registry. Post-order
 * also handles DAG edges like A→B, A→C, C→B correctly
 * (deepest-first, dependencies-first).
 *
 * Cycle-safe: a visited set short-circuits any A → B → A loop.
 */
export function collectStubDepScripts(
  manifest: BarefootBuildManifest,
  base: string,
  roots: Iterable<string>,
  excluded: Set<string>,
): Map<string, CollectedScript> {
  const result = new Map<string, CollectedScript>()
  const prefix = base.endsWith('/') ? base : base + '/'
  const visited = new Set<string>()

  function visit(name: string): void {
    if (name === '__barefoot__') return
    if (visited.has(name)) return
    visited.add(name)
    const entry = manifest[name]
    if (entry?.stubDeps) {
      // Recurse FIRST so deps are emitted before this node — that's
      // what produces post-order. Cycles short-circuit at the
      // `visited.has(name)` check at the top of each call.
      for (const dep of entry.stubDeps) visit(dep)
    }
    if (excluded.has(name)) return
    excluded.add(name)
    if (entry?.clientJs) {
      const src = prefix + relPathFromComponentsBase(entry.clientJs)
      result.set(name, { src })
    }
  }

  for (const name of roots) visit(name)
  return result
}
