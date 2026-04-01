/**
 * BarefootJS - HTML Attribute Constants
 *
 * Short attribute names for hydration markers.
 * These are not data-* attributes (like Angular's ng-, Vue's v-, Alpine's x-).
 */

/** Component scope boundary: `bf-s="Toggle_h1rn0a"` */
export const BF_SCOPE = 'bf-s'

/** Slot ID (most common): `bf="s1"` */
export const BF_SLOT = 'bf'

/** Serialized props JSON: `bf-p="..."` */
export const BF_PROPS = 'bf-p'

/** Conditional marker: `bf-c="s0"` */
export const BF_COND = 'bf-c'

/** Portal ownership: `bf-po="Toggle_h1rn0a"` */
export const BF_PORTAL_OWNER = 'bf-po'

/** Portal ID: `bf-pi="bf-portal-1"` */
export const BF_PORTAL_ID = 'bf-pi'

/** Portal placeholder: `bf-pp="bf-portal-1"` */
export const BF_PORTAL_PLACEHOLDER = 'bf-pp'

/** List item marker: `bf-i` */
export const BF_ITEM = 'bf-i'

/** Child component prefix in scope value: `~ToggleItem_abc` */
export const BF_CHILD_PREFIX = '~'

/** Parent-owned slot prefix in bf value: `bf="^s3"` */
export const BF_PARENT_OWNED_PREFIX = '^'

/** Comment-based scope marker prefix: `<!--bf-scope:ComponentName_abc123-->` */
export const BF_SCOPE_COMMENT_PREFIX = 'bf-scope:'

/**
 * Key attribute for list reconciliation: `data-key="1"`
 * @see packages/jsx/src/ir-to-client-js/utils.ts — DATA_KEY (compiler-side mirror)
 */
export const BF_KEY = 'data-key'

/**
 * Nested loop key attribute prefix: `data-key-1`, `data-key-2`
 * @see packages/jsx/src/ir-to-client-js/utils.ts — DATA_KEY_PREFIX (compiler-side mirror)
 */
export const BF_KEY_PREFIX = 'data-key-'

/**
 * Component placeholder in loop templates: `data-bf-ph="s5"`
 * @see packages/jsx/src/ir-to-client-js/utils.ts — DATA_BF_PH (compiler-side mirror)
 */
export const BF_PLACEHOLDER = 'data-bf-ph'

/**
 * Loop boundary comment markers: `<!--bf-loop-->...<!--/bf-loop-->`
 * Delimits loop items within a container that has sibling content.
 * @see packages/jsx/src/ir-to-client-js/utils.ts — BF_LOOP_START, BF_LOOP_END (compiler-side mirror)
 */
export const BF_LOOP_START = 'bf-loop'
export const BF_LOOP_END = 'bf-/loop'
