/**
 * BarefootJS - Component Creation
 *
 * Functions for dynamically creating component instances at runtime.
 * Used by mapArray()/mapArrayAnchored() when rendering components in loops.
 */

import { getTemplate } from './template.ts'
import { getComponentInit } from './registry.ts'
import { getRegisteredDef } from './hydrate.ts'
import { hydratedScopes } from './hydration-state.ts'
import { untrack } from '@barefootjs/client/reactive'
import { setCurrentScope } from './context.ts'
import { commentScopeRegistry } from './scope.ts'
import {
  BF_SCOPE,
  BF_KEY,
  BF_HOST,
  BF_AT,
  BF_PARENT_SCOPE_PLACEHOLDER,
  BF_PLACEHOLDER,
  BF_SCOPE_COMMENT_PREFIX,
  BF_SCOPE_COMMENT_END_PREFIX,
} from '@barefootjs/shared'
import type { ComponentDef } from './types.ts'

// Parent scope ID context for renderChild() inside insert() branch templates.
// When set, renderChild uses the parent's scope ID as prefix instead of a random ID,
// producing scope IDs consistent with SSR (e.g., "ParentName_abc_s5" instead of
// "Button_random_s5"). This enables $cSingle's getDualScopeIds check to pass.
// Set by insert() before calling branch.template(), cleared after.
let _parentScopeId: string | null = null

export function setParentScopeId(id: string | null): void {
  _parentScopeId = id
}

/**
 * Where `mapArray` wants a fresh loop row connected before its `init` runs.
 *
 * `mounted` is written back by `mountRowRoot` so the caller can undo the
 * connection if the rest of the row's body then throws — see `createItemScope`.
 * Without it a half-built row stays visible, which detached rows never did.
 */
export type RowMountPoint = { container: Node; anchor: Node | null; mounted?: Element | null }

// Ambient mount point for a loop row.
//
// A loop row created by `renderItem` has no placeholder to replace, so it
// cannot use `mountAt` and its `init` runs detached (see the known-limitation
// docstring in `__tests__/runtime/csr-loop-row-init-connected.test.ts`).
// `mapArray` sets this around the `renderItem` call so the OUTERMOST
// `createComponent` inside it connects the row at `container`/`anchor` before
// running `init` — same guarantee `mountAt` gives the child-slot path.
//
// Consumed once (take-and-clear) so nested `createComponent` calls made from
// the row's own init don't re-use the row's mount point.
//
// `setRowMountPoint` returns the previous value so a caller can restore it
// instead of clearing to `null`. That matters because the ambient is a single
// slot: a row whose own `init` drives a nested `mapArray` would otherwise have
// the inner list's teardown blank out an outer mount point that had not been
// consumed yet. Save-and-restore makes the slot behave like a stack without
// paying for one.
let _rowMountPoint: RowMountPoint | null = null

export function setRowMountPoint(p: RowMountPoint | null): RowMountPoint | null {
  const prev = _rowMountPoint
  _rowMountPoint = p
  return prev
}

function takeRowMountPoint(): RowMountPoint | null {
  const p = _rowMountPoint
  _rowMountPoint = null
  return p
}

/**
 * Connect a loop row whose root is a template clone, before the emitted
 * renderItem body's tail runs.
 *
 * The tail is where the row's nested children initialise (`upsertChild` and
 * friends), and `useContext` resolves by walking `parentElement` — so a child
 * that inits inside a detached row finds no ancestors and falls through to the
 * global last-writer-wins context store, reading whichever provider on the page
 * wrote last. `createComponent` row roots already avoid this by consuming the
 * same ambient (step 7b); a clone root has no runtime function in the middle,
 * so the compiler emits this call for it instead.
 *
 * Take-and-clear, like the `createComponent` path: a nested `createComponent`
 * driven by this row's own children must not re-use the row's mount point.
 *
 * No-op when there is no ambient point — the hydration branch never calls this
 * (its row came from SSR markup and is already in the document), and a loop
 * runtime that does not hand one down leaves the row exactly as it was.
 */
export function mountRowRoot(el: Element): Element {
  const p = takeRowMountPoint()
  if (p) {
    p.container.insertBefore(el, p.anchor)
    // Record it so the row can be un-mounted if the body throws after this.
    p.mounted = el
  }
  return el
}

/**
 * Create a component instance with DOM element and initialized state.
 *
 * This function:
 * 1. Gets the template function for the component
 * 2. Generates HTML from props using the template
 * 3. Creates DOM element from HTML
 * 4. Sets scope ID and key attributes
 * 5. Initializes the component (attaches event handlers, sets up effects)
 *
 * @param name - Component name (e.g., 'TodoItem')
 * @param props - Props to pass to the component
 * @param key - Optional key for list reconciliation
 * @param slot - Slot-relationship markers stamped as `bf-h` / `bf-m`
 * @param mountAt - Placeholder this component replaces. When given, the
 *   element is connected to the document *before* `init` runs — see
 *   "Connect before init" below.
 * @returns Created DOM element
 *
 * @example
 * const el = createComponent('TodoItem', {
 *   todo: { id: 1, text: 'Buy milk', done: false },
 *   onDelete: () => handleDelete(1)
 * }, 1)
 */
/**
 * Create a component instance from a string name (SSR mode, uses registry)
 * or from a ComponentDef (CSR mode, no registry needed).
 */
/**
 * Slot-relationship metadata stamped onto a freshly-created component as
 * `bf-h` / `bf-m`. Top-level CSR mounts pass no `slot` — they own their
 * own hydration lifecycle and `initChild` re-binds callbacks freely on
 * each reconcile.
 */
export interface CreateComponentSlotInfo {
  /** Host scope id (this child's `bf-h` value). */
  parent: string
  /** Slot id in the host (this child's `bf-m` value). */
  mount: string
}

/**
 * The `HTMLElement | DocumentFragment` return covers exactly one shape: a
 * BARE call (no `mountAt`, no ambient row-mount point) for a genuine
 * fragment-root component (#2722). Every other combination — a normal
 * component, or a fragment-root one with `mountAt`/row-mount already
 * telling this function where to connect — still returns the real,
 * single `HTMLElement`, unchanged (that element stays the caller-visible
 * proxy even when the fragment root has further sibling roots of its own
 * — #2735 — those travel alongside it, never in place of it). Only the
 * no-known-destination case has no single element to hand back: the
 * fragment root's own `<!--bf-scope:-->` boundary comments PLUS every
 * top-level node the fragment's template rendered — elements, bare text
 * and `<!--bf:sN-->` slot markers alike (`materializeComponent` step 7b)
 * — must travel to wherever the caller inserts the result, and a
 * `DocumentFragment` is the one `Node` a plain `container.appendChild(...)`
 * / `el.replaceWith(...)` moves as a unit without the caller needing to
 * know why.
 *
 * The first overload states that in the type system rather than only here:
 * a call that passes a non-null `mountAt` is telling this function where to
 * connect, so it can only get the real `HTMLElement` back. Callers on that
 * overload need no cast, which is why `upsertChild` (registry.ts) and
 * `upsertChildItem` (qsa-item.ts) assert nothing — the narrowing is the
 * signature's job, not theirs.
 */
export function createComponent(
  nameOrDef: string | ComponentDef,
  props: Record<string, unknown>,
  key: string | number | undefined,
  slot: CreateComponentSlotInfo | undefined,
  mountAt: Element,
  keyAttrName?: string,
): HTMLElement
export function createComponent(
  nameOrDef: string | ComponentDef,
  props?: Record<string, unknown>,
  key?: string | number,
  slot?: CreateComponentSlotInfo,
  mountAt?: Element | null,
  keyAttrName?: string,
): HTMLElement | DocumentFragment
export function createComponent(
  nameOrDef: string | ComponentDef,
  props: Record<string, unknown> = {},
  key?: string | number,
  slot?: CreateComponentSlotInfo,
  mountAt?: Element | null,
  keyAttrName: string = BF_KEY,
): HTMLElement | DocumentFragment {
  const element = materializeComponent(nameOrDef, props, key, slot, mountAt, keyAttrName)
  // `mountAt` is an unconditional obligation: callers used to run
  // `ph.replaceWith(comp)` themselves on every outcome, so every path that
  // did NOT consume the placeholder still owes the replacement — a missing or
  // empty template (either mode), and the root-deferred-placeholder shape,
  // which must stay detached so its self-replacement stays recoverable.
  // `parentNode` (not `isConnected`) is the right "still unconsumed" probe: it
  // survives a `mountAt` that was itself detached, which is the normal case
  // during multi-root loop-body setup. A fragment-root's `DocumentFragment`
  // return only ever happens when `mountAt` is absent (see above), so it
  // never reaches this branch.
  if (mountAt && mountAt.parentNode && element !== mountAt) {
    mountAt.replaceWith(element)
  }
  return element
}

/**
 * Build the element, connect it at `mountAt` when there is one, and run
 * `init` — in that order, which is the whole point (see step 7b).
 *
 * Named "materialize" rather than anything with "unmounted" in it because it
 * DOES mount: the connect has to happen inside, before `init`, and only the
 * paths that cannot consume the placeholder leave that to `createComponent`.
 */
function materializeComponent(
  nameOrDef: string | ComponentDef,
  props: Record<string, unknown> = {},
  key?: string | number,
  slot?: CreateComponentSlotInfo,
  mountAt?: Element | null,
  keyAttrName: string = BF_KEY,
): HTMLElement | DocumentFragment {
  // A bare callable shim invoked from user code (e.g. an object-literal
  // value `LOGOS[id]()` whose arrow the compiler hoisted into a component)
  // reaches us with no props (#1663). Normalize to an empty object so the
  // descriptor probes below don't throw on `undefined`.
  if (props == null) props = {}
  // Take the row mount point BEFORE any template eval / init can run, so the
  // outermost call for the row is the only one that can consume it.
  const rowMount = mountAt ? null : takeRowMountPoint()
  // ComponentDef mode: use def directly instead of registry lookup
  if (typeof nameOrDef !== 'string') {
    return createComponentFromDef(nameOrDef, props, key, mountAt, rowMount, keyAttrName)
  }

  const name = nameOrDef

  // 1. Get template function
  const templateFn = getTemplate(name)
  if (!templateFn) {
    console.warn(`[BarefootJS] Template not found for component: ${name}`)
    return createPlaceholder(name, key, keyAttrName)
  }

  // 2. Check for getter children.
  // Children defined via a getter are evaluated AFTER initFn so that context
  // providers set up by the parent are available when children are created.
  const childrenDescriptor = Object.getOwnPropertyDescriptor(props, 'children')
  const childrenIsGetter = childrenDescriptor != null && typeof childrenDescriptor.get === 'function'

  // 3. Evaluate props for template HTML generation, skipping the children getter.
  // Use untrack() so signal reads don't contaminate the caller's effect tracking.
  const unwrappedProps = untrack(() => {
    const result: Record<string, unknown> = {}
    for (const k of Object.keys(props)) {
      if (k === 'children' && childrenIsGetter) {
        result.children = '' // Deferred — will be inserted after initFn
        continue
      }
      const descriptor = Object.getOwnPropertyDescriptor(props, k)
      if (descriptor && typeof descriptor.get === 'function') {
        result[k] = descriptor.get()
      } else {
        result[k] = props[k]
      }
    }
    // Template functions expect children as an HTML string, not an array.
    if (Array.isArray(result.children) && !hasDomElements(result.children)) {
      result.children = (result.children as unknown[])
        .flat()
        .map(c => c == null ? '' : String(c))
        .join('')
    }
    return result
  })

  // 4. Pre-generate the component's scope ID.
  //
  // `comment: true` components are proxy-scoped — no element of their own
  // carries `bf-s` directly — but that covers TWO different shapes
  // (`ComponentDef.fragmentRoot`'s docstring, types.ts) that need OPPOSITE
  // treatment here:
  //   - root-is-a-child-call (#1211/#2649, `fragmentRoot` false): the
  //     parsed `firstChild` IS the child's own already-scoped element.
  //     Don't overwrite it (scopeId stays null), or `$c(__scope, 's0')`
  //     from the wrapper's init resolves to null.
  //   - genuine fragment root (`fragmentRoot` true): the parsed `firstChild`
  //     carries NO scope of its own (SSR moves it into the wrapping
  //     `<!--bf-scope:-->` comment) — generate one just the same, so
  //     `_parentScopeId` below still gets threaded into nested
  //     `renderChild()` calls and their naming matches SSR/hydrate (#2722:
  //     leaving this null made every nested child fall back to a random,
  //     un-prefixed scope id — `Select_xyz` instead of the expected
  //     `SelectBasicDemo_xyz_s8`).
  //
  // `slot` is only supplied by `upsertChild` / `upsertChildItem` mounting a
  // component nested below a loop row root — the SSR reference (Hono)
  // derives that child's `bf-s` from `${hostScope}_${mountSlot}` rather
  // than randomizing it (#2444), so CSR must match or the primary
  // `(bf-h, bf-m)` SSR-scope lookup never finds the CSR-created element.
  // A row root itself is never passed a `slot`, so it keeps its own
  // random id, matching the reference behaviour.
  const def = getRegisteredDef(name)
  const isCommentWrapper = def?.comment === true
  const isFragmentRoot = def?.fragmentRoot === true
  const derivedScopeId = slot?.parent && slot.mount ? `${slot.parent}_${slot.mount}` : null
  // Same as in `renderChild`: `name` is the registry key, which is
  // file-scoped (`Name__<8hex>`) for a non-exported component. The scope ID
  // must carry the plain name — see `ComponentDef.name` (#2518).
  const scopeId = (isCommentWrapper && !isFragmentRoot) ? null : (derivedScopeId ?? `${def?.name ?? name}_${generateId()}`)

  // 5. Generate HTML from props.
  //
  // Thread the component's own scope ID into `_parentScopeId` for the
  // template eval so renderChild() stamps parent-prefixed bf-s / bf-h /
  // bf-m on child components — matching the SSR convention so a later
  // `$c(scope, 'sN')` lookup resolves them. Without this, CSR-created
  // children carry a random prefix and their event handlers never wire
  // up (#1627). `scopeId` takes precedence over `slot.parent` — once a
  // slotted component derives its OWN scope id (above), that derived id
  // is what ITS children must nest under, not the grandparent's `slot.parent`
  // (that used to collapse a third composition level back onto the second,
  // #2444's `grandchild-composition` case). A comment wrapper keeps
  // `scopeId === null` and falls through to `slot?.parent`, preserving the
  // hoisted-children placeholder resolution (#1320).
  //
  // Third branch (#2757): a root-is-a-child-call wrapper mounted at the TOP
  // LEVEL has neither. `scopeId` is null by design (step 4 — the parsed
  // firstChild is the child's own already-scoped element, so we must not
  // stamp over it) and a top-level `createComponent(name, {})` is passed no
  // `slot`, so pre-#2757 `_parentScopeId` stayed null for the whole template
  // eval and `renderChild` fell back to naming the child after ITSELF
  // (`PairwiseRow_xyz_s2` where SSR and hydration both produce
  // `PairwiseCase_xyz_s2`, and with no `bf-h`/`bf-m` at all). The wrapper
  // still HAS a scope identity in the SSR convention — it just has no
  // element of its own to carry it — so derive one here for threading only.
  // Same split #2722 made for a genuine fragment root, which keeps a
  // non-null `scopeId` purely so this threading works and skips only the
  // ATTRIBUTE write in step 7.
  //
  // Why not derive unconditionally: guarded on `!_parentScopeId` so a
  // wrapper materialized while an OUTER template eval is in flight keeps
  // inheriting that caller's ambient scope rather than being renamed under a
  // fresh random id. Only the genuinely-rootless mount is affected.
  const prevParentScopeId = _parentScopeId
  if (scopeId) {
    _parentScopeId = scopeId
  } else if (slot?.parent) {
    _parentScopeId = slot.parent
  } else if (!_parentScopeId) {
    _parentScopeId = `${def?.name ?? name}_${generateId()}`
  }
  let html: string
  try {
    html = templateFn(unwrappedProps)
  } finally {
    _parentScopeId = prevParentScopeId
  }

  // 6. Create DOM node(s).
  //
  // A genuine fragment root's template concatenates EVERY top-level
  // sibling into one HTML string, so `roots` is the whole ordered list —
  // `parseHTML(...).firstChild` used to be the only node kept, silently
  // dropping the rest (#2735). Everything travels, whatever its node
  // type: a fragment's top level is not only elements. Bare text between
  // two element roots (`<><h1/>text<p/></>`) is a root, and a reactive
  // text slot sitting there renders as a `<!--bf:sN-->` marker. Both were
  // measured being dropped by an element-only walk — the text as a
  // visible SSR/CSR-mount diff, the marker as something worse, since the
  // runtime's own slot lookup then finds nothing to bind.
  //
  // `element` is the PROXY: the one node threaded through init /
  // `commentScopeRegistry` / the return value. It must be an Element —
  // everything downstream calls `setAttribute`/`hasAttribute` on it — so
  // it is the first ELEMENT among the roots, not simply the first node.
  // `<>text<p/></>` puts a Text node first, and taking that as the proxy
  // threw `element.hasAttribute is not a function` at step 7b (measured;
  // pre-dates #2735's fix, which is why the roots list and the proxy are
  // chosen separately rather than the proxy being `roots[0]`).
  //
  // Only `isFragmentRoot` templates can emit more than one top-level node
  // (jsx-to-ir.ts's `transformFragment`), so every other shape keeps
  // exactly the single-node list it always had.
  const parsedFragment = parseHTML(html.trim())
  const roots: Node[] = isFragmentRoot
    ? Array.from(parsedFragment.childNodes)
    : parsedFragment.firstChild
      ? [parsedFragment.firstChild]
      : []
  const element = (isFragmentRoot
    ? roots.find(node => node.nodeType === Node.ELEMENT_NODE)
    : roots[0]) as HTMLElement | undefined

  // A fragment root with no element at all (`<>just text</>`) has nothing
  // that can carry a scope. Refuse it the same way an empty template is
  // refused rather than crashing on the first `setAttribute` — loud, not
  // silent, per the sound-or-loud rule.
  if (isFragmentRoot && roots.length > 0 && !element) {
    console.warn(
      `[BarefootJS] Fragment-root component ${name} rendered no element root; ` +
        'a scope needs at least one element to attach to. Wrap the content in an element.',
    )
    return createPlaceholder(name, key, keyAttrName)
  }

  if (!element) {
    console.warn(`[BarefootJS] Template returned empty HTML for component: ${name}`)
    return createPlaceholder(name, key, keyAttrName)
  }

  // 7. Set scope ID and key attributes.
  //
  // A genuine fragment root carries its scope id on a WRAPPING comment
  // pair, never as a `bf-s` attribute on the element itself — matching
  // `wrapWithScopeComment` (hono-adapter.ts) and `hydrateCommentScope`
  // (hydrate.ts). `scopeId` is still non-null for this shape (step 4) so
  // `_parentScopeId` threads correctly; only the ATTRIBUTE is skipped here.
  if (scopeId && !isFragmentRoot) {
    element.setAttribute(BF_SCOPE, scopeId)
  }
  if (slot) {
    if (slot.parent) element.setAttribute(BF_HOST, slot.parent)
    element.setAttribute(BF_AT, slot.mount)
  }
  if (key !== undefined) {
    element.setAttribute(keyAttrName, String(key))
  }

  // 7a. Fragment-root boundary comments + registry (#2722).
  //
  // `find()`/`$()`/`$c()` (query.ts) resolve a slot or child scope by
  // walking `commentScopeRegistry`'s stored comment and its boundary
  // (`getCommentScopeBoundary`, scope.ts) — that walk needs REAL, sibling-
  // connected comment nodes, not just a registry entry, or `find()`'s
  // comment-scope branch enumerates zero candidates (worse than the
  // fallback `querySelectorAll` path a non-fragment scope gets). So these
  // are built now and threaded through to wherever `element` ends up
  // connected below, exactly mirroring the SSR/hydrate shape:
  //   <!--bf-scope:ID-->` + element + `<!--bf-/scope:ID-->`
  const fragmentComments = isFragmentRoot && scopeId
    ? {
        start: document.createComment(`${BF_SCOPE_COMMENT_PREFIX}${scopeId}`),
        end: document.createComment(`${BF_SCOPE_COMMENT_END_PREFIX}${scopeId}`),
      }
    : null
  if (fragmentComments) {
    commentScopeRegistry.set(element, { commentNode: fragmentComments.start, scopeId: scopeId! })
  }

  // 7b. Connect before init.
  //
  // `initFn` resolves context by DOM position (`useContext` walks
  // `parentElement` from the current scope) and may measure layout. Both
  // need this element to be in the document, so when the caller told us
  // which placeholder we replace, do the replacement NOW rather than
  // after init. Running init detached made `useContext` fall through to
  // the global, last-writer-wins context store, so a child materialised
  // after a sibling provider had run picked up the wrong provider's
  // value. This aligns the CSR path with the SSR one, where the
  // doc-order walker only ever inits elements already in the document
  // (`hydrate.ts`).
  //
  // A root-level deferred placeholder is excluded: its init replaces
  // `element` itself, which the block below recovers via a throwaway
  // wrapper. Connecting first would make that replacement happen in the
  // live DOM with no handle on the result, so this shape keeps the
  // detached behaviour.
  const rootIsDeferredPlaceholder = element.hasAttribute(BF_PLACEHOLDER)
  // A fragment root's boundary comments must land adjacent to `element`
  // at the SAME moment it connects, in each of the three shapes below —
  // there is no later hook to attach them once the caller has taken the
  // return value away (see `createComponent`'s docstring for the fourth,
  // no-known-destination shape, handled after `init` runs).
  let bareFragment: DocumentFragment | null = null
  if (mountAt && !rootIsDeferredPlaceholder) {
    if (fragmentComments) {
      mountAt.replaceWith(fragmentComments.start, ...roots, fragmentComments.end)
    } else {
      mountAt.replaceWith(element)
    }
  } else if (rowMount && !rootIsDeferredPlaceholder) {
    // Loop row: no placeholder exists, so connect at the position `mapArray`
    // handed down. The reorder step may move the row afterwards; any position
    // inside the container yields the same ancestor chain, which is all
    // `useContext`'s parentElement walk needs.
    if (fragmentComments) {
      rowMount.container.insertBefore(fragmentComments.start, rowMount.anchor)
      rowMount.container.insertBefore(element, rowMount.anchor)
      rowMount.container.insertBefore(fragmentComments.end, rowMount.anchor)
      // Hand the boundary pair to `mapArray`'s row bookkeeping (map-array.ts's
      // `ItemScope.scopeComments`, #2733) via the same stash-on-the-element
      // convention `__bfExtras` uses for a multi-root loop BODY's extra
      // siblings: `createItemScope` reads and deletes this property right
      // after `renderItem` returns, since there is no other channel back to
      // the caller once `element` is the only thing returned below. Without
      // this, a later reorder/removal of the row moves/removes `element`
      // and leaves the comments behind, orphaned in the container.
      ;(element as unknown as { __bfScopeComments?: { start: Comment; end: Comment } }).__bfScopeComments =
        fragmentComments
      // Deliberately NOT inserting the other roots here (a fragment-root
      // component whose OWN render has 2+ top-level nodes, used as a loop
      // row) — connecting them is a separate gap from the boundary-comment
      // tracking #2733 fixed above: even with `ItemScope` now able to carry
      // the row's comments, there is still nowhere on `ItemScope` for a
      // second or third top-level ELEMENT of the row itself (as opposed to
      // `extras`, which is the multi-root loop BODY's own, unrelated,
      // per-item marker convention). Not reachable by any currently tracked
      // fixture (no fragment-root component with 2+ top-level nodes is used
      // as a loop row in the mutation corpus), so declared rather than grown
      // here:
      // https://github.com/piconic-ai/barefootjs/issues/2733
      //
      // Loud, not silent: the whole point of the fix above is that
      // dropping roots without saying so is the failure mode. A gap that
      // stays quiet is indistinguishable from correctness at the call
      // site, so the one shape still dropping them says so.
      if (roots.length > 1) {
        console.warn(
          `[BarefootJS] Fragment-root component ${name} used as a loop row renders ` +
            `${roots.length} top-level nodes; only the first element is connected here. ` +
            'See https://github.com/piconic-ai/barefootjs/issues/2733',
        )
      }
    } else {
      rowMount.container.insertBefore(element, rowMount.anchor)
    }
  } else if (fragmentComments && !rootIsDeferredPlaceholder) {
    // Neither a placeholder nor an ambient row position: the caller owns
    // connecting the result itself (e.g. the compiler's exported
    // `export function Name(props, key) { return createComponent(...) }`
    // shim, called directly with no further composition — the shape
    // `fixture-host.ts`'s `'csr-mount'` boot script uses). Bundle every
    // node in one `DocumentFragment` so a plain `container.append(result)`
    // / `el.replaceWith(result)` moves all of them together —
    // `createComponent`'s docstring covers why this is the one shape that
    // can't return a bare `HTMLElement`.
    bareFragment = document.createDocumentFragment()
    bareFragment.append(fragmentComments.start, ...roots, fragmentComments.end)
  }

  // 8. Set currentScope so provideContext/useContext are element-scoped.
  // This allows context providers in initFn to store context on this element.
  const prevScope = setCurrentScope(element)

  // 8b. Root-level deferred child (dropped-prop fix): a comment-wrapper
  // parent whose entire render is a single deferred child renders as a
  // bare `data-bf-ph` placeholder. The parent's init calls
  // `upsertChild(__scope, ...)` which replaces the placeholder via
  // `replaceWith` — but a detached root node can't replace itself in
  // place. Park it in a throwaway wrapper so the replacement lands
  // somewhere we can recover, then return the materialised child.
  let placeholderWrapper: HTMLElement | null = null
  if (rootIsDeferredPlaceholder) {
    placeholderWrapper = parseHTML('<div></div>').firstChild as HTMLElement
    placeholderWrapper.appendChild(element)
  }

  // 9. Initialize the component (context providers set up here).
  const initFn = getComponentInit(name)
  if (initFn) {
    // Pass original props (with getters) for reactivity. For a root
    // deferred placeholder, init's `upsertChild(element, ...)` matches the
    // placeholder element itself and replaces it inside the wrapper.
    initFn(element, props)
  }

  if (rootIsDeferredPlaceholder && placeholderWrapper) {
    const materialised = placeholderWrapper.firstElementChild as HTMLElement | null
    if (materialised && !materialised.hasAttribute(BF_PLACEHOLDER)) {
      // The deferred child was created in place of the placeholder.
      // `materialised` is the child's OWN element, created via
      // upsertChild -> createComponent, which already marked itself
      // hydrated with its own props. We must NOT re-run this function's
      // own registration steps on it here — that would re-run the
      // *parent's* init on an element whose placeholder is already gone
      // and could not re-materialise. So just restore the scope and
      // return the already-registered child.
      // (Parent-scope effects are unaffected: createEffect ownership lives
      // in the EffectContext tree, not the discarded placeholder element.)
      setCurrentScope(prevScope)
      return materialised
    }
    // Placeholder was not replaced (no init / no matching child): fall
    // through with the original placeholder element detached from wrapper.
    placeholderWrapper.removeChild(element)
  }

  // 10. Evaluate getter children and insert them.
  // Children are evaluated NOW (after initFn) so that context provided by
  // the parent is in the global store when children call useContext().
  if (childrenIsGetter) {
    const children = untrack(() => childrenDescriptor!.get!())
    if (children != null) {
      insertGetterChildren(element, children)
    }
  }

  // 11. Restore previous scope
  setCurrentScope(prevScope)

  // 12. Mark element as initialized
  hydratedScopes.add(element)

  // `bareFragment` bundles `element` with its boundary comments for the
  // one shape with no known destination (7b) — everything else returns
  // the real, single element unchanged.
  return bareFragment ?? element
}

/**
 * Splice `attrs` (e.g. ` data-key="1"`) onto `html`'s first element's own
 * tag, wherever that tag starts (templates may open with comment markers
 * like `<!--bf-cond-start:...-->` before the first real element). No-op —
 * returns `html` unchanged — if no element tag is found at all.
 */
/**
 * A tag name is not `\\w+`: custom elements are required to contain a
 * hyphen (`<my-widget>`), and `.` and `:` are legal too. Matching only
 * `[A-Za-z0-9_]` spliced attributes into the MIDDLE of such a name
 * (`<my bf-s="…"-widget>`), which the parser then drops entirely — while
 * SSR, which places the same attributes as a compiler-emitted JSX spread,
 * kept emitting them correctly. Anchored on a leading letter so the
 * comment markers a template may open with (`<!--bf-cond-start:…-->`) are
 * still skipped rather than matched.
 */
const FIRST_TAG_PATTERN = /<([a-zA-Z][^\s/>]*)/
const TAG_HEAD_PATTERN = /^(<[a-zA-Z][^\s/>]*)/

function spliceAttrsAfterFirstTag(html: string, attrs: string): string {
  const firstElMatch = html.match(FIRST_TAG_PATTERN)
  if (!firstElMatch) return html
  const insertPos = firstElMatch.index!
  return html.slice(0, insertPos) + html.slice(insertPos).replace(TAG_HEAD_PATTERN, `$1${attrs}`)
}

/**
 * Render a child component's template to an HTML string.
 * Used by compiler-generated template functions when a stateless component
 * appears inside a conditional branch or loop template.
 *
 * If the component has a registered template, it renders the HTML and injects
 * a bf-s scope attribute. Otherwise, falls back to an empty placeholder.
 *
 * @param name - Component name (e.g., 'Spinner')
 * @param props - Props to pass to the template
 * @param key - Optional key for list reconciliation
 * @returns HTML string with scope marker
 */
export function renderChild(
  name: string,
  props: Record<string, unknown>,
  key?: string | number,
  slotSuffix?: string
): string {
  const templateFn = getTemplate(name)
  const suffix = slotSuffix ? `_${slotSuffix}` : ''
  // When inside an insert() branch template with a known parent scope,
  // use the parent scope ID so child scope IDs match the SSR convention
  // (e.g., ~ParentName_parentHash_s5 instead of ~Button_randomHash_s5).
  // This enables $cSingle's getDualScopeIds verification to pass.
  // `name` here is the REGISTRY KEY, which for a non-exported component is
  // file-scoped (`Name__<8hex>`) to stop two private same-named components
  // colliding. That disambiguator must not reach `bf-s`: the scope ID is a
  // documented contract (`Name_abc123`) that the SSR adapters emit and
  // `integrations/shared/e2e/toggle.spec.ts` asserts. The def carries the
  // plain name for exactly this — see `ComponentDef.name`, "Used for scope
  // ID generation" (#2518).
  const def = getRegisteredDef(name)
  const displayName = def?.name ?? name
  // A genuine fragment-root child (#2722) carries NO `bf-s`/`bf-h`/`bf-m`
  // element attributes at all — SSR moves them into a wrapping
  // `<!--bf-scope:-->` comment instead (`wrapWithScopeComment`, hono-
  // adapter.ts). Below, `isFragmentRoot` skips the attribute-splicing path
  // entirely and wraps the child's markup in the same comment shape —
  // otherwise every fragment-root child rendered inline by a PARENT's own
  // template (as opposed to a fresh top-level `createComponent()` mount,
  // `materializeComponent`'s equivalent fix) kept stamping `bf-s` onto an
  // element the SSR/hydrate reference never puts one on.
  const isFragmentRoot = def?.fragmentRoot === true
  const scopePrefix = (_parentScopeId && slotSuffix)
    ? _parentScopeId
    : `${displayName}_${generateId()}`
  const scopeId = `${scopePrefix}${suffix}`
  const keyAttr = key !== undefined ? ` ${BF_KEY}="${key}"` : ''
  // Slot-relationship markers — only emitted when both host and slot are
  // known; top-level renders without parent context omit them.
  const slotAttrs = (_parentScopeId && slotSuffix)
    ? ` ${BF_HOST}="${_parentScopeId}" ${BF_AT}="${slotSuffix}"`
    : ''
  const bfsAttr = `${BF_SCOPE}="${scopeId}"`

  if (!templateFn) {
    // No template registered: same empty-shell fallback either way, but a
    // fragment-root child still gets its comment pair instead of `bf-s` —
    // an empty `<div></div>` with no scope marker at all would be
    // unfindable by any later `$c()` lookup.
    return isFragmentRoot
      ? `<!--${BF_SCOPE_COMMENT_PREFIX}${scopeId}--><div></div><!--${BF_SCOPE_COMMENT_END_PREFIX}${scopeId}-->`
      : `<div ${bfsAttr}${slotAttrs}${keyAttr}></div>`
  }

  // Push `_parentScopeId` to THIS child's own derived scope while its
  // `templateFn` evaluates, so a grandchild rendered inside it derives its
  // scope from THIS scope rather than the caller's (#2649). Without this a
  // third composition level collapses onto the second: with `_parentScopeId`
  // left at the caller's id, a grandchild whose slot suffix happens to match
  // this child's OWN slot suffix computes the exact same string as this
  // child's bf-s (`grandchild-composition`'s `test_s0` reused instead of
  // deriving `test_s0_s0`). Restored via `finally` so a sibling rendered
  // after this call (or the caller's own remaining template) sees the
  // original `_parentScopeId`, matching the caller-restore discipline
  // `materializeComponent` already uses around its own `templateFn` call.
  const prevParentScopeId = _parentScopeId
  _parentScopeId = `${scopePrefix}${suffix}`
  let raw: string
  try {
    raw = templateFn(props)
  } finally {
    _parentScopeId = prevParentScopeId
  }

  // The placeholder substitution is anchored to the exact `bf-s="…"`
  // shape so user content that contains the sentinel as text survives
  // unchanged. When `_parentScopeId` is null (top-level render) the
  // attribute strips rather than emitting `bf-s=""`. (#1320)
  let html = raw.trim().replace(
    PLACEHOLDER_ATTR_PATTERN,
    _parentScopeId ? ` bf-s="${_parentScopeId}"` : '',
  )

  // Fragment-root child (#2722): wrap the whole rendered markup in the
  // SSR/hydrate boundary-comment shape instead of splicing `bf-s`/`bf-h`/
  // `bf-m` into a first element that, structurally, owns none of them —
  // `wrapWithScopeComment`'s CSR mirror, same as `materializeComponent`'s
  // fix for a top-level mount.
  if (isFragmentRoot) {
    const hostSuffix = (_parentScopeId && slotSuffix) ? `|h=${_parentScopeId}|m=${slotSuffix}` : ''
    // #2732: `data-key` for a fragment-root loop row lands on the row's own
    // first element — the same "first element, not first node" convention
    // `IRElement.keyAttr` uses on the SSR side (jsx-to-ir.ts) — not on the
    // comment above, which carries scope identity only. This keeps
    // `mapArray`'s existing `primaryEl.dataset.key` read (map-array.ts)
    // working unchanged for markup this function pre-builds (the pure-CSR
    // `materializeComponent` template-string path, used when there is no
    // SSR content to hydrate against).
    const keyedHtml = keyAttr ? spliceAttrsAfterFirstTag(html, keyAttr) : html
    return `<!--${BF_SCOPE_COMMENT_PREFIX}${scopeId}${hostSuffix}-->${keyedHtml}<!--${BF_SCOPE_COMMENT_END_PREFIX}${scopeId}-->`
  }

  // Templates may start with comment markers (e.g. <!--bf-cond-start:...-->)
  // so we find the first element tag rather than assuming index 0.
  const firstElMatch = html.match(FIRST_TAG_PATTERN)
  if (!firstElMatch) return html
  const insertPos = firstElMatch.index!
  // Dedupe `bf-s` only when the template body's root already carries
  // one (the body was itself a renderChild call). Still inject
  // `slotAttrs` / `keyAttr` — `data-key` is the reconciliation
  // contract `mapArray` reads, and `bf-h` / `bf-m` mark child
  // membership in the parent scope. (#1320)
  const afterInsert = html.slice(insertPos)
  const extraAttrs = `${slotAttrs}${keyAttr}`
  if (ROOT_HAS_BFS_PATTERN.test(afterInsert)) {
    if (!extraAttrs) return html
    return html.slice(0, insertPos) +
      afterInsert.replace(TAG_HEAD_PATTERN, `$1${extraAttrs}`)
  }
  return html.slice(0, insertPos) +
    afterInsert.replace(TAG_HEAD_PATTERN, `$1 ${bfsAttr}${extraAttrs}`)
}

// The leading `\s+` is part of the match so dropping the attribute
// doesn't leave a dangling space; the compiler always emits the
// placeholder preceded by whitespace from an enclosing tag.
const PLACEHOLDER_ATTR_PATTERN = new RegExp(`\\s+bf-s="${BF_PARENT_SCOPE_PLACEHOLDER}"`, 'g')
const ROOT_HAS_BFS_PATTERN = /^<\w+[^>]*\sbf-s="/

/**
 * Generate a random ID for scope identification
 */
function generateId(): string {
  return Math.random().toString(36).slice(2, 8)
}

/**
 * Create a placeholder element when template is not found
 */
function createPlaceholder(name: string, key?: string | number, keyAttrName: string = BF_KEY): HTMLElement {
  const el = document.createElement('div')
  el.setAttribute(BF_SCOPE, `${name}_placeholder`)
  if (key !== undefined) {
    el.setAttribute(keyAttrName, String(key))
  }
  el.textContent = `[${name}]`
  el.style.cssText = 'color: red; border: 1px dashed red; padding: 4px;'
  return el
}

/**
 * Unwrap getter props to plain values for template rendering.
 * Template functions need actual values, not getter functions.
 *
 * @param props - Props object (may contain getters)
 * @returns Plain object with unwrapped values
 */
function unwrapPropsForTemplate(props: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {}

  for (const key of Object.keys(props)) {
    const descriptor = Object.getOwnPropertyDescriptor(props, key)

    if (descriptor && typeof descriptor.get === 'function') {
      // It's a getter - call it to get the value
      result[key] = descriptor.get()
    } else {
      // Regular property
      result[key] = props[key]
    }
  }

  // Template functions expect children as an HTML string, not an array.
  // Join non-DOM array children to avoid Array.toString() inserting commas.
  if (Array.isArray(result.children) && !hasDomElements(result.children)) {
    result.children = (result.children as unknown[])
      .flat()
      .map(c => c == null ? '' : String(c))
      .join('')
  }

  return result
}

/**
 * Escape ">" inside HTML attribute values to prevent broken parsing.
 * UnoCSS classes like has-[>svg]:shrink-0 contain ">" which terminates
 * the opening tag when parsed via innerHTML. The browser decodes &gt;
 * back to ">" in the DOM attribute value, preserving CSS matching.
 */
/**
 * Escape ">" inside HTML attribute values to prevent broken parsing.
 * UnoCSS classes like has-[>svg]:shrink-0 contain ">" which terminates
 * the opening tag when parsed via innerHTML. The browser decodes &gt;
 * back to ">" in the DOM attribute value, preserving CSS matching.
 */
export function escapeAttrGt(html: string): string {
  return html.replace(/"[^"]*"/g, match => match.replace(/>/g, '&gt;'))
}

/**
 * HTML-escape a single attribute *value* before it is concatenated into a
 * client-rendered template string. Matches the SSR adapters' attribute
 * escaping (Hono's `escapeToBuffer`: `& " ' < >`) so client-rendered DOM
 * is byte-identical to the server-rendered form and metacharacter-bearing
 * values (UnoCSS `[class*="size-"]`, `has-[>svg]`, …) don't corrupt
 * attribute parsing when the template is inserted via `innerHTML`. `&` is
 * replaced first so the emitted entities aren't themselves re-escaped.
 */
export function escapeAttr(value: unknown): string {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

/**
 * HTML-escape interpolated **text content** before it is concatenated into
 * a client-rendered template string (the `<!--bf:sN-->…<!--/-->` text
 * slots). The HTML spec only requires `& < >` in text, but the SSR
 * adapters (Hono) escape text with the same set as attribute values
 * (`& " ' < >`), and the fixture-hydrate / CSR-conformance layer requires
 * byte-parity with the server-rendered output — so the escaping delegates
 * to `escapeAttr`. Kept as a distinct export so generated code reads
 * `escapeText(...)` at text sites (self-documenting) and so the two
 * contexts can diverge (as they now do for nullish) without touching call
 * sites.
 *
 * A nullish value renders as empty text — the JSX/Solid semantics the Hono
 * SSR reference follows (`{undefined}` / `{null}` produce no text), and
 * what the reactive text-update path already does (`claim-slots.ts`'s
 * `writeText`/`writeMarkup` and `dynamic-text.ts` all `String(value ?? '')`).
 * Only this initial-render escape site used to stringify `undefined` /
 * `null` into literal "undefined" / "null" text, so a bare `{props.x}` on
 * an absent prop diverged from SSR at first paint (#2137). Non-nullish
 * values (including `0` and `false`) keep their `String()` form, matching
 * the reactive path.
 */
export function escapeText(value: unknown): string {
  if (value == null) return ''
  return escapeAttr(value)
}

/**
 * Brand carried by `bfMarkup()` — see that function's docstring. A string
 * key (not a `Symbol`) because the brand must survive `structuredClone`
 * (props cloned across an SSR seed / island-serialization boundary): a
 * symbol-keyed property is silently dropped by the structured-clone
 * algorithm, which would un-brand the value in transit.
 */
const BF_MARKUP_BRAND = '__bfMarkup'

/**
 * Shape produced by `bfMarkup()` (#2651). Compiler-emitted code only —
 * never construct one by hand from userland; doing so is exactly as unsafe
 * as writing raw `innerHTML` yourself, since `escapeTextOrMarkup` /
 * `escapeTextOrNode` (below) trust `__bfMarkup`'s contents to already be
 * safe-to-splice HTML and skip escaping it.
 */
export interface BfMarkup {
  readonly [BF_MARKUP_BRAND]: string
}

/**
 * Brand a compiler-built HTML string as pre-escaped markup safe to splice
 * raw into a template (#2651). The compiler emits this ONLY around HTML it
 * itself assembled from a JSX element passed at a non-`children` component
 * prop position (`header={<strong>Title</strong>}`) — every text segment
 * inside that assembly was already escaped node-by-node during the
 * assembly (the same `escapeHtml` / `escapeTextSlotExpr` calls
 * `html-template.ts` uses for ordinary element children), so the
 * concatenated result is exactly as safe as any other compiler-emitted
 * template fragment.
 *
 * Not exported from the public `@barefootjs/client` surface: this is
 * compiler-emitted-code only, exported solely from
 * `@barefootjs/client/runtime`. Calling it directly from userland to wrap
 * an arbitrary string is exactly as unsafe as assigning that string to
 * `innerHTML` yourself — the value is trusted verbatim by every consumer
 * below.
 */
export function bfMarkup(html: string): BfMarkup {
  return { [BF_MARKUP_BRAND]: html }
}

/** Type guard for the `bfMarkup()` brand (#2651). Compiler-emitted code only — see `bfMarkup`'s docstring. */
export function isBfMarkup(value: unknown): value is BfMarkup {
  if (typeof value !== 'object' || value === null) return false
  // Plain carrier objects only (Copilot review on #2651's PR): without the
  // prototype check, a DOM Node (or any host object) carrying a string
  // `__bfMarkup` expando would satisfy the shape test and be unwrapped as
  // raw HTML — the brand must stay mutually exclusive with the Node branch
  // of `escapeTextOrNode` by construction, not by property-name luck.
  const proto = Object.getPrototypeOf(value)
  if (proto !== Object.prototype && proto !== null) return false
  return typeof (value as Record<string, unknown>)[BF_MARKUP_BRAND] === 'string'
}

/**
 * `escapeText`'s counterpart for a claim-plan slot the compiler has
 * classified `kind: 'markup'` at STATIC/initial-render time
 * (`html-template.ts`'s `escapeTextSlotExpr`, gated on the same
 * `ctx.dynamicElements` membership `emit-reactive.ts` reads to pick the
 * writer kind for the REACTIVE side, below) — #2651. A `bfMarkup()`-branded
 * value is compiler-built HTML the compiler already escaped piecewise
 * while assembling it, and must reach the template raw, unescaped a second
 * time; anything else (plain string, number, nullish) gets the ordinary
 * `escapeText` treatment — this function is a strict superset of
 * `escapeText`'s behaviour for every non-branded value, so switching a
 * call site from one to the other never changes output unless the value
 * is actually branded.
 */
export function escapeTextOrMarkup(value: unknown): string {
  if (isBfMarkup(value)) return value[BF_MARKUP_BRAND]
  return escapeText(value)
}

/**
 * `escapeText`'s counterpart for a claimed 'markup' slot's REACTIVE write
 * (slot unification A3 follow-up), where the value is a plain-JS expression
 * that may resolve to either a string or a live `Node` (e.g. `{cond &&
 * logo(id)}`, a hoisted `renderNode` callback, #1213). `writeMarkup`
 * (`claim-slots.ts`) inserts a string via `<template>.innerHTML =`, which —
 * unlike the old `__bfText`'s plain `Text.nodeValue =` assignment — DOES
 * interpret HTML, so a raw un-escaped string is an injection/corruption
 * risk exactly where the initial SSR/CSR TEMPLATE already calls
 * `escapeText` on the same expression (`html-template.ts`'s
 * `escapeTextSlotExpr`). A live `Node`, by contrast, must pass through
 * untouched — `escapeText(node)` would stringify it to garbage, and
 * `writeMarkup`'s own `instanceof Node` check needs the real object to
 * splice in by identity. This is the single call every "dynamic JSX/text
 * slot, value may be a Node" emission site (`emit-reactive.ts`,
 * `stringify/loop-child-arm.ts`, `stringify/insert.ts`) wraps the value in
 * before handing it to a 'markup' writer — NOT the preamble-region case
 * (`stringify/loop.ts`), whose value is already-built HTML from a nested
 * compiled render and must stay unescaped.
 *
 * A `bfMarkup()`-branded value (#2651) — a component prop re-read on every
 * reactive re-run, e.g. `initChild`'s `get header() { return bfMarkup(...) }`
 * getter — is unwrapped to its raw string for the same reason a `Node` is
 * passed through untouched: the compiler already escaped its contents once
 * during assembly, so re-escaping it (or, worse, `String()`-stringifying
 * the wrapper object into `"[object Object]"`) would corrupt it. Checked
 * before the `Node` branch since the two shapes are mutually exclusive.
 */
export function escapeTextOrNode(value: unknown): string | Node {
  if (isBfMarkup(value)) return value[BF_MARKUP_BRAND]
  if (typeof Node !== 'undefined' && value instanceof Node) return value
  return escapeText(value)
}

const SVG_NS = 'http://www.w3.org/2000/svg'
const MATHML_NS = 'http://www.w3.org/1998/Math/MathML'

/** Synthetic wrap tag for a parent's namespace, or null when it's plain HTML. */
function namespaceWrapTagFor(parent: Element | null | undefined): 'svg' | 'math' | null {
  if (!parent) return null
  if (parent.namespaceURI === SVG_NS) return 'svg'
  if (parent.namespaceURI === MATHML_NS) return 'math'
  return null
}

/**
 * Parse an HTML string into a DocumentFragment, safely escaping ">" in
 * attribute values. All code that sets innerHTML on dynamic HTML should
 * use this instead of raw innerHTML assignment.
 *
 * When `parent` is provided and lives in the SVG or MathML namespace, the
 * markup is parsed under the matching foreign-content context by wrapping
 * it in `<svg>...</svg>` / `<math>...</math>`; the wrapper's children are
 * moved into the returned fragment so callers see the same shape as the
 * HTML path. Without this, dynamically-inserted SVG/MathML elements (e.g.,
 * a `<path>` in a conditional drag preview, or an `<mrow>` in a dynamic
 * equation) end up as `HTMLUnknownElement` in the xhtml namespace and the
 * SVG/MathML renderer ignores them. Surfaced by the Graph/DAG Editor block
 * (#135); ported to MathML in #1096.
 */
export function parseHTML(html: string, parent?: Element | null): DocumentFragment {
  const tpl = document.createElement('template')
  const escaped = escapeAttrGt(html)
  const wrapTag = namespaceWrapTagFor(parent)
  if (wrapTag) {
    tpl.innerHTML = `<${wrapTag}>${escaped}</${wrapTag}>`
    const wrapper = tpl.content.firstElementChild
    const frag = document.createDocumentFragment()
    if (wrapper) {
      while (wrapper.firstChild) frag.appendChild(wrapper.firstChild)
    }
    return frag
  }
  tpl.innerHTML = escaped
  return tpl.content
}

/**
 * Check if a value contains DOM elements (HTMLElement instances).
 */
function hasDomElements(value: unknown): boolean {
  if (value instanceof Element) return true
  if (Array.isArray(value)) return value.some(hasDomElements)
  return false
}


/**
 * Insert getter children into an element.
 * Unlike insertDomChildren, strings are parsed as HTML (not text nodes) because
 * getter children may return HTML strings from compiler-generated template literals
 * (e.g. `<span class="...">Required</span>`).
 * Arrays may contain a mix of DOM elements and HTML strings.
 */
function insertGetterChildren(element: HTMLElement, children: unknown): void {
  if (children instanceof Element) {
    element.appendChild(children)
  } else if (Array.isArray(children)) {
    for (const child of (children as unknown[]).flat()) {
      if (child instanceof Element) {
        element.appendChild(child)
      } else if (typeof child === 'string' && child.length > 0) {
        element.appendChild(parseHTML(child.trim()))
      } else if (typeof child === 'number') {
        element.appendChild(document.createTextNode(String(child)))
      }
    }
  } else if (typeof children === 'string' && (children as string).length > 0) {
    element.appendChild(parseHTML((children as string).trim()))
  } else if (typeof children === 'number') {
    element.appendChild(document.createTextNode(String(children)))
  }
}

/**
 * Create a component instance from a ComponentDef (CSR mode).
 * Does not use the component registry — the def is passed directly.
 */
function createComponentFromDef(
  def: ComponentDef,
  props: Record<string, unknown>,
  key?: string | number,
  mountAt?: Element | null,
  rowMount?: { container: Node; anchor: Node | null } | null,
  keyAttrName: string = BF_KEY,
): HTMLElement {
  if (!def.template) {
    throw new Error('[BarefootJS] createComponent with ComponentDef requires a template function')
  }

  // Generate HTML from template
  const unwrappedProps = unwrapPropsForTemplate(props)
  const html = def.template(unwrappedProps)

  // Create DOM element
  const element = parseHTML(html.trim()).firstChild as HTMLElement

  if (!element) {
    const el = document.createElement('div')
    el.textContent = '[ComponentDef]'
    el.style.cssText = 'color: red; border: 1px dashed red; padding: 4px;'
    return el
  }

  // Set scope ID and key
  const name = def.name || def.init.name?.replace(/^init/, '') || 'Component'
  const scopeId = `${name}_${generateId()}`
  element.setAttribute(BF_SCOPE, scopeId)
  if (key !== undefined) {
    element.setAttribute(keyAttrName, String(key))
  }

  // Connect before init, for the same reason the registry path does (see
  // `materializeComponent` step 7b): `def.init` may resolve context by DOM
  // position or measure layout, and neither works detached. Keeps `mountAt`
  // one contract across both modes instead of a registry-only guarantee.
  if (mountAt) {
    mountAt.replaceWith(element)
  } else if (rowMount) {
    rowMount.container.insertBefore(element, rowMount.anchor)
  }

  // Initialize
  def.init(element, props)

  // Mark as initialized
  hydratedScopes.add(element)

  return element
}
