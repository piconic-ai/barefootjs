/**
 * BarefootJS - Conditional Insert
 *
 * Handle conditional DOM updates using branch configurations.
 * SolidJS-inspired replacement for legacy cond() that properly
 * handles event binding for both branches.
 */

import { createEffect } from '@barefootjs/client/reactive'
import { find } from './query'
import { setParentScopeId, parseHTML } from './component'
import { BF_COND, BF_SCOPE, BF_CHILD_PREFIX } from '@barefootjs/shared'

/**
 * Branch configuration for conditional rendering.
 * Contains template and event binding functions for each branch.
 */
export interface BranchConfig {
  /** HTML template function for this branch */
  template: () => string

  /**
   * Bind events and reactive effects to elements within the branch.
   * Called both during hydration (for SSR elements) and after DOM swaps.
   * @param scope - The scope element to search within for event targets
   * @returns Optional cleanup function, called when the branch is deactivated.
   *          Used to dispose reactive effects scoped to this branch.
   */
  bindEvents: (scope: Element) => (() => void) | void
}


/**
 * Handle conditional DOM updates using branch configurations.
 *
 * Key behaviors:
 * - First run (hydration): Reuse SSR element, call branch.bindEvents() for current branch
 * - Condition change: Create new element from template, call branch.bindEvents()
 *
 * @param scope - Component scope element
 * @param id - Conditional slot ID (e.g., 's0')
 * @param conditionFn - Function that returns current condition value
 * @param whenTrue - Branch config for when condition is true
 * @param whenFalse - Branch config for when condition is false
 */
export function insert(
  scope: Element | null,
  id: string,
  conditionFn: () => boolean,
  whenTrue: BranchConfig,
  whenFalse: BranchConfig
): void {
  if (!scope) return

  // Extract parent scope ID for renderChild context.
  // When branch templates call renderChild(), it needs the parent scope ID
  // to generate child scope IDs matching the SSR convention.
  const rawScopeId = scope.getAttribute(BF_SCOPE)
  const parentScopeId = rawScopeId
    ? (rawScopeId.startsWith(BF_CHILD_PREFIX) ? rawScopeId.slice(1) : rawScopeId)
    : null

  // Check if either branch uses fragment conditional (comment markers).
  // Both branches need to be checked because SSR may render either branch.
  // Use try/catch because template evaluation may access nullable expressions
  // (e.g., selectedMail().subject when the branch is for the non-null case).
  let isFragmentCond = false
  try {
    const sampleTrue = whenTrue.template()
    isFragmentCond = sampleTrue.includes(`<!--bf-cond-start:${id}-->`)
  } catch (err) {
    // Template may throw TypeError for nullable access (e.g., selectedMail().subject)
    if (!(err instanceof TypeError)) throw err
  }
  if (!isFragmentCond) {
    try {
      const sampleFalse = whenFalse.template()
      isFragmentCond = sampleFalse.includes(`<!--bf-cond-start:${id}-->`)
    } catch (err) {
      if (!(err instanceof TypeError)) throw err
    }
  }

  let prevCond: boolean | undefined
  let branchCleanup: (() => void) | null = null

  createEffect(() => {
    let currCond: boolean
    try {
      currCond = Boolean(conditionFn())
    } catch (err) {
      // Condition evaluation may throw TypeError if parent branch is inactive
      // (e.g., selectedMail().read when selectedMail() is null).
      // Only swallow TypeErrors; rethrow unexpected errors to avoid hiding bugs.
      if (err instanceof TypeError) {
        currCond = false
      } else {
        throw err
      }
    }
    const isFirstRun = prevCond === undefined
    const prevVal = prevCond
    prevCond = currCond

    // Select the appropriate branch
    const branch = currCond ? whenTrue : whenFalse

    if (isFirstRun) {
      // Hydration mode: check if existing DOM matches expected branch
      // If the existing element doesn't match the expected branch,
      // we need to swap the DOM first (e.g., SSR rendered whenFalse but now we need whenTrue)
      setParentScopeId(parentScopeId)
      let html: string
      try { html = branch.template() } finally { setParentScopeId(null) }
      const existingEl = find(scope, `[${BF_COND}="${id}"]`)
      if (existingEl) {
        // Compare full opening tag signatures to detect branch mismatch.
        // Tag-name-only comparison fails when both branches use the same tag (e.g., <div>).
        const expectedSig = getTemplateRootSignature(html)
        const existingSig = existingEl.outerHTML.match(/^<[^>]+>/)?.[0] ?? null

        if (isFragmentCond) {
          // Fragment conditional template but element conditional in DOM:
          // CSR composite loops inline-evaluate conditionals into bf-c elements,
          // but insert() manages them as fragment conditionals (comment markers).
          // Replace the bf-c element with the fragment template content.
          updateFragmentConditional(scope, id, html)
        } else if (expectedSig && existingSig && expectedSig !== existingSig) {
          // DOM doesn't match expected branch - need to swap
          updateElementConditional(scope, id, html)
        }
      } else if (isFragmentCond) {
        // For @client fragment conditionals, SSR renders only comment markers.
        // We need to insert the actual content on first run.
        updateFragmentConditional(scope, id, html)
      }

      // Bind events to the (possibly updated) SSR element
      const result = branch.bindEvents(scope)
      branchCleanup = typeof result === 'function' ? result : null

      // Auto-focus on first run too (for components created via createComponent with editing=true)
      autoFocusConditionalElement(scope, id)
      return
    }

    // Skip if condition hasn't changed.
    // Reactive updates within a branch are handled by the effect system,
    // not by DOM replacement. Only replace DOM when the branch switches.
    if (currCond === prevVal) {
      return
    }

    // Dispose previous branch's scoped effects before swapping DOM
    if (branchCleanup) {
      branchCleanup()
      branchCleanup = null
    }

    // Branch changed: swap DOM and bind events
    setParentScopeId(parentScopeId)
    let html: string
    try { html = branch.template() } finally { setParentScopeId(null) }
    if (isFragmentCond) {
      updateFragmentConditional(scope, id, html)
    } else {
      updateElementConditional(scope, id, html)
    }

    // Bind events to the newly inserted element
    const result = branch.bindEvents(scope)
      branchCleanup = typeof result === 'function' ? result : null

    // Auto-focus elements with autofocus attribute (for dynamically created elements)
    autoFocusConditionalElement(scope, id)
  })
}


/**
 * Auto-focus elements with autofocus attribute within a conditional slot.
 * Used by insert() to focus inputs when they become visible.
 * Uses requestAnimationFrame to ensure element is in DOM before focusing.
 */
function autoFocusConditionalElement(scope: Element, id: string): void {
  // Use requestAnimationFrame to defer focus until after DOM updates.
  // This is necessary because createComponent() may call insert() before
  // the element is added to the document by reconcileList().
  requestAnimationFrame(() => {
    const condEl = scope.querySelector(`[${BF_COND}="${id}"]`)
    if (condEl) {
      const autofocusEl = condEl.matches('[autofocus]')
        ? condEl
        : condEl.querySelector('[autofocus]')
      if (autofocusEl && typeof (autofocusEl as HTMLElement).focus === 'function') {
        ;(autofocusEl as HTMLElement).focus()
      }
    }
  })
}

/**
 * Extract the root element's opening tag from an HTML template string.
 * Returns the full opening tag (e.g., `<div class="foo" bf-c="s0">`) for comparison.
 * This allows distinguishing between conditional branches that share the same tag name
 * but differ in attributes (e.g., two different `<div>` branches).
 */
function getTemplateRootSignature(template: string): string | null {
  const match = template.match(/^<[^>]+>/)
  return match ? match[0] : null
}

/**
 * Update fragment conditional (content between comment markers)
 */
function updateFragmentConditional(scope: Element, id: string, html: string): void {
  // Find start comment marker
  const startMarker = `bf-cond-start:${id}`
  let startComment: Comment | null = null
  const walker = document.createTreeWalker(scope, NodeFilter.SHOW_COMMENT)
  while (walker.nextNode()) {
    if (walker.currentNode.nodeValue === startMarker) {
      startComment = walker.currentNode as Comment
      break
    }
  }

  const condEl = scope.querySelector(`[${BF_COND}="${id}"]`)

  const endMarker = `bf-cond-end:${id}`

  if (startComment) {
    // Remove nodes between start and end markers
    const nodesToRemove: Node[] = []
    let node = startComment.nextSibling
    while (node && !(node.nodeType === 8 && node.nodeValue === endMarker)) {
      nodesToRemove.push(node)
      node = node.nextSibling
    }
    const endComment = node
    nodesToRemove.forEach(n => n.parentNode?.removeChild(n))

    // Insert new content. Pass the actual insertion parent so SVG-context
    // parsing kicks in for fragments mounted inside an `<svg>` (#135).
    const insertParent = (startComment.parentNode instanceof Element)
      ? startComment.parentNode
      : null
    const fragment = parseHTML(html, insertParent)
    const newNodes: Node[] = []
    let child = fragment.firstChild
    while (child) {
      if (!(child.nodeType === 8 && child.nodeValue?.startsWith('bf-cond-'))) {
        newNodes.push(child.cloneNode(true))
      }
      child = child.nextSibling
    }
    newNodes.forEach(n => startComment!.parentNode?.insertBefore(n, endComment))
  } else if (condEl) {
    // Single element: replace with new content. The replacement's
    // namespace is determined by the parent of the element being
    // replaced.
    const insertParent = (condEl.parentNode instanceof Element)
      ? condEl.parentNode
      : null
    const parsed = parseHTML(html, insertParent)
    const firstChild = parsed.firstChild

    if (firstChild?.nodeType === 8 && firstChild?.nodeValue === `bf-cond-start:${id}`) {
      // Switching from element to fragment
      const parent = condEl.parentNode
      const nodes = Array.from(parsed.childNodes).map(n => n.cloneNode(true))
      nodes.forEach(n => parent?.insertBefore(n, condEl))
      condEl.remove()
    } else if (firstChild) {
      condEl.replaceWith(firstChild.cloneNode(true))
    }
  }
}

/**
 * Update element conditional (single element with bf-c)
 */
function updateElementConditional(scope: Element, id: string, html: string): void {
  const condEl = scope.querySelector(`[${BF_COND}="${id}"]`)
  if (!condEl) return

  const insertParent = (condEl.parentNode instanceof Element)
    ? condEl.parentNode
    : null
  const newEl = parseHTML(html, insertParent).firstChild
  if (newEl) {
    condEl.replaceWith(newEl.cloneNode(true))
  }
}
