/**
 * BarefootJS - Hydration
 *
 * Combined component registration + template registration + hydration.
 * Single entry point for compiler-generated code.
 *
 * Design (post #1172):
 *
 *   1. `hydrate(name, def)` only **registers** the def + template +
 *      component-registry entry, then schedules a walk.
 *   2. The walk visits every scope in **true document order** — both
 *      `[bf-s]` element scopes and `<!--bf-scope:Name_xxx-->` comment
 *      scopes are interleaved by their actual DOM position. Parents
 *      always init before descendants regardless of which kind of
 *      scope each one is, so a comment-rooted parent that calls
 *      `provideContext()` is visible to an element-rooted descendant
 *      that calls `useContext()` on the very first hydrate pass.
 *   3. Two scheduling phases, each capped to one in-flight callback:
 *        - microtask: collapses every `hydrate()` call from the
 *          bundled module body into a single walk on the next tick.
 *        - rAF: catches scope elements that the streaming protocol
 *          (Hono / `__bf_swap`) injects into the document *after*
 *          the synchronous module body has finished.
 *   4. `rehydrateAll()` and the comment-scope path both share this
 *      walker, so streaming swaps and comment-rooted fragments enjoy
 *      the same ordering guarantee.
 *
 * Same-name nesting (`<Counter>` inside `<Counter>`):
 *   The walker's `hydratedScopes.has(el)` check is the *only* skip
 *   guard. Parents that intentionally own their nested same-name
 *   children call `initChild(...)` from their init body — initChild
 *   marks the child scope as hydrated, so when the walker reaches it
 *   later it short-circuits. Parents that *don't* call `initChild`
 *   (the descendant is a coincidental same-name component, not a
 *   structural child) get the descendant hydrated by the walker as a
 *   normal top-level component. This makes nesting depth a non-issue
 *   — the previous ancestor-walk guard is gone.
 */

import { setCurrentScope } from './context'
import { commentScopeRegistry } from './scope'
import { hydratedScopes } from './hydration-state'
import { registerComponent } from './registry'
import { registerTemplate } from './template'
import { BF_SCOPE, BF_PROPS, BF_CHILD_PREFIX, BF_SCOPE_COMMENT_PREFIX } from '@barefootjs/shared'
import type { ComponentDef } from './types'

/**
 * Registry of all hydrated component definitions.
 * Used by the walker to look up an element's init/def by name, and by
 * rehydrateAll() to re-scan the DOM after streaming chunks arrive.
 */
const registeredDefs = new Map<string, ComponentDef>()

let microtaskScheduled = false
let rafScheduled = false

/**
 * Cross-runtime microtask scheduler. `queueMicrotask` is widely
 * supported but absent in some test DOMs / older runtimes; fall back
 * to `Promise.resolve().then(...)` so importing this module never
 * throws on environments missing the global.
 */
const scheduleMicrotask: (cb: () => void) => void =
  typeof queueMicrotask === 'function'
    ? queueMicrotask
    : (cb) => {
        Promise.resolve().then(cb)
      }

/**
 * Schedule the document-order walk once per tick (microtask) and once
 * per frame (rAF). Both flags are cleared inside their respective
 * callbacks, so a flood of `hydrate()` / `rehydrateAll()` calls can
 * never queue more than two pending walks in total.
 */
function scheduleWalk(): void {
  if (!microtaskScheduled) {
    microtaskScheduled = true
    scheduleMicrotask(() => {
      microtaskScheduled = false
      walkAllInDocumentOrder()
    })
  }
  if (!rafScheduled && typeof requestAnimationFrame === 'function') {
    rafScheduled = true
    requestAnimationFrame(() => {
      rafScheduled = false
      walkAllInDocumentOrder()
    })
  }
}

/**
 * Register a component and schedule a document-order hydration walk.
 * Combines registration + template setup + hydration in a single call.
 *
 * @param name - Component name
 * @param def - Component definition (init function + optional template + comment flag)
 */
export function hydrate(name: string, def: ComponentDef): void {
  // Ensure name is always set on the def so createComponentFromDef()
  // doesn't rely on def.init.name (which may be lost under minification).
  def.name = name

  registeredDefs.set(name, def)

  // Register component for parent-child communication
  registerComponent(name, def.init)

  // Register template for client-side component creation
  if (def.template) {
    registerTemplate(name, def.template)
  }

  scheduleWalk()
}

/**
 * Re-hydrate all registered components.
 *
 * Called by the streaming resolver after swapping fallback content with
 * resolved content. Goes through the same scheduler as `hydrate()` so
 * back-to-back `__bf_swap` invocations or interleaved `hydrate()` calls
 * collapse to a single walk per tick + per frame.
 */
export function rehydrateAll(): void {
  scheduleWalk()
}

/**
 * Single document-order walk that visits both element scopes
 * (`[bf-s]`) and comment scopes (`<!--bf-scope:Name_xxx-->`)
 * interleaved by their actual DOM position. Parent inits — whichever
 * shape they take — always run before descendant inits, so a comment-
 * scope provider is visible to an element-scope descendant on the
 * first pass.
 *
 * Per node:
 *   - **Element scope**: skip if already hydrated or if `~`-prefixed
 *     (child component owned by parent's `initChild`). Otherwise mark
 *     as hydrated *before* running init — taking the slot prevents
 *     re-entrant `hydrate()` / `rehydrateAll()` calls from the init
 *     body (or from a synchronous effect they trigger) from racing
 *     into the same scope on the next scheduled walk.
 *   - **Comment scope**: skip if already initialised (per-comment
 *     `__bfInitialized` flag) or `~`-prefixed. Otherwise mark, set
 *     up the proxy element registry, then run init.
 *
 * If a scope's def hasn't registered yet the node is left untouched
 * for the next walk; nothing is mutated.
 */
function walkAllInDocumentOrder(): void {
  if (typeof document === 'undefined') return

  const walker = document.createTreeWalker(
    document,
    NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_COMMENT,
  )

  while (walker.nextNode()) {
    const node = walker.currentNode
    if (node.nodeType === Node.ELEMENT_NODE) {
      hydrateElementScope(node as Element)
    } else if (node.nodeType === Node.COMMENT_NODE) {
      hydrateCommentScope(node as Comment)
    }
  }
}

function hydrateElementScope(el: Element): void {
  if (hydratedScopes.has(el)) return

  const bfs = el.getAttribute(BF_SCOPE)
  if (!bfs) return
  if (bfs.startsWith(BF_CHILD_PREFIX)) return

  const underscoreIdx = bfs.indexOf('_')
  if (underscoreIdx < 0) return
  const name = bfs.slice(0, underscoreIdx)

  const def = registeredDefs.get(name)
  if (!def) return
  // Comment-based components hydrate via the comment-scope path; their
  // bf-s attribute (when present) sits on a proxy element that we'd
  // otherwise double-init. Mark it hydrated so future walks skip the
  // scope lookup entirely instead of re-resolving the same def.
  if (def.comment) {
    hydratedScopes.add(el)
    return
  }

  // Mark BEFORE running init: if the init body synchronously triggers
  // another scheduled walk (e.g. an effect calls `rehydrateAll()`),
  // the WeakSet entry already exists when that walk arrives, so we
  // never re-enter the same scope.
  hydratedScopes.add(el)

  const propsJson = el.getAttribute(BF_PROPS)
  let props: Record<string, unknown> = {}
  if (propsJson) {
    try {
      props = JSON.parse(propsJson)
    } catch {
      console.warn(`[BarefootJS] Invalid props JSON on ${bfs}:`, propsJson)
    }
  }

  const prevScope = setCurrentScope(el)
  try {
    def.init(el, props)
  } finally {
    setCurrentScope(prevScope)
  }
}

function hydrateCommentScope(comment: Comment): void {
  const value = comment.nodeValue
  if (!value?.startsWith(BF_SCOPE_COMMENT_PREFIX)) return

  const rest = value.slice(BF_SCOPE_COMMENT_PREFIX.length)
  if (rest.startsWith(BF_CHILD_PREFIX)) return

  let scopeId = rest
  let propsJson = ''
  const pipeIdx = rest.indexOf('|')
  if (pipeIdx >= 0) {
    scopeId = rest.slice(0, pipeIdx)
    propsJson = rest.slice(pipeIdx + 1)
  }

  const flagged = comment as unknown as Record<string, boolean>
  if (flagged.__bfInitialized) return

  const underscoreIdx = scopeId.indexOf('_')
  if (underscoreIdx < 0) return
  const name = scopeId.slice(0, underscoreIdx)

  const def = registeredDefs.get(name)
  if (!def?.comment) return

  // Mark before init for the same reentrancy reason as element scopes:
  // see hydrateElementScope() above.
  flagged.__bfInitialized = true

  let proxyEl: Element | null = null
  let sibling: Node | null = comment.nextSibling
  while (sibling) {
    if (sibling.nodeType === Node.ELEMENT_NODE) {
      proxyEl = sibling as Element
      break
    }
    sibling = sibling.nextSibling
  }
  if (!proxyEl) proxyEl = comment.parentElement
  if (!proxyEl) return

  commentScopeRegistry.set(proxyEl, {
    commentNode: comment,
    scopeId,
  })

  let parsed: Record<string, unknown> = {}
  if (propsJson) {
    try {
      parsed = JSON.parse(propsJson)
    } catch {
      console.warn(`[BarefootJS] Invalid props JSON in comment scope ${scopeId}:`, propsJson)
    }
  }
  const props = (parsed[name] ?? {}) as Record<string, unknown>

  const prevScope = setCurrentScope(proxyEl)
  try {
    def.init(proxyEl, props)
  } finally {
    setCurrentScope(prevScope)
  }
}
