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
