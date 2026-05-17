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
import type { BarefootBuildManifest } from './app'

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
    const { manifest, base } = props
    const stubScripts = manifest && base
      ? collectStubDepScripts(manifest, base, outputSet, outputSet)
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
    const barefootScript = scripts.find(s => s.src.includes('barefoot.js'))
    const componentScripts = scripts.filter(s => !s.src.includes('barefoot.js'))
    const orderedScripts = barefootScript
      ? [barefootScript, ...componentScripts.reverse()]
      : componentScripts.reverse()
    // Stub-derived scripts come after the component scripts so they
    // load earliest in the document (existing scripts go through a
    // reversal that puts children first; stub deps are conceptually
    // "even deeper" — their registries must exist before any
    // imperative stub call fires).
    const finalScripts = [...orderedScripts, ...stubScripts.values()]

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
 * `.client.js`. Skips any name already present in `excluded` (these
 * have a script tag elsewhere). Mutates `excluded` to record every
 * dep that's been resolved so the caller can pass it to the next
 * SSR pass without double-emitting. Exported for tests.
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

  // Walk the stubDep graph starting from `roots`. `visited` guards
  // against cycles and double-enqueue; `excluded` is consulted only
  // when deciding whether to EMIT a script — a node already in
  // `excluded` has its script tag elsewhere, but we still walk its
  // own stubDeps so a transitively-deeper miss gets emitted here.
  const visited = new Set<string>()
  const queue: string[] = []
  for (const name of roots) {
    if (name === '__barefoot__') continue
    if (visited.has(name)) continue
    visited.add(name)
    queue.push(name)
  }

  while (queue.length > 0) {
    const name = queue.shift()!
    const entry = manifest[name]
    const deps = entry?.stubDeps
    if (!deps) continue
    for (const dep of deps) {
      if (visited.has(dep)) continue
      visited.add(dep)
      queue.push(dep)
      if (excluded.has(dep)) continue
      excluded.add(dep)
      const depEntry = manifest[dep]
      if (depEntry?.clientJs) {
        const src = prefix + relPathFromComponentsBase(depEntry.clientJs)
        result.set(dep, { src })
      }
    }
  }
  return result
}

function relPathFromComponentsBase(p: string): string {
  return p.startsWith('components/') ? p.slice('components/'.length) : p
}
