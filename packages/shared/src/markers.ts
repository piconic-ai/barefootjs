/**
 * BarefootJS - Hydration Marker Constants
 *
 * Single source of truth for HTML attribute names used as hydration markers.
 * Referenced by both the compiler (@barefootjs/jsx) and runtime (@barefootjs/client).
 *
 * These are not data-* attributes (like Angular's ng-, Vue's v-, Alpine's x-).
 */

// ---------------------------------------------------------------------------
// Element attributes
// ---------------------------------------------------------------------------

/**
 * Component scope boundary + addressable scope ID.
 *
 *   bf-s="ComponentName_<rand6>"
 *
 * Identity contract (#1249): the *value* of bf-s is NOT load-bearing for slot
 * resolution. Identity of a slot-attached child scope is the (BF_HOST, BF_AT)
 * pair, which is guaranteed unique by construction. bf-s carries
 *   - scope-boundary detection (`closest('[bf-s]')`),
 *   - addressable ID for portal/context references (e.g. bf-po),
 *   - human-readable component name for hydration walker dispatch and devtools.
 */
export const BF_SCOPE = 'bf-s'

/** Slot ID on the host-side slot position marker: `bf="s1"`. Not to be
 *  confused with BF_AT, which is the guest-side counterpart. */
export const BF_SLOT = 'bf'

/**
 * Host scope ID, stamped on every child component scope.
 *
 *   bf-h="App_abc"
 *
 * Together with BF_AT, this is the authoritative identity of a slot-attached
 * child scope. The slot-resolver uses `[bf-h="<host>"][bf-m="<slot>"]` as its
 * sole lookup (no prefix scans, no suffix scans). The previous BF_PARENT name
 * was misleading because "parent" reads as DOM parent; this is the parent
 * component scope, not the DOM ancestor.
 */
export const BF_HOST = 'bf-h'

/**
 * Slot ID inside the host where this child scope is mounted: `bf-m="s35"`.
 *
 * The guest-side counterpart of BF_SLOT: BF_SLOT is on the slot position
 * inside the host's template, BF_AT is on the child scope element that
 * lives there.
 */
export const BF_AT = 'bf-m'

/**
 * Root-of-client-component marker: `bf-r`. Present (as a boolean attribute)
 * on the SSR root of a stateful component that's the entry point of a
 * client-side island — what Hono's adapter calls `isRootOfClientComponent`.
 *
 * Even when such a root is itself a slot-attached child of an outer
 * page/layout (and therefore carries BF_HOST / BF_AT too), `bf-r` lets
 * test locators and tooling distinguish it from non-root child scopes
 * that share the same bf-s name prefix. Used by e2e locators of the
 * form `[bf-s^="FooDemo_"][bf-r]` so they don't over-match into demo
 * internals after the `~` shape-prefix is removed (#1249 follow-up).
 */
export const BF_ROOT = 'bf-r'

/** Serialized props JSON: `bf-p="..."` */
export const BF_PROPS = 'bf-p'

/** Conditional marker: `bf-c="s0"` */
export const BF_COND = 'bf-c'

/** List item marker: `bf-i` */
export const BF_ITEM = 'bf-i'

// ---------------------------------------------------------------------------
// Portal attributes
// ---------------------------------------------------------------------------

/** Portal ownership: `bf-po="Toggle_h1rn0a"` */
export const BF_PORTAL_OWNER = 'bf-po'

/** Portal ID: `bf-pi="bf-portal-1"` */
export const BF_PORTAL_ID = 'bf-pi'

/** Portal placeholder: `bf-pp="bf-portal-1"` */
export const BF_PORTAL_PLACEHOLDER = 'bf-pp'

// ---------------------------------------------------------------------------
// Value prefixes
// ---------------------------------------------------------------------------

// NOTE: the legacy `~` prefix on bf-s values (for "this is a parent-owned
// child scope") was removed in #1249. Child-scope-ness is now signalled by
// the presence of BF_HOST, which is both more local and unambiguous.

/** Parent-owned slot prefix in bf value: `bf="^s3"` */
export const BF_PARENT_OWNED_PREFIX = '^'

// ---------------------------------------------------------------------------
// Comment markers
// ---------------------------------------------------------------------------

/** Comment-based scope marker prefix: `<!--bf-scope:ComponentName_abc123-->` */
export const BF_SCOPE_COMMENT_PREFIX = 'bf-scope:'

/** Loop boundary start prefix: comments are `<!--bf-loop:<markerId>-->`. */
export const BF_LOOP_START = 'bf-loop'

/** Loop boundary end prefix: comments are `<!--bf-/loop:<markerId>-->`. */
export const BF_LOOP_END = 'bf-/loop'

/**
 * Per-item start marker inside a loop range: `<!--bf-loop-i-->`.
 *
 * Emitted by the compiler only when the loop body is multi-root (a JSX
 * Fragment with two or more top-level elements). Each item's range runs
 * from this marker until the next `<!--bf-loop-i-->` or the loop end
 * marker. mapArray uses these to pair an item's key with all of its DOM
 * nodes (#1212).
 */
export const BF_LOOP_ITEM = 'bf-loop-i'

/**
 * Build the per-item anchor comment value for a loop item: `bf-loop-i:<key>`.
 *
 * The key is embedded in the comment value (comments cannot carry
 * attributes) so an item's identity survives SSR → hydration and so a
 * range-scoped `insert()` can anchor a whole-item conditional to it
 * without a wrapper element. An item's range runs from this anchor until
 * the next `bf-loop-i:*` anchor or the loop end marker.
 */
export function loopItemMarker(key: string): string {
  return `${BF_LOOP_ITEM}:${key}`
}

/** Build the start-marker comment value for a loop. */
export function loopStartMarker(markerId: string): string {
  return `${BF_LOOP_START}:${markerId}`
}

/** Build the end-marker comment value for a loop. */
export function loopEndMarker(markerId: string): string {
  return `${BF_LOOP_END}:${markerId}`
}

// ---------------------------------------------------------------------------
// Data attributes
// ---------------------------------------------------------------------------

/** Key attribute for list reconciliation: `data-key="1"` */
export const BF_KEY = 'data-key'

/** Nested loop key attribute prefix: `data-key-1`, `data-key-2` */
export const BF_KEY_PREFIX = 'data-key-'

/** Component placeholder in loop templates: `data-bf-ph="s5"` */
export const BF_PLACEHOLDER = 'data-bf-ph'

// ---------------------------------------------------------------------------
// Streaming (Out-of-Order SSR)
// ---------------------------------------------------------------------------

/** Async boundary placeholder: `bf-async="a0"` */
export const BF_ASYNC = 'bf-async'

/** Async resolve template: `<template bf-async-resolve="a0">` */
export const BF_ASYNC_RESOLVE = 'bf-async-resolve'

// ---------------------------------------------------------------------------
// Region (page-lifecycle boundary, spec/router.md)
// ---------------------------------------------------------------------------

/**
 * Page-lifecycle boundary emitted for an authored `<Region>`:
 *   `bf-region="<file scope>:<index>"`
 *
 * Everything outside a `[bf-region]` persists across a client navigation;
 * everything inside is the unit the router disposes, re-loads, and
 * re-hydrates. The value is deterministic (the layout file's `computeFileScope`
 * hash + a per-file index), so a layout that compiles to one shared partial
 * emits the *same* id across every page — which is what the router matches on.
 */
export const BF_REGION = 'bf-region'

// ---------------------------------------------------------------------------
// Hoisted-children scope placeholder (#1320)
// ---------------------------------------------------------------------------

/**
 * Sentinel value embedded by the compiler on hoisted JSX children that
 * need a `bf-s` scope marker. The runtime `renderChild` substitutes the
 * value with the current `_parentScopeId` — i.e. the scope of the
 * call site that wrote `<Box children={<jsx/>} />` — at render time.
 *
 * The placeholder is the literal `bf-s` attribute value (not just a
 * textual marker), so substitution regexes anchor to
 * `bf-s="<this>"` to avoid rewriting user content that happens to
 * contain the sentinel as text.
 *
 * Single source of truth shared between:
 *   - emit (`@barefootjs/jsx/ir-to-client-js/html-template.ts`)
 *   - production runtime (`@barefootjs/client/runtime/component.ts`)
 *   - CSR conformance harness (`@barefootjs/adapter-tests/src/csr-render.ts`)
 */
export const BF_PARENT_SCOPE_PLACEHOLDER = '__BF_PARENT_SCOPE__'
