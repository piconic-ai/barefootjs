/**
 * BarefootJS - Hydration
 *
 * Combined component registration + template registration + hydration.
 * Single entry point for compiler-generated code.
 *
 * The walker is **document-order**: per-name `hydrate()` calls only register
 * a component definition; the actual init walk runs once per microtask flush
 * and visits every `[bf-s]` element in document order. Walking parents
 * before descendants is what makes `useFlow()` (and any other context
 * consumer) resolve on the very first hydrate pass — by the time a
 * descendant's init runs, every ancestor has already provided context.
 *
 * The previous per-name walk hydrated whichever component happened to be
 * registered first in bundled module order, so a `<Flow renderNode={Fn}>`
 * descendant that ran before its `<Flow>` parent would observe an
 * undefined context (piconic-ai/barefootjs#1175 follow-up to #1166/#1169/
 * #1171).
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

let walkScheduled = false

function scheduleWalk(): void {
  if (walkScheduled) return
  walkScheduled = true
  // Microtask: every synchronous `hydrate()` call from the bundled
  // module body has registered its def by the time the walk runs, so
  // the document-order walk sees a fully populated registry.
  queueMicrotask(() => {
    walkScheduled = false
    walkAllInDocumentOrder()
  })
  // rAF: streaming protocol may move template content into the document
  // after initial script execution. Re-walking once a frame later picks
  // up scope elements that landed too late for the microtask.
  if (typeof requestAnimationFrame === 'function') {
    requestAnimationFrame(walkAllInDocumentOrder)
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
 * resolved content. Re-runs the document-order walker so newly-inserted
 * scope elements pick up their inits.
 */
export function rehydrateAll(): void {
  walkAllInDocumentOrder()
}

/**
 * Document-order walk over every `[bf-s]` element in the page.
 *
 * Element-scope path:
 *   - Skip elements that are already hydrated.
 *   - Skip child-prefixed scopes (`~Foo_xxx`) — the parent's `initChild`
 *     owns those.
 *   - Skip nested same-name scopes — `<Counter>` inside `<Counter>` only
 *     hydrates the outer; the parent's init handles the inner.
 *   - Look up the def by the name encoded in the `bf-s` attribute. If
 *     the component hasn't registered yet, leave the element for a
 *     future walk.
 *   - Set currentScope, run init, restore scope.
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
    // Comment-based components handle their own walk (the bf-s attribute
    // here is on a proxy element and we'd double-init if we ran it twice).
    if (def.comment) continue

    // Nested same-name skip: a `<Counter>` rendered inside another
    // `<Counter>` only hydrates the outer; the outer's init drives the
    // inner via initChild. Match against any ancestor scope so deeply
    // nested same-name pairs still skip.
    if (hasAncestorWithSameName(el, name)) continue

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

function hasAncestorWithSameName(scopeEl: Element, name: string): boolean {
  let parent: Element | null = scopeEl.parentElement?.closest(`[${BF_SCOPE}]`) ?? null
  while (parent) {
    const raw = parent.getAttribute(BF_SCOPE)
    const id = raw?.startsWith(BF_CHILD_PREFIX) ? raw.slice(1) : raw
    if (id?.startsWith(name + '_')) return true
    parent = parent.parentElement?.closest(`[${BF_SCOPE}]`) ?? null
  }
  return false
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
