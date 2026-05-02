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
 *   2. The walk visits every `[bf-s]` element in document order — a
 *      single pass for every registered component, run once per
 *      scheduling tick. Document order means a parent's init always
 *      runs before any descendant's init, so context providers
 *      resolve on the first hydrate pass.
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
 * Schedule the document-order walk once per tick (microtask) and once
 * per frame (rAF). Both flags are cleared inside their respective
 * callbacks, so a flood of `hydrate()` / `rehydrateAll()` calls can
 * never queue more than two pending walks in total.
 */
function scheduleWalk(): void {
  if (!microtaskScheduled) {
    microtaskScheduled = true
    queueMicrotask(() => {
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
 * Document-order walk over every `[bf-s]` element in the page.
 *
 * Element-scope path:
 *   - Skip elements already in `hydratedScopes`. This is the single
 *     source of truth: children initialised via `initChild` mark their
 *     scope here too, so the walker can rely on this check alone (no
 *     ancestor-name lookup needed).
 *   - Skip child-prefixed scopes (`~Foo_xxx`) outright — they were
 *     emitted by `renderChild()` and are owned by the parent's
 *     `initChild`/`upsertChild` flow.
 *   - Look up the def by the name encoded in the `bf-s` attribute. If
 *     the component hasn't registered yet, leave the element for a
 *     future walk.
 *   - Set currentScope, run init, restore scope, mark as hydrated.
 *
 * Comment-scope path runs after the element pass and visits each
 * `<!--bf-scope:Name_xxx-->` comment in document order.
 */
function walkAllInDocumentOrder(): void {
  if (typeof document === 'undefined') return

  const all = document.querySelectorAll(`[${BF_SCOPE}]`)

  for (const el of all) {
    if (hydratedScopes.has(el)) continue

    const bfs = el.getAttribute(BF_SCOPE)
    if (!bfs) continue
    if (bfs.startsWith(BF_CHILD_PREFIX)) continue

    const underscoreIdx = bfs.indexOf('_')
    if (underscoreIdx < 0) continue
    const name = bfs.slice(0, underscoreIdx)

    const def = registeredDefs.get(name)
    if (!def) continue
    // Comment-based components hydrate via the comment-scope path; their
    // bf-s attribute (when present) sits on a proxy element that we'd
    // otherwise double-init.
    if (def.comment) continue

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

  walkCommentScopesInDocumentOrder()
}

/**
 * Walk every `<!--bf-scope:Name_xxx-->` comment in document order and
 * hydrate the matching def. Mirrors the element-scope pass: parents come
 * before descendants, so context providers resolve on the first run.
 */
function walkCommentScopesInDocumentOrder(): void {
  const prefix = BF_SCOPE_COMMENT_PREFIX
  const walker = document.createTreeWalker(document, NodeFilter.SHOW_COMMENT)

  while (walker.nextNode()) {
    const comment = walker.currentNode as Comment
    const value = comment.nodeValue
    if (!value?.startsWith(prefix)) continue

    const rest = value.slice(prefix.length)
    if (rest.startsWith(BF_CHILD_PREFIX)) continue

    let scopeId = rest
    let propsJson = ''
    const pipeIdx = rest.indexOf('|')
    if (pipeIdx >= 0) {
      scopeId = rest.slice(0, pipeIdx)
      propsJson = rest.slice(pipeIdx + 1)
    }

    if ((comment as unknown as Record<string, boolean>).__bfInitialized) continue

    const underscoreIdx = scopeId.indexOf('_')
    if (underscoreIdx < 0) continue
    const name = scopeId.slice(0, underscoreIdx)

    const def = registeredDefs.get(name)
    if (!def?.comment) continue

    ;(comment as unknown as Record<string, boolean>).__bfInitialized = true

    let proxyEl: Element | null = null
    let node: Node | null = comment.nextSibling
    while (node) {
      if (node.nodeType === Node.ELEMENT_NODE) {
        proxyEl = node as Element
        break
      }
      node = node.nextSibling
    }
    if (!proxyEl) {
      proxyEl = comment.parentElement
    }

    if (proxyEl) {
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
  }
}
