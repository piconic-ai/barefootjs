/**
 * Claim-plan interpreter and claimed-slot primitives (slot unification
 * Step A2, `spec/slot-unification.md` §4/§5-A2).
 *
 * This module is the ONE claim mechanism the spec's §4 target architecture
 * describes: a compile-time `ClaimPlan` (per-slot child-index paths from a
 * claim root down to the slot's anchor comment) is resolved ONCE — either
 * eagerly (`claimSlots`) or lazily on first write (`lazySlots`) — and every
 * later write goes through the held reference, never re-scanning the DOM.
 * It supersedes (but, per A2's scope, does not yet replace — that's A3) the
 * four mechanisms inventoried in §1: `$t`/text-effect writes, `__bfText`,
 * `patchSlotRange`, and `updateClientMarker`.
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
 * siblings.
 *
 * Row-pristine lazy claim (§3(a)): `lazySlots` touches NOTHING until the
 * first write, and that first write claims the WHOLE plan at once (not just
 * the slot being written) — so no earlier write into one slot can shift a
 * sibling slot's still-unclaimed path out from under it. A row that never
 * updates never pays for a claim at all. `claimSlots` is the eager escape
 * hatch for callers that cannot honor that invariant (streaming/portal
 * paths that mutate row content before any write would occur, per §6's
 * risk note) — it claims every slot in the plan immediately.
 */

import { BF_SCOPE } from '@barefootjs/shared'
import { textNodeAfterComment } from './query.ts'

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
 * write.
 */
interface ClaimedMarkupSlot {
  readonly kind: 'markup'
  readonly start: Comment
  readonly end: Comment
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
 */
function findOwnedMarker(root: Element, id: string): Comment | null {
  const marker = `bf:${id}`
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_COMMENT)
  while (walker.nextNode()) {
    const comment = walker.currentNode as Comment
    if (comment.nodeValue !== marker) continue
    let owned = true
    for (let el = comment.parentElement; el && el !== root; el = el.parentElement) {
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
 * either the fallback-needed or the total-miss case. Never throws — a bad
 * slot returns `null` and the caller drops it from the claimed set.
 */
function resolveAnchor(root: Element, spec: SlotSpec): Comment | null {
  const resolved = resolvePath(root, spec.path)
  if (isSlotComment(resolved, spec.id)) return resolved

  console.warn(
    `[barefootjs] claim path for slot ${spec.id} did not resolve to its bf:${spec.id} marker; falling back to a scan`,
  )
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
  return { kind: 'markup', start: anchor, end }
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
  clearMarkupRange(start, end)

  if (typeof Node !== 'undefined' && value instanceof Node) {
    parent.insertBefore(value, end)
    return
  }

  const tpl = document.createElement('template')
  tpl.innerHTML = String(value ?? '')
  parent.insertBefore(tpl.content, end)
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
