/**
 * Slot unification Step B (`spec/slot-unification.md` §3(b), §5 "Step B —
 * marker elision"): decide, EXACTLY ONCE and BEFORE either `adapter.generate`
 * (SSR) or `generateClientJs` (CSR) run, which `/* @client *\/` text slots
 * can drop their `<!--bf:sN-->…<!--/-->` marker pair entirely from both
 * outputs. Every consumer (all nine SSR adapters' `renderExpression`, and
 * both top-level CSR emitters in `html-template.ts` —
 * `irToHtmlTemplate`'s `case 'expression'` and `generateCsrTemplateWithOpts`'s
 * own, fixed by #2617 after it shipped without this check for one CSR
 * release cycle — reads the single `IRExpression.markerless` flag this pass
 * writes — nobody re-derives the decision, per CLAUDE.md's "Never add
 * compiler options/hooks for tool-specific output rewriting" spirit: one
 * door in, everyone reads it.
 *
 * Scope — deliberately the NARROWEST slice of §3(b)'s elision rule that is
 * fully sound today, not the general case:
 *
 *   Only `expr.clientOnly && expr.slotId` expressions OUTSIDE any loop or
 *   conditional branch (i.e. reachable from the component's own render tree
 *   by walking only `element`/`text`/`expression`/`fragment` nodes).
 *
 * Why THIS slice and not ordinary reactive text slots (loop rows,
 * conditional branches): every other kind of slot's SSR-rendered width is
 * DATA-DEPENDENT — an ordinary `{item.name}` may render empty or non-empty
 * per request, so a LATER sibling's absolute child-index path would only be
 * valid for the specific width THIS request happened to produce, not for
 * every request the compiled function ever serves. `/* @client *\/`
 * expressions are the one case free of that problem: SSR can never evaluate
 * client-only JS (the whole point of the escape valve), so its rendered
 * width is deterministically ZERO on every request, for every adapter, with
 * no data dependence at all. That determinism is what makes computing a
 * real, reusable, hydration-safe path sound here without also solving the
 * general "does an earlier sibling's width vary by request" problem.
 *
 * Path safety within that scope — the part that generalizes A3's
 * `computeSkeletonSlotPaths` (`html-template.ts`) rather than reinventing
 * it: paths are root-relative child-index chains, exactly like that
 * function's, walked in document order with the SAME "once we hit something
 * whose contributed width isn't a compile-time constant, every remaining
 * sibling AND everything nested inside it loses eligibility" rule (nested
 * content reached only through an uncertain-index sibling would resolve an
 * absolute path through that uncertain index — silently wrong, not loud, so
 * it must never be attempted). Concretely, walking a children list left to
 * right:
 *   - a static `element` always contributes exactly one node — recurse into
 *     its own children as an independent, freshly-indexed scope (its own
 *     internal accounting can't leak out, and nothing external can poison
 *     it either, since the element itself is a fixed anchor regardless of
 *     what's inside it);
 *   - static `text` contributes a node per HTML-parser text-run-merging
 *     rules (adjacent text/expression children collapse into ONE Text
 *     node — mirrors `computeSkeletonSlotPaths`'s `pendingText` tracking);
 *   - a `clientOnly` expression with a slotId is the one ELIGIBLE case,
 *     PROVIDED it is not itself part of a merged text run (rule (i) — the
 *     `/* @client *\/` slot must not be immediately adjacent, once markers
 *     are gone, to loose text or another expression, or the HTML parser
 *     would merge them into one Text node with no way to tell which
 *     content is which). Once one is elided, this level (and everything
 *     nested inside any later sibling) is marked ineligible for the
 *     remainder of the walk at this level — see the "freeze" note below;
 *   - any other `expression` (a real reactive/static text or markup slot),
 *     any `conditional`/`loop`/`component`/`async`/`provider`/
 *     `if-statement`/`slot` node, is data-dependent or opaque width and
 *     FREEZES the rest of this children list (see below) — this is
 *     strictly conservative: it also means a `/* @client *\/` expression
 *     is never eligible once any of these appears earlier at the same
 *     level, even though `/* @client *\/`'s own width is always zero,
 *     because SIBLINGS reached only via nested recursion past that point
 *     would otherwise resolve an absolute path through the frozen node's
 *     uncertain contributed width;
 *   - the same hazard-tag / force-close-group / void-element / `<tr>`
 *     foster-parenting guards `computeSkeletonSlotPaths` uses (imported,
 *     not re-derived) abort the ENTIRE walk (a global bail, exactly like
 *     that function's `state.bailed`) — a parser hazard means every index
 *     computed anywhere in this tree is suspect, not just the ones near
 *     the hazard, so "don't guess" means don't guess about the blast
 *     radius either.
 *
 * "Freeze" (the one simplification versus a maximally-precise per-branch
 * eligibility tracker): once ANY `/* @client *\/` slot at a given level is
 * elided — OR once anything data-dependent/opaque is seen at that level —
 * that level's remaining siblings (and anything nested only through them)
 * stop being assigned real paths for the rest of THIS walk, even though a
 * maximally precise analysis could sometimes still find one. This caps
 * elision at (at most) one `/* @client *\/` slot per static subtree —
 * conservative by design, matching the elision rule's own framing, and it
 * guarantees two elided slots can never end up needing an insertion whose
 * reference node depends on the other's still-unresolved width. Freezing is
 * PER CHILDREN-LIST (an element's own children start a fresh, unfrozen
 * scope) — global-bail is reserved for hazard tags alone.
 *
 * Deferred (loudly, not silently): ordinary reactive text slots in loop
 * rows / conditional branches keep their markers — see above for why
 * widening this to data-dependent-width content needs a materially
 * different (and per-adapter-verified) safety argument that this PR does
 * not attempt.
 */

import type { IRNode, IRExpression } from '../types.ts'
import {
  VOID_ELEMENTS,
  SKELETON_PATH_HAZARD_TAGS,
  skeletonForceCloseGroup,
  hasForeignTableRowContent,
  flattenSkeletonChildren,
} from './html-template.ts'

/** Global bail, mirroring `computeSkeletonSlotPaths`'s `state.bailed`: once
 *  a parser hazard is seen anywhere, every remaining step of this ONE
 *  `decideClientOnlyElision` call becomes a no-op. Slots already elided
 *  before the hazard was reached keep their `markerless`/`elidedPath` —
 *  those paths were computed from safe ground and remain valid; only
 *  FURTHER assignment stops. */
interface ElisionState {
  bailed: boolean
}

/**
 * Entry point: mutates `root`'s `expression` nodes in place, setting
 * `markerless`/`elidedPath` on every eligible `/* @client *\/` slot found.
 * Safe to call on any component's render tree; a tree with none simply
 * mutates nothing.
 */
export function decideClientOnlyElision(root: IRNode): void {
  walkNode(root, [], new Set(), { bailed: false })
}

/** Walk one node that occupies a known position (`path`) in its parent's
 *  children. Only `element`/`fragment` are ever recursed into by the
 *  children-list walker below — this wrapper exists so both the top-level
 *  call and `walkChildren`'s per-element recursion can share one path. */
function walkNode(
  node: IRNode,
  path: readonly number[],
  forceCloseAncestors: ReadonlySet<number>,
  state: ElisionState,
): void {
  if (state.bailed) return
  if (node.type === 'element') {
    if (!elementIsPathSafe(node.tag, flattenSkeletonChildren(node.children))) {
      state.bailed = true
      return
    }
    const groupIdx = skeletonForceCloseGroup(node.tag)
    if (groupIdx >= 0 && forceCloseAncestors.has(groupIdx)) {
      state.bailed = true
      return
    }
    const nextAncestors = groupIdx >= 0 ? new Set([...forceCloseAncestors, groupIdx]) : forceCloseAncestors
    walkChildren(flattenSkeletonChildren(node.children), path, nextAncestors, state)
  } else if (node.type === 'fragment') {
    walkChildren(flattenSkeletonChildren(node.children), path, forceCloseAncestors, state)
  }
  // Any other root shape (a bare conditional/loop/component return, etc.)
  // has no static children list to walk — nothing to do.
}

/**
 * Walk one parent's (already-fragment-flattened) children left to right,
 * assigning paths to eligible `/* @client *\/` slots. `parentPath` is the
 * path to the PARENT of this children list (the element/root whose
 * `childNodes` these indices are relative to). `forceCloseAncestors`
 * mirrors `computeSkeletonSlotPaths`'s ancestor-threaded force-close-group
 * tracking (`<h2>` inside an open `<h1>`, `<li>` inside an open `<li>`, …) —
 * threaded down through element recursion, exactly like that function.
 * `frozen` is local to THIS call (this one children list) — an element's
 * own children get a fresh, unfrozen scope regardless of what froze here.
 */
function walkChildren(
  children: readonly IRNode[],
  parentPath: readonly number[],
  forceCloseAncestors: ReadonlySet<number>,
  state: ElisionState,
): void {
  let frozen = false
  let idx = 0
  let pendingText = false

  for (let i = 0; i < children.length; i++) {
    if (state.bailed) return
    const child = children[i]

    switch (child.type) {
      case 'text': {
        if (child.value === '') continue
        if (!pendingText) idx += 1
        pendingText = true
        continue
      }

      case 'expression': {
        if (child.expr === 'null' || child.expr === 'undefined') continue
        if (child.clientOnly && child.slotId) {
          const adjacent = isTextLike(children[i - 1]) || isTextLike(children[i + 1])
          if (!frozen && !adjacent) {
            markElided(child, [...parentPath, idx])
            frozen = true // one elision per level — see module docstring
          } else {
            frozen = true // still freeze: an un-elided expression here is
            // no different from any other data-dependent-width sibling.
          }
          idx += 1
          pendingText = false
          continue
        }
        // Any other expression — data-dependent width. Freeze the rest of
        // this level; still consume ONE index (best-effort bookkeeping —
        // nothing downstream reads `idx` past this point since `frozen`
        // blocks any further assignment).
        frozen = true
        idx += 1
        pendingText = false
        continue
      }

      case 'element': {
        if (!elementIsPathSafe(child.tag, flattenSkeletonChildren(child.children))) {
          // Hazard shape: bail the WHOLE walk (matches
          // `computeSkeletonSlotPaths`'s "don't guess" stance), not just
          // this level — a parser hazard means indices anywhere in this
          // tree are untrustworthy, not only the ones near it.
          state.bailed = true
          return
        }
        if (!frozen) {
          walkNode(child, [...parentPath, idx], forceCloseAncestors, state)
        }
        idx += 1
        pendingText = false
        continue
      }

      case 'fragment':
        continue // already flattened

      default:
        // conditional / loop / component / async / provider / if-statement /
        // slot: opaque or variable width. Freeze the rest of this level.
        frozen = true
        idx += 1
        pendingText = false
        continue
    }
  }
}

/** True for a node that would merge (per HTML text-node-merging rules) with
 *  an adjacent bare-text-position slot if that slot's markers were removed —
 *  rule (i) of §3(b). `undefined` (no sibling — start/end of the children
 *  list) is never adjacent. */
function isTextLike(node: IRNode | undefined): boolean {
  if (!node) return false
  if (node.type === 'text') return node.value !== ''
  if (node.type === 'expression') return node.expr !== 'null' && node.expr !== 'undefined'
  return false
}

function markElided(expr: IRExpression, path: readonly number[]): void {
  expr.markerless = true
  expr.elidedPath = path
}

/**
 * Mirrors `computeSkeletonSlotPaths`'s per-element safety checks (hazard
 * tags, void elements, `<tr>` foster-parenting) without re-deriving the
 * underlying tag sets — imported from `html-template.ts` so the two walks
 * can never silently diverge on which shapes are hazardous. Force-close
 * groups are checked separately by the caller (`walkNode`), which has the
 * ancestor set this check does not.
 */
function elementIsPathSafe(tag: string, flatChildren: readonly IRNode[]): boolean {
  if (SKELETON_PATH_HAZARD_TAGS.has(tag)) return false
  if (VOID_ELEMENTS.has(tag) && flatChildren.length > 0) return false
  if (tag === 'tr' && hasForeignTableRowContent(flatChildren)) return false
  return true
}
