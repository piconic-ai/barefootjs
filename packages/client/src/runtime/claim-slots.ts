/**
 * Claim-plan interpreter and claimed-slot primitives (slot unification
 * Steps A2/A3, `spec/slot-unification.md` §4/§5).
 *
 * This module is the ONE claim mechanism the spec's §4 target architecture
 * describes: a compile-time `ClaimPlan` (per-slot child-index paths from a
 * claim root down to the slot's anchor comment) is resolved ONCE — either
 * eagerly (`claimSlots`) or lazily on first write (`lazySlots`) — and every
 * later write goes through the held reference, never re-scanning the DOM.
 * As of A3 the compiler emits claim plans for every content slot; the
 * `patchSlotRange` and `updateClientMarker` mechanisms it superseded are
 * deleted. `$t`/text-effect writes and `__bfText` are ALSO superseded for
 * every emission site but one — see `dynamic-text.ts`'s docstring for the
 * one deliberately-deferred case (`emitDynamicTextUpdates`'s
 * `conditionalElems` path).
 *
 * Anchors are still the existing `<!--bf:sN-->…<!--/-->` marker pairs — SSR
 * bytes are unchanged in Step A (§5, §6) so the new client claims against
 * known-good SSR output. A path is only required to be valid AT THE MOMENT
 * OF CLAIM (§2): once a 'text' Text node or a 'markup' boundary pair is
 * held, subsequent writes never consult the path or the marker again, so a
 * sibling slot's later variable-length change cannot invalidate anything
 * already claimed.
 *
 * Kind contracts (mirroring the mechanisms being superseded — this is the
 * "one slot concept with an identity contract" of §4):
 *   - 'text': held ref is the Text node immediately after the anchor
 *     comment, CREATED if SSR emitted an empty value (`textNodeAfterComment`,
 *     exactly `$t`'s `tAfter` behavior). Writes are a `nodeValue` assignment
 *     — the Text node's identity never changes, which is the guarantee
 *     effect closures and `mapArray`'s same-key path rely on.
 *   - 'markup': held ref is BOTH boundary comments (start = anchor, end =
 *     the matching `<!--/-->` found by the same nesting-depth rule as
 *     `patchSlotRange`). A string write clears everything strictly between
 *     the boundaries and inserts freshly `<template>`-parsed HTML before
 *     the end comment; a `Node` write clears the range and splices the node
 *     in by identity (the `__bfText` live-Node case). The boundaries
 *     themselves are never removed — same "permanent range" contract as
 *     `patchSlotRange`. Because the end ref is already held, a write never
 *     needs to re-walk for nesting depth — only the CLAIM does.
 *
 * Warn-don't-guess (§4, "one ownership rule"): a path that fails to resolve
 * to its slot's own `bf:sN` comment — out of range, or shape drift where
 * the path now lands on some other node — falls back to a marker scan
 * within the claim root, using the same ownership rule as
 * `patchSlotRange`/`query.ts`'s `$t`: a `bf:sN` comment owned by a nested
 * `bf-s` scope (a child component's own same-numbered slot — ids are
 * assigned per component, so collisions are expected) is never a candidate.
 * If neither the path nor the fallback scan finds an owned marker, that one
 * slot is dropped with a `console.warn` and the rest of the plan still
 * claims — never guess a boundary, and never let one bad slot sink its
 * siblings. An EMPTY path (`[]`) skips straight to the scan without that
 * first warning — the compiler emits `path: []` deliberately when a slot's
 * position can't be statically pathed (slot unification A3), so a miss
 * there is expected, not drift; only a non-empty path that fails to resolve
 * signals a real shape mismatch worth warning about.
 *
 * Row-pristine lazy claim (§3(a)): `lazySlots` touches NOTHING until the
 * first write, and that first write claims the WHOLE plan at once (not just
 * the slot being written) — so no earlier write into one slot can shift a
 * sibling slot's still-unclaimed path out from under it. A row that never
 * updates never pays for a claim at all. `claimSlots` is the eager escape
 * hatch for callers that cannot honor that invariant (streaming/portal
 * paths that mutate row content before any write would occur, per §6's
 * risk note) — it claims every slot in the plan immediately.
 *
 * Trust-first-run + dedup (slot unification A3, spec §5/§6): a 'markup'
 * slot's write door now holds a `last` value alongside its boundary refs.
 * The FIRST write ever made to a slot only RECORDS `last` — it never
 * touches the DOM, trusting that the claimed range already holds matching
 * SSR/CSR content (the same discipline `patchSlotRange`'s per-effect
 * `__last === undefined` seed used to provide at the call site; A3 moves it
 * into the writer so every 'markup' caller gets it for free). Every write
 * after the first skips the DOM patch when the new string equals `last`
 * (dedup) and otherwise clears-and-inserts as before. A `Node` write is
 * deduped by identity (mirrors `__bfText`'s `value === current` check) but
 * is NEVER trust-first-run-seeded — the first render of a live Node (e.g. a
 * freshly `createComponent`-built element) is a distinct object from
 * whatever the SSR markup rendered, so it always splices on its first
 * write, exactly like `__bfText` always did. 'text' writes stay a plain
 * `nodeValue` assignment (already idempotent, per §5's design note) — no
 * dedup state needed.
 */

import { BF_SCOPE } from '@barefootjs/shared'
import { textNodeAfterComment, commentsInScope } from './query.ts'
import { commentScopeRegistry } from './scope.ts'

/**
 * A slot's compile-time descriptor. `path` is the list of child indices
 * from the claim root to the slot's ANCHOR NODE — in Step A that anchor is
 * always the existing `<!--bf:sN-->` start comment (markers are still
 * emitted; Step B may point paths at other node kinds), so resolution
 * walks `childNodes` by index with no assumption about the target's
 * `nodeType` until the kind-specific claim inspects it. `id` is kept for
 * diagnostics and as the marker-scan fallback's search key.
 */
export interface SlotSpec {
  id: string
  kind: 'text' | 'markup'
  path: readonly number[]
}

export type ClaimPlan = readonly SlotSpec[]

/** A claimed 'text' slot: the live Text node, held by identity forever. */
interface ClaimedTextSlot {
  readonly kind: 'text'
  readonly node: Text
}

/**
 * A claimed 'markup' slot: both boundary comments, held by identity.
 * Content lives strictly between `start` and `end`; both survive every
 * write. `last` is the trust-first-run + dedup state (see module docstring)
 * — `undefined` until the first write, a `string` once a string has been
 * recorded/patched, or the live `Node` once one has been spliced in.
 */
interface ClaimedMarkupSlot {
  readonly kind: 'markup'
  readonly start: Comment
  readonly end: Comment
  last: string | Node | undefined
}

type ClaimedSlotRef = ClaimedTextSlot | ClaimedMarkupSlot

/**
 * The result of claiming a plan: a write door keyed by slot id. Writing an
 * id that failed to claim (or was never in the plan) warns and no-ops —
 * one bad/missing slot never breaks any other slot's writes.
 */
export interface ClaimedSlots {
  write(id: string, value: unknown): void
}

/** `lazySlots`'s per-write function — the same shape `ClaimedSlots.write` has. */
export type SlotWriter = (id: string, value: unknown) => void

// --- path resolution ---

/** Walk `childNodes` by index from `root`. No node-kind assumption — the
 *  caller checks whether the result is actually the expected comment. */
function resolvePath(root: Node, path: readonly number[]): Node | null {
  let node: Node = root
  for (const index of path) {
    const child: Node | undefined = node.childNodes[index]
    if (!child) return null
    node = child
  }
  return node
}

function isSlotComment(node: Node | null, id: string): node is Comment {
  return node != null && node.nodeType === Node.COMMENT_NODE && (node as Comment).nodeValue === `bf:${id}`
}

/**
 * Fallback marker scan, used only when a slot's compile-time path fails to
 * resolve to its own `bf:sN` comment (shape drift, or a plan built against
 * a differently-shaped claim root). Mirrors `patchSlotRange`'s ownership
 * loop: a same-id marker owned by a nested `bf-s` scope (a child
 * component's own slot — ids collide across components by design) is
 * skipped so the fallback can never claim into a child's content.
 *
 * `commentsInScope` (not a bare `document.createTreeWalker(root, …)`) so a
 * whole-item loop conditional's claim root (`insert.ts`'s detached
 * `commentScopeRegistry` proxy for a `<!--bf-loop-i:key-->` anchor, #1665)
 * resolves correctly: the proxy has no DOM children of its own — the row's
 * real content lives as SIBLINGS of the registered comment — and
 * `commentsInScope` already knows to walk that sibling range instead of
 * `root`'s (empty) descendants. The ownership boundary adapts to match:
 * every node in a comment-scope's range shares the registered comment's
 * OWN parent element, so that (not the unreachable proxy `root`) is where
 * the ancestor walk must stop.
 */
function findOwnedMarker(root: Element, id: string): Comment | null {
  const marker = `bf:${id}`
  const registryInfo = commentScopeRegistry.get(root)
  const boundary = registryInfo ? registryInfo.commentNode.parentElement : root
  for (const comment of commentsInScope(root)) {
    if (comment.nodeValue !== marker) continue
    let owned = true
    for (let el = comment.parentElement; el && el !== boundary; el = el.parentElement) {
      if (el.hasAttribute(BF_SCOPE)) {
        owned = false
        break
      }
    }
    if (owned) return comment
  }
  return null
}

/**
 * Find the matching `<!--/-->` end comment for a 'markup' slot's start
 * comment, using the same nesting-depth rule as `patchSlotRange`: any
 * further `bf:`-prefixed comment along the way opens a nested region (a
 * leaf rendered inside this one can carry its own ordinary slot markers)
 * and increments a depth counter so that region's own `/` doesn't
 * prematurely close this outer range. Runs once, at claim time — writes
 * never need this since the end ref is held afterward.
 */
function findMarkupEnd(start: Comment): Comment | null {
  let depth = 0
  let node: Node | null = start.nextSibling
  while (node) {
    if (node.nodeType === Node.COMMENT_NODE) {
      const value = (node as Comment).nodeValue ?? ''
      if (value.startsWith('bf:')) {
        depth++
      } else if (value === '/') {
        if (depth === 0) return node as Comment
        depth--
      }
    }
    node = node.nextSibling
  }
  return null
}

/**
 * Resolve one slot's anchor comment: try the compile-time path first, fall
 * back to an owned marker scan on any miss (path resolves to nothing, or to
 * a node that isn't this slot's own comment — shape drift), and warn on
 * either the fallback-needed or the total-miss case — EXCEPT when the plan
 * shipped an empty path (`spec.path.length === 0`, slot unification A3's
 * "cannot be statically pathed" case, `spec/slot-unification.md` §5-A3):
 * an empty path is a deliberate "no compile-time path available" marker,
 * not a claim that index `0` addresses this slot, so going straight to the
 * scan is the plan's INTENDED behavior, not a drift to warn about. Never
 * throws — a bad slot returns `null` and the caller drops it from the
 * claimed set.
 */
function resolveAnchor(root: Element, spec: SlotSpec): Comment | null {
  if (spec.path.length > 0) {
    const resolved = resolvePath(root, spec.path)
    if (isSlotComment(resolved, spec.id)) return resolved
    console.warn(
      `[barefootjs] claim path for slot ${spec.id} did not resolve to its bf:${spec.id} marker; falling back to a scan`,
    )
  }

  const found = findOwnedMarker(root, spec.id)
  if (!found) {
    console.warn(`[barefootjs] slot ${spec.id} marker not found; skipping`)
  }
  return found
}

/** Claim one slot per its kind's contract. `null` on any failure (already warned). */
function claimOne(root: Element, spec: SlotSpec): ClaimedSlotRef | null {
  const anchor = resolveAnchor(root, spec)
  if (!anchor) return null

  if (spec.kind === 'text') {
    return { kind: 'text', node: textNodeAfterComment(anchor) }
  }

  const end = findMarkupEnd(anchor)
  if (!end) {
    console.warn(`[barefootjs] slot ${spec.id} has no end marker; skipping`)
    return null
  }
  return { kind: 'markup', start: anchor, end, last: undefined }
}

// --- writes ---

function writeText(ref: ClaimedTextSlot, value: unknown): void {
  ref.node.nodeValue = String(value ?? '')
}

/** Remove every node strictly between `start` and `end` (both survive). */
function clearMarkupRange(start: Comment, end: Comment): void {
  const parent = end.parentNode
  if (!parent) return
  let node: Node | null = start.nextSibling
  while (node && node !== end) {
    const next = node.nextSibling
    parent.removeChild(node)
    node = next
  }
}

function writeMarkup(ref: ClaimedMarkupSlot, value: unknown): void {
  const { start, end } = ref
  const parent = end.parentNode
  if (!parent) return

  // Slot markers (`__slot()`, `@barefootjs/client/slot.ts`): a caller-passed
  // JSX prop that itself contains a component. Leave the server-rendered DOM
  // untouched entirely — no write, no `last` update either, so a later real
  // value still gets a correct trust-first-run/dedup read. Mirrors
  // `__bfText`'s identical guard (#1663).
  if (value != null && (value as { __isSlot?: boolean }).__isSlot) return

  if (typeof Node !== 'undefined' && value instanceof Node) {
    // Identity dedup, mirrors `__bfText`'s `value === current` check — the
    // same live node handed back again is a no-op. Never trust-first-run
    // seeded: a freshly rendered Node is never the SSR-rendered markup by
    // identity, so the very first Node write always splices.
    if (value === ref.last) return
    clearMarkupRange(start, end)
    parent.insertBefore(value, end)
    ref.last = value
    return
  }

  const text = String(value ?? '')
  if (ref.last === undefined) {
    // Trust-first-run: the claimed range already holds matching SSR/CSR
    // content (row-pristine invariant, §3(a)) — record without patching.
    ref.last = text
    return
  }
  if (text === ref.last) return // dedup: identical string, skip the DOM touch
  clearMarkupRange(start, end)
  const tpl = document.createElement('template')
  tpl.innerHTML = text
  parent.insertBefore(tpl.content, end)
  ref.last = text
}

function writeSlot(refs: ReadonlyMap<string, ClaimedSlotRef>, id: string, value: unknown): void {
  const ref = refs.get(id)
  if (!ref) {
    console.warn(`[barefootjs] no claimed slot for id ${id}; write ignored`)
    return
  }
  if (ref.kind === 'text') {
    writeText(ref, value)
  } else {
    writeMarkup(ref, value)
  }
}

// --- public API ---

/**
 * Claim every slot in `plan` against `root` NOW. Escape hatch for callers
 * that cannot honor the row-pristine invariant `lazySlots` relies on
 * (streaming/portal paths that may mutate row content before any write
 * would naturally occur, per §6) — claim eagerly there instead.
 */
export function claimSlots(root: Element, plan: ClaimPlan): ClaimedSlots {
  const refs = new Map<string, ClaimedSlotRef>()
  for (const spec of plan) {
    const ref = claimOne(root, spec)
    if (ref) refs.set(spec.id, ref)
  }
  return { write: (id, value) => writeSlot(refs, id, value) }
}

/**
 * Lazy wrapper honoring the row-pristine invariant (§3(a)): nothing touches
 * `root`'s DOM until the first write, and that first write claims the
 * WHOLE plan at once — so no earlier write into a sibling slot can shift
 * this row's still-unclaimed paths first. A row that never updates never
 * pays for a claim at all.
 */
export function lazySlots(root: Element, plan: ClaimPlan): SlotWriter {
  let claimed: ClaimedSlots | null = null
  return (id: string, value: unknown) => {
    if (!claimed) claimed = claimSlots(root, plan)
    claimed.write(id, value)
  }
}
