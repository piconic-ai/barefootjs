/**
 * BarefootJS - Conditional Insert
 *
 * Handle conditional DOM updates using branch configurations.
 * SolidJS-inspired replacement for legacy cond() that properly
 * handles event binding for both branches.
 */

import { createEffect, untrack } from '@barefootjs/client/reactive'
import { find, findCondTarget, commentsInScope } from './query.ts'
import { setParentScopeId, parseHTML } from './component.ts'
import { commentScopeRegistry, getCommentScopeBoundary } from './scope.ts'
import { BF_COND, BF_SCOPE, BF_LOOP_ITEM, BF_HOST, BF_AT, BF_KEY, BF_ROOT } from '@barefootjs/shared'

/**
 * Resolved search context for an `insert()` call (#1665).
 *
 * `anchor === null` is the legacy element-scope path: every DOM read goes
 * through the component scope element exactly as before. When `insert()` is
 * given a `<!--bf-loop-i:<key>-->` anchor instead, the conditional is a
 * whole loop item with no wrapper element, so all reads are confined to that
 * item's sibling range — letting every item reuse the same conditional slot
 * id without colliding.
 */
interface CondRegion {
  /** The loop-item anchor comment, or `null` for element scopes. */
  anchor: Comment | null
  /** Element handed to `find()`/`$`/`$t`/`bindEvents`. For loop items this
   *  is a detached proxy registered in `commentScopeRegistry`, so the shared
   *  query machinery walks the item's range via the comment-scope branch. */
  bindScope: Element
  /** Parent component scope id for `setParentScopeId()` / `renderChild`. */
  parentScopeId: string | null
}

function makeRegion(scope: Element | Comment): CondRegion {
  if (scope.nodeType === Node.COMMENT_NODE) {
    const anchor = scope as Comment
    const parentEl = anchor.parentElement
    const componentScope = parentEl?.closest(`[${BF_SCOPE}]`) ?? null
    const parentScopeId = componentScope?.getAttribute(BF_SCOPE) ?? null
    // Detached proxy: candidatesInScope() keys off the registered comment
    // node (not the proxy's DOM position), so the proxy need not be mounted.
    const proxyEl = document.createElement('bf-loop-item')
    commentScopeRegistry.set(proxyEl, { commentNode: anchor, scopeId: parentScopeId ?? '' })
    return { anchor, bindScope: proxyEl, parentScopeId }
  }
  const el = scope as Element
  return { anchor: null, bindScope: el, parentScopeId: el.getAttribute(BF_SCOPE) }
}

/** Find the `[bf-c="id"]` element within a loop item's sibling range. */
function findCondElInRange(anchor: Comment, id: string): Element | null {
  const sel = `[${BF_COND}="${id}"]`
  const boundary = getCommentScopeBoundary(anchor)
  let node: Node | null = anchor.nextSibling
  while (node && node !== boundary) {
    if (node.nodeType === Node.ELEMENT_NODE) {
      const el = node as Element
      if (el.matches?.(sel)) return el
      const inner = el.querySelector(sel)
      if (inner) return inner
    }
    node = node.nextSibling
  }
  return null
}

/** Find the `bf-cond-start:id` comment within a loop item's sibling range
 *  (checking range siblings and their descendants). */
function findCondStartInRange(anchor: Comment, id: string): Comment | null {
  const want = `bf-cond-start:${id}`
  const boundary = getCommentScopeBoundary(anchor)
  let node: Node | null = anchor.nextSibling
  while (node && node !== boundary) {
    if (node.nodeType === Node.COMMENT_NODE && (node as Comment).nodeValue === want) {
      return node as Comment
    }
    if (node.nodeType === Node.ELEMENT_NODE) {
      const w = document.createTreeWalker(node as Element, NodeFilter.SHOW_COMMENT)
      while (w.nextNode()) {
        if ((w.currentNode as Comment).nodeValue === want) return w.currentNode as Comment
      }
    }
    node = node.nextSibling
  }
  return null
}

/**
 * Result returned by a branch's `template()` when the template captures
 * live DOM nodes via `__bfSlot` (#1213). `html` carries the marker-bearing
 * HTML string; `slots[N]` is the actual `Node` referenced by the
 * `<!--bf-slot:N-->` placeholder at the same index.
 */
export interface BranchTemplateResult {
  html: string
  slots: Node[]
}

/**
 * Branch configuration for conditional rendering.
 * Contains template and event binding functions for each branch.
 */
export interface BranchConfig {
  /**
   * HTML template function for this branch. Returns either a plain HTML
   * string (legacy) or a `{ html, slots }` pair for templates that
   * captured live `Node` values via `__bfSlot`.
   *
   * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   *  INVARIANT — TEMPLATES RUN WITH REACTIVITY UNTRACKED.
   * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   *
   * Every call site goes through `evalBranchTemplate()` in this file,
   * which wraps the invocation in `untrack()`. Signal reads inside
   * the template are therefore NOT registered as effect dependencies.
   *
   * Consequences for authors of new branch shapes:
   *
   *  - `template()` must produce a function of state-at-call-time only.
   *    Any reactive portion of the rendered fragment is wired up
   *    afterwards by `bindEvents()` (events + per-binding effects) and
   *    `__bfSlot` (live-Node splicing for slot-captured signals).
   *
   *  - A template such as `() => signalA() ? '<a>' : '<b>'` is a BUG:
   *    later changes to `signalA` will not re-evaluate the template,
   *    because the read was performed without tracking. Branch
   *    selection belongs in the `conditionFn` argument of `insert()`,
   *    not inside the template body.
   */
  template: () => string | BranchTemplateResult

  /**
   * Bind events and reactive effects to elements within the branch.
   * Called both during hydration (for SSR elements) and after DOM swaps.
   * @param scope - The scope element to search within for event targets
   * @returns Optional cleanup function, called when the branch is deactivated.
   *          Used to dispose reactive effects scoped to this branch.
   */
  bindEvents: (scope: Element, opts?: { isFirstRun?: boolean }) => (() => void) | void
}

const EMPTY_SLOTS: Node[] = []

function normalizeTemplate(value: string | BranchTemplateResult): BranchTemplateResult {
  return typeof value === 'string' ? { html: value, slots: EMPTY_SLOTS } : value
}

/**
 * Single chokepoint for every `branch.template()` call in this module —
 * routes the invocation through `untrack()` so the contract on
 * `BranchConfig.template` cannot be locally bypassed.
 *
 * Reads inside the template would otherwise be attributed to whatever
 * effect is the active Listener when `insert()` runs, causing duplicate
 * inner constructs (notably duplicate `mapArray` instances) when an
 * outer effect re-runs and re-invokes `insert()`.
 *
 * New `template()` call sites: route through here, never call directly.
 */
function evalBranchTemplate(branch: BranchConfig): BranchTemplateResult {
  return untrack(() => normalizeTemplate(branch.template()))
}

/**
 * Shared branch-selection state machine for `insert()` and `insertRoot()`
 * (#2463 follow-up). Both functions must agree on WHEN a branch swap
 * happens and HOW the condition is read — first-run vs. a real change,
 * the `TypeError` swallow, "skip if unchanged", cleanup-before-swap
 * ordering — so that logic is factored out here ONCE rather than kept in
 * sync by hand across two `createEffect` bodies. Only WHERE the swap lands
 * differs between the two callers (a `[bf-c]`-queried descendant vs. the
 * scope root itself), which is exactly what `hooks` parameterises:
 *
 *   - `hydrate(branch)`: first run. Reconcile whatever's already in the
 *     DOM (SSR or a prior CSR create) with `branch` however the caller's
 *     addressing scheme requires, and return the element `bindEvents`
 *     should be called with.
 *   - `swap(branch)`: a real branch change. Build the new branch's DOM,
 *     install it, and return the element `bindEvents` should be called
 *     with.
 *
 * Neither hook runs until the effect actually needs it — `runConditionalEffect`
 * itself never touches the DOM.
 */
function runConditionalEffect(
  conditionFn: () => boolean,
  whenTrue: BranchConfig,
  whenFalse: BranchConfig,
  bfId: string | undefined,
  hooks: {
    hydrate: (branch: BranchConfig) => Element
    swap: (branch: BranchConfig) => Element
  },
): void {
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
      const bindScope = hooks.hydrate(branch)
      // Pass isFirstRun so branch composite loops can skip the
      // wipe-then-rebuild path that is only needed for subsequent branch
      // swaps (the SSR-rendered DOM already matches the data and mapArray
      // reconciles by key from it).
      const cleanup = branch.bindEvents(bindScope, { isFirstRun: true })
      branchCleanup = typeof cleanup === 'function' ? cleanup : null
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

    const bindScope = hooks.swap(branch)
    const cleanup = branch.bindEvents(bindScope, { isFirstRun: false })
    branchCleanup = typeof cleanup === 'function' ? cleanup : null
  }, bfId)
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
  scope: Element | Comment | null,
  id: string,
  conditionFn: () => boolean,
  whenTrue: BranchConfig,
  whenFalse: BranchConfig,
  bfId?: string
): void {
  if (!scope) return

  // Resolve the scope into a search region. For an Element scope this is
  // byte-identical to the legacy descendant search. For a Comment anchor
  // (`<!--bf-loop-i:<key>-->`) the region is the item's sibling range, so a
  // whole-item conditional toggles only its own item even when every item
  // shares the same conditional slot id (#1665).
  const region = makeRegion(scope)

  // Extract parent scope ID for renderChild context.
  // When branch templates call renderChild(), it needs the parent scope ID
  // so child mounts can stamp `bf-h` / `bf-m` for slot-resolver lookups.
  const parentScopeId = region.parentScopeId

  // Check if either branch uses fragment conditional (comment markers).
  // Both branches need to be checked because SSR may render either branch.
  // try/catch absorbs TypeError from nullable access during the probe
  // (e.g. `selectedMail().subject` when the branch is for the non-null case).
  let isFragmentCond = false
  try {
    const sampleTrue = evalBranchTemplate(whenTrue)
    isFragmentCond = sampleTrue.html.includes(`<!--bf-cond-start:${id}-->`)
  } catch (err) {
    // Template may throw TypeError for nullable access (e.g., selectedMail().subject)
    if (!(err instanceof TypeError)) throw err
  }
  if (!isFragmentCond) {
    try {
      const sampleFalse = evalBranchTemplate(whenFalse)
      isFragmentCond = sampleFalse.html.includes(`<!--bf-cond-start:${id}-->`)
    } catch (err) {
      if (!(err instanceof TypeError)) throw err
    }
  }

  // The two hooks below are the ONLY thing that differs from `insertRoot()`
  // — see `runConditionalEffect`'s docstring. Both resolve to
  // `region.bindScope` (the same element on every call for a non-comment
  // scope), reconciling the DOM against `branch` via the `[bf-c="id"]`
  // query addressing this function has always used.
  runConditionalEffect(conditionFn, whenTrue, whenFalse, bfId, {
    hydrate: (branch) => {
      // Hydration mode: check if existing DOM matches expected branch.
      // If not, swap first (e.g., SSR rendered whenFalse but now we need whenTrue).
      setParentScopeId(parentScopeId)
      let result: BranchTemplateResult
      try { result = evalBranchTemplate(branch) } finally { setParentScopeId(null) }
      const existingEl = region.anchor
        ? findCondElInRange(region.anchor, id)
        : find(region.bindScope, `[${BF_COND}="${id}"]`)
      if (existingEl) {
        // Compare full opening tag signatures to detect branch mismatch.
        // Tag-name-only comparison fails when both branches use the same tag (e.g., <div>).
        const expectedSig = getTemplateRootSignature(result.html)
        const existingSig = existingEl.outerHTML.match(/^<[^>]+>/)?.[0] ?? null

        if (isFragmentCond && (!expectedSig || existingSig !== expectedSig)) {
          // Fragment conditional template but element conditional in DOM:
          // CSR composite loops inline-evaluate conditionals into bf-c elements,
          // but insert() manages them as fragment conditionals (comment markers).
          // Replace the bf-c element with the fragment template content.
          // Skip the swap when the SSR signature already matches the active
          // branch — the SSR DOM is correct, and replacing it would re-render
          // via the registered child template, which doesn't reproduce the
          // bf-h / bf-m markers set by the parent's JSX scope chain.
          updateFragmentConditional(region, id, result)
        } else if (!isFragmentCond && expectedSig && existingSig && expectedSig !== existingSig) {
          // DOM doesn't match expected branch - need to swap
          updateElementConditional(region, id, result)
        } else if (result.slots.length > 0) {
          // Branch template captured live nodes via __bfSlot (#1213). The
          // SSR DOM rendered Hono-stringified HTML, but the client now needs
          // the live signal-bound nodes installed. Force a swap so the
          // existing element is replaced with the slot-spliced template.
          updateElementConditional(region, id, result)
        }
      } else if (isFragmentCond) {
        // For @client fragment conditionals, SSR renders only comment markers.
        // We need to insert the actual content on first run.
        updateFragmentConditional(region, id, result)
      }
      // Auto-focus on first run too (for components created via createComponent with editing=true)
      autoFocusConditionalElement(region, id)
      return region.bindScope
    },
    swap: (branch) => {
      // Branch changed: swap DOM and bind events.
      setParentScopeId(parentScopeId)
      let result: BranchTemplateResult
      try { result = evalBranchTemplate(branch) } finally { setParentScopeId(null) }
      if (isFragmentCond) {
        updateFragmentConditional(region, id, result)
      } else {
        updateElementConditional(region, id, result)
      }
      // Auto-focus elements with autofocus attribute (for dynamically created elements)
      autoFocusConditionalElement(region, id)
      return region.bindScope
    },
  })
}

/**
 * Root-level conditional swap for a component-level `if`/`else` early
 * return (#2463 Defect 1) — `if (loading()) return <button/>; return <p/>`.
 *
 * Unlike `insert()`, there is no stable wrapper element to search within:
 * an `IRIfStatement`'s branches are each the WHOLE component, so each
 * branch's own root element carries `bf-s` directly (no `bf-c`, no
 * `<div style="display:contents">` synthetic wrapper the way a root
 * ternary gets — #968). `scope` — the SSR/CSR-mounted root — IS the swap
 * target, tracked here by direct reference (`currentEl`) rather than by
 * `[bf-c="id"]` DOM query the way `insert()`'s `updateElementConditional`
 * works. `id` is accepted only for signature symmetry with `insert()`
 * (call-site readability / future tooling); it is never used to query the
 * DOM.
 *
 * On a real branch swap, `bf-s` / `bf-h` / `bf-m` / `bf-r` / `data-key` are
 * copied from the outgoing root onto the incoming one (`copyRootIdentityAttrs`)
 * so this component's scope identity survives the swap — anything doing
 * `.closest('[bf-s]')` from inside the new branch (nested child components,
 * `renderChild`'s `bf-h` stamping) still resolves to the same scope id a
 * parent may have already recorded.
 *
 * Shares `runConditionalEffect` with `insert()` — the same
 * condition-evaluation / first-run / skip-unchanged / cleanup-ordering
 * state machine — so the two functions can only ever disagree on WHERE a
 * swap lands (a `[bf-c]`-queried descendant vs. this root element by
 * reference), never on WHEN one happens.
 */
export function insertRoot(
  scope: Element,
  id: string,
  conditionFn: () => boolean,
  whenTrue: BranchConfig,
  whenFalse: BranchConfig,
  bfId?: string
): void {
  if (!scope) return

  // Invariant across swaps: an if-statement's branches are each the WHOLE
  // component, so the scope id a parent may already reference never changes,
  // only which element currently carries it.
  const parentScopeId = scope.getAttribute(BF_SCOPE)

  let currentEl: Element = scope

  runConditionalEffect(conditionFn, whenTrue, whenFalse, bfId, {
    // Hydration mode: reuse the SSR-rendered root as-is — no
    // signature-mismatch swap the way `insert()`'s hydration path runs for
    // a `bf-c`-marked branch. Deliberately simpler, for two reasons:
    //
    // 1. Correctness: the SSR default and the client's initial condition
    //    read are baked from the SAME source for every shape this runs
    //    for — a signal's `createSignal(initialValue)` literally is the
    //    SSR default, and a prop's initial value comes from the same
    //    `bf-p`-embedded props both sides render from. There is no window
    //    for the two to disagree the way a nested `insert()` legitimately
    //    can (e.g. a nullable-access branch an outer condition guards).
    // 2. Safety: comparing raw template-string opening tags against the
    //    live DOM's `outerHTML` is fragile here in a way it isn't for
    //    `insert()`'s nested branches — root branches commonly carry
    //    `children` (e.g. `<Button>Click me</Button>`), which the
    //    template only has access to via `__bfSlot`'s live-Node capture,
    //    not as data reconstructable from `_p` alone at hydration time. A
    //    spurious swap here (triggered by something as harmless as an
    //    empty reactive-attribute ternary leaving a double space in the
    //    literal template text, which `outerHTML` normalises away) would
    //    replace the real SSR content with an empty re-evaluation of
    //    `children` — silently dropping the button's own label. Caught
    //    exactly that way by the `button` fixture's real-browser hydration
    //    test.
    hydrate: () => currentEl,
    swap: (branch) => {
      setParentScopeId(parentScopeId)
      let result: BranchTemplateResult
      try { result = evalBranchTemplate(branch) } finally { setParentScopeId(null) }
      currentEl = swapRootElement(currentEl, result)
      return currentEl
    },
  })
}

/** Scope-identity attributes that must survive an `insertRoot()` swap —
 *  everything a parent (or this component's own init closure) might use to
 *  re-find this component's root by `bf-s` / stamp a child under it via
 *  `bf-h` / `bf-m` / carry its loop key / its "not a nested child" marker. */
const ROOT_IDENTITY_ATTRS = [BF_SCOPE, BF_HOST, BF_AT, BF_KEY, BF_ROOT]

function copyRootIdentityAttrs(oldEl: Element, newEl: Element): void {
  for (const attr of ROOT_IDENTITY_ATTRS) {
    const v = oldEl.getAttribute(attr)
    if (v != null) newEl.setAttribute(attr, v)
  }
}

/**
 * Replace `currentEl` with the parsed branch template's root, preserving
 * scope-identity attributes.
 *
 * `firstElementChild`, not `firstChild`: a branch whose template opens with
 * a text run or a marker comment (`<>hello <button/></>`) has a non-element
 * first node, and keying off `firstChild` would take the `null` path below
 * and skip the swap — silently freezing the UI in exactly the way #2463
 * exists to fix. The identity attributes belong on the first ELEMENT
 * regardless; `replaceWith(fragment)` still moves every node the branch
 * produced, leading text included.
 *
 * A branch with no element at all cannot carry scope identity, so it
 * THROWS rather than returning quietly — a swap that cannot land must be
 * diagnosable, not invisible. This is unreachable from the compiler today
 * (an if-statement branch always renders at least one element) and exists
 * so that stops being an unverified assumption.
 */
function swapRootElement(currentEl: Element, result: BranchTemplateResult): Element {
  const insertParent = currentEl.parentNode instanceof Element ? currentEl.parentNode : null
  const fragment = spliceSlots(parseHTML(result.html, insertParent), result.slots)
  const newRoot = fragment.firstElementChild
  if (!newRoot) {
    throw new Error(
      'insertRoot: branch template produced no element to carry the component scope; ' +
        'a root if/else branch must render at least one element',
    )
  }
  copyRootIdentityAttrs(currentEl, newRoot as Element)
  // Move by identity (not clone) so slot-spliced live Nodes keep their
  // bindings, and so any sibling nodes the branch template produced (a
  // multi-root fragment) land in the same place — mirrors insert()'s
  // updateFragmentConditional node-by-node move.
  currentEl.replaceWith(fragment)
  return newRoot as Element
}

/**
 * Auto-focus elements with autofocus attribute within a conditional slot.
 * Used by insert() to focus inputs when they become visible.
 * Uses requestAnimationFrame to ensure element is in DOM before focusing.
 */
function autoFocusConditionalElement(region: CondRegion, id: string): void {
  // Use requestAnimationFrame to defer focus until after DOM updates.
  // This is necessary because createComponent() may call insert() before
  // the element is added to the document by mapArray()/mapArrayAnchored().
  requestAnimationFrame(() => {
    const condEl = region.anchor
      ? findCondElInRange(region.anchor, id)
      : findCondTarget(region.bindScope, `[${BF_COND}="${id}"]`)
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
 * Replace `<!--bf-slot:N-->` placeholder comments inside a parsed fragment
 * with the live `Node` from `slots[N]` (#1213). Walks every comment in
 * the fragment and substitutes by identity (no clone) so event bindings
 * and signal effects on the slot node remain intact.
 *
 * Returns the same fragment for chaining.
 */
function spliceSlots(fragment: DocumentFragment, slots: Node[]): DocumentFragment {
  if (slots.length === 0) return fragment
  const walker = document.createTreeWalker(fragment, NodeFilter.SHOW_COMMENT)
  const replacements: Array<[Comment, Node]> = []
  while (walker.nextNode()) {
    const c = walker.currentNode as Comment
    const m = c.nodeValue?.match(/^bf-slot:(\d+)$/)
    if (m) {
      const idx = Number(m[1])
      const node = slots[idx]
      if (node) replacements.push([c, node])
    }
  }
  for (const [marker, node] of replacements) {
    marker.parentNode?.replaceChild(node, marker)
  }
  return fragment
}

/**
 * Update fragment conditional (content between comment markers)
 */
function updateFragmentConditional(region: CondRegion, id: string, result: BranchTemplateResult): void {
  const { html, slots } = result
  const scope = region.bindScope
  // Find start comment marker. For a loop-item region the marker lives
  // among the anchor's range siblings (no descendant relationship to a
  // scope element), so locate it within the item range (#1665).
  const startMarker = `bf-cond-start:${id}`
  let startComment: Comment | null = null
  if (region.anchor) {
    startComment = findCondStartInRange(region.anchor, id)
  } else {
    // commentsInScope is comment-scope-aware: for a fragment-root
    // component's scope (a comment-scope proxy element), it walks the
    // proxy's *sibling* range rather than only `scope`'s own descendants —
    // required when this conditional's markers are themselves a top-level
    // sibling of the proxy, not nested inside it (a bare TreeWalker(scope)
    // never finds them, silently freezing the branch after first render).
    for (const comment of commentsInScope(scope)) {
      if (comment.nodeValue === startMarker) {
        startComment = comment
        break
      }
    }
  }

  const condEl = region.anchor
    ? findCondElInRange(region.anchor, id)
    : findCondTarget(scope, `[${BF_COND}="${id}"]`)

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
    const fragment = spliceSlots(parseHTML(html, insertParent), slots)
    // Move parsed nodes by identity rather than cloning. A slot Node
    // nested inside an element wrapper (e.g. `<div>${__bfSlot(...)}</div>`)
    // would otherwise be cloned along with its parent, dropping event
    // listeners and reactive effects (#1213). The parsed fragment is
    // freshly built per call, so consuming it by reference is safe.
    let child = fragment.firstChild
    while (child) {
      const next: ChildNode | null = child.nextSibling
      if (!(child.nodeType === 8 && child.nodeValue?.startsWith('bf-cond-'))) {
        startComment!.parentNode?.insertBefore(child, endComment)
      }
      child = next
    }
  } else if (condEl) {
    // Single element: replace with new content. The replacement's
    // namespace is determined by the parent of the element being
    // replaced.
    const insertParent = (condEl.parentNode instanceof Element)
      ? condEl.parentNode
      : null
    const parsed = spliceSlots(parseHTML(html, insertParent), slots)
    const firstChild = parsed.firstChild

    if (firstChild?.nodeType === 8 && firstChild?.nodeValue === `bf-cond-start:${id}`) {
      // Switching from element to fragment. Move parsed nodes by
      // identity (see fragment branch above) so nested slot nodes keep
      // their event/effect bindings (#1213).
      const parent = condEl.parentNode
      let n: ChildNode | null = parsed.firstChild
      while (n) {
        const next: ChildNode | null = n.nextSibling
        parent?.insertBefore(n, condEl)
        n = next
      }
      condEl.remove()
    } else if (firstChild) {
      // Replace the existing conditional element with the parsed root
      // by reference; cloning would re-clone any slot nodes nested
      // inside `firstChild` and break identity preservation (#1213).
      condEl.replaceWith(firstChild)
    }
  }
}

/**
 * Update element conditional (single element with bf-c)
 */
function updateElementConditional(region: CondRegion, id: string, result: BranchTemplateResult): void {
  // findCondTarget, not find(): for a comment-scope proxy it resolves a
  // top-level sibling conditional the same way first hydration does, but
  // for a regular scope it's a plain scope.querySelector(...) — not
  // find()'s belongsToScope-gated search, which requires scope itself to
  // carry bf-s (a mapArray loop item's cloned root usually doesn't; see
  // findCondTarget's doc comment in query.ts).
  const condEl = region.anchor
    ? findCondElInRange(region.anchor, id)
    : findCondTarget(region.bindScope, `[${BF_COND}="${id}"]`)
  if (!condEl) return

  const { html, slots } = result
  const insertParent = (condEl.parentNode instanceof Element)
    ? condEl.parentNode
    : null
  const fragment = spliceSlots(parseHTML(html, insertParent), slots)
  const newEl = fragment.firstChild
  if (newEl) {
    // Move `newEl` into the DOM by identity. The fragment is discarded
    // after this call, so cloning would only serve to break identity
    // for any slot nodes nested inside `newEl` (#1213).
    condEl.replaceWith(newEl)
  }
}
