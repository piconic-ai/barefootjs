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

import { setCurrentScope } from './context.ts'
import { commentScopeRegistry } from './scope.ts'
import { hydratedScopes } from './hydration-state.ts'
import { registerComponent } from './registry.ts'
import { registerTemplate } from './template.ts'
import { BF_SCOPE, BF_PROPS, BF_HOST, BF_SCOPE_COMMENT_PREFIX } from '@barefootjs/shared'
import { createRoot } from '@barefootjs/client/reactive'
import type { ComponentDef } from './types.ts'

/**
 * Registry of all hydrated component definitions.
 * Used by the walker to look up an element's init/def by name, and by
 * rehydrateAll() to re-scan the DOM after streaming chunks arrive.
 */
const registeredDefs = new Map<string, ComponentDef>()

/**
 * Look up a registered component definition by name. Used by the CSR
 * `createComponent` path to honour `comment: true` (transparent
 * wrapper) components — without the def lookup, those components
 * overwrite the inner element's `bf-s` and break child-scope
 * resolution at hydration.
 */
export function getRegisteredDef(name: string): ComponentDef | undefined {
  return registeredDefs.get(name)
}

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
 * never queue more than two pending walks in total. The callbacks
 * also re-check their own flag on entry so that a synchronous
 * `flushHydration()` between scheduling and firing turns the queued
 * callback into a no-op.
 */
function scheduleWalk(): void {
  if (!microtaskScheduled) {
    microtaskScheduled = true
    scheduleMicrotask(() => {
      if (!microtaskScheduled) return
      microtaskScheduled = false
      walkAllInDocumentOrder()
    })
  }
  if (!rafScheduled && typeof requestAnimationFrame === 'function') {
    rafScheduled = true
    requestAnimationFrame(() => {
      if (!rafScheduled) return
      rafScheduled = false
      walkAllInDocumentOrder()
    })
  }
}

/**
 * Register a component and schedule a document-order hydration walk.
 * Combines registration + template setup + hydration in a single call.
 *
 * **Scheduling semantics** (changed in #1172): the walk runs on the
 * next microtask, then again on the next animation frame. The init
 * functions for registered components are *not* invoked synchronously
 * inside `hydrate()`. Code that needs to observe init effects on the
 * same tick — typically tests, but also advanced consumers wiring
 * imperative bridges — should either:
 *
 *   - `await Promise.resolve()` after a batch of `hydrate()` calls, or
 *   - call `flushHydration()` (see below) to drain any pending walks
 *     synchronously.
 *
 * The deferral is what lets the doc-order walker see a fully populated
 * registry: every `hydrate()` call from the bundled module body lands
 * in the registry *before* the microtask flush kicks off the single
 * walk, so parents always init before their descendants regardless of
 * which file the parent's `hydrate()` was emitted into.
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
 * collapse to a single walk per tick + per frame. Like `hydrate()` this
 * is asynchronous — see `flushHydration()` if you need a synchronous
 * drain.
 */
export function rehydrateAll(): void {
  scheduleWalk()
}

/**
 * Run any pending hydration walk synchronously, right now.
 *
 * The default scheduler is microtask + rAF — the right trade-off for
 * production code (registry populates before the walk; back-to-back
 * `hydrate()` calls coalesce). Tests and advanced consumers that need
 * a deterministic completion point — e.g. imperative mounting code
 * reading DOM state immediately after `render(...)` — call this
 * helper instead of awaiting a microtask.
 *
 * @example
 *   hydrate('Counter', def)
 *   flushHydration()
 *   // safe to read Counter's post-init DOM state
 */
export function flushHydration(): void {
  if (!microtaskScheduled && !rafScheduled) return
  microtaskScheduled = false
  rafScheduled = false
  walkAllInDocumentOrder()
}

/**
 * Re-hydrate only the scopes inside `root` (and `root` itself), in
 * document order. Unlike `rehydrateAll()` — which schedules a walk over
 * the *whole document* — this is a synchronous, subtree-scoped walk: its
 * cost is O(scopes in `root`), not O(document).
 *
 * Intended for a client router that has just swapped a content region:
 * the component registry is already populated from the initial load, so
 * no deferral is needed; only the freshly inserted islands need to init.
 */
export function rehydrateScope(root: Element): void {
  if (typeof document === 'undefined') return
  // The TreeWalker visits descendants only, so handle the root itself first.
  hydrateElementScope(root)
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_COMMENT)
  while (walker.nextNode()) {
    const node = walker.currentNode
    if (node.nodeType === Node.ELEMENT_NODE) {
      hydrateElementScope(node as Element)
    } else if (node.nodeType === Node.COMMENT_NODE) {
      hydrateCommentScope(node as Comment)
    }
  }
}

/**
 * Dispose every hydrated scope inside `root` (and `root` itself): runs
 * each scope's `createRoot` dispose fn, tearing down its effects, memos,
 * and `onCleanup` callbacks. Used by a client router before it removes a
 * content region, so the outgoing islands release timers/listeners/
 * subscriptions instead of leaking.
 *
 * Also clears the `hydratedScopes` mark so the same element could be
 * re-hydrated if it is ever re-inserted.
 */
export function disposeScope(root: Element): void {
  if (typeof document === 'undefined') return
  disposeOneScope(root)
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT)
  while (walker.nextNode()) {
    disposeOneScope(walker.currentNode as Element)
  }
}

function disposeOneScope(el: Element): void {
  const dispose = scopeDisposers.get(el)
  if (dispose) {
    scopeDisposers.delete(el)
    hydratedScopes.delete(el)
    dispose()
  }
}

/**
 * Single document-order walk visiting element scopes (`[bf-s]`) and
 * comment scopes (`<!--bf-scope:Name_xxx-->`) interleaved by their
 * actual DOM position. The parent's init — whichever scope shape it
 * takes — always runs before any descendant init, so a comment-scope
 * provider is visible to an element-scope descendant on the first pass.
 *
 * Both paths skip `~`-prefixed scopes (owned by `initChild`) and mark
 * the scope as hydrated *before* running init: re-entrant `hydrate()`
 * / `rehydrateAll()` calls from the init body (or a synchronous effect
 * they trigger) must see the slot already taken so the next scheduled
 * walk doesn't re-enter the same scope.
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

/** Component name segment of a scope ID (everything before the first `_`). */
function scopeName(id: string): string | null {
  const idx = id.indexOf('_')
  return idx < 0 ? null : id.slice(0, idx)
}

function parseProps(json: string | null, where: string): Record<string, unknown> {
  if (!json) return {}
  try {
    return JSON.parse(json) as Record<string, unknown>
  } catch {
    console.warn(`[BarefootJS] Invalid props JSON on ${where}:`, json)
    return {}
  }
}

/**
 * Per-scope disposal registry. Each scope's `init` runs inside a
 * `createRoot`, so all the effects/memos it (and its `initChild`-mounted
 * descendants) create are owned by one root. `disposeScope(root)` calls
 * the stored dispose fn to tear them down — enabling a client router to
 * release the islands leaving the page precisely, instead of leaking
 * timers/listeners or relying on GC (see `disposeScope`).
 *
 * Keyed by the scope element; a `WeakMap` so detached scopes are
 * reclaimed even if `disposeScope` is never called.
 */
const scopeDisposers = new WeakMap<Element, () => void>()

function runInit(scope: Element, def: ComponentDef, props: Record<string, unknown>): void {
  const prevScope = setCurrentScope(scope)
  try {
    // Wrap in createRoot so the scope's reactive graph has an owner that
    // can be disposed later. This is additive: nothing disposes the root
    // unless `disposeScope` is called, so existing lifetimes are unchanged.
    createRoot((dispose) => {
      scopeDisposers.set(scope, dispose)
      def.init(scope, props)
    })
  } finally {
    setCurrentScope(prevScope)
  }
}

function hydrateElementScope(el: Element): void {
  if (hydratedScopes.has(el)) return

  const bfs = el.getAttribute(BF_SCOPE)
  if (!bfs) return
  // Skip child scopes — parent's initChild call owns their lifecycle.
  // Child detection uses bf-h presence (#1249).
  if (el.hasAttribute(BF_HOST)) return

  const name = scopeName(bfs)
  if (!name) return

  const def = registeredDefs.get(name)
  if (!def) return

  hydratedScopes.add(el)
  // Comment-based components hydrate via the comment-scope path; their
  // bf-s attribute sits on a proxy element. Marking it above lets the
  // next walk skip at the WeakSet check rather than re-resolving the def.
  if (def.comment) return

  runInit(el, def, parseProps(el.getAttribute(BF_PROPS), bfs))
}

function hydrateCommentScope(comment: Comment): void {
  const value = comment.nodeValue
  if (!value?.startsWith(BF_SCOPE_COMMENT_PREFIX)) return

  const rest = value.slice(BF_SCOPE_COMMENT_PREFIX.length)
  // Comment-scope child detection: child fragment scopes embed host metadata
  // as a `|h=<hostBfs>|m=<slot>` segment after the scope id. Their parent's
  // initChild call owns hydration; the walker must skip them.
  // Root scopes have only `|<propsJson>` (no `h=` segment).
  if (rest.includes('|h=')) return

  const flagged = comment as unknown as { __bfInitialized?: boolean }
  if (flagged.__bfInitialized) return

  const pipeIdx = rest.indexOf('|')
  const scopeId = pipeIdx >= 0 ? rest.slice(0, pipeIdx) : rest
  const propsJson = pipeIdx >= 0 ? rest.slice(pipeIdx + 1) : ''

  const name = scopeName(scopeId)
  if (!name) return

  const def = registeredDefs.get(name)
  if (!def?.comment) return

  flagged.__bfInitialized = true

  const proxyEl = nextElementSibling(comment) ?? comment.parentElement
  if (!proxyEl) return

  // A synchronous CSR render() may have already initialized this fragment
  // scope and claimed its proxy before this async walk runs. Honour the same
  // `hydratedScopes` signal the element-scope path uses (hydrateElementScope),
  // so a comment-rooted scope is never re-initialized once claimed.
  if (hydratedScopes.has(proxyEl)) return

  commentScopeRegistry.set(proxyEl, { commentNode: comment, scopeId })

  const parsed = parseProps(propsJson || null, `comment scope ${scopeId}`)
  const props = (parsed[name] ?? {}) as Record<string, unknown>
  runInit(proxyEl, def, props)
}

function nextElementSibling(node: Node): Element | null {
  let sibling: Node | null = node.nextSibling
  while (sibling) {
    if (sibling.nodeType === Node.ELEMENT_NODE) return sibling as Element
    sibling = sibling.nextSibling
  }
  return null
}
