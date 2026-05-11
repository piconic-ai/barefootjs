/**
 * BarefootJS Hono JSX Extension
 *
 * Combines hono/jsx runtime with @barefootjs/jsx type definitions.
 * - Runtime functions from hono/jsx
 * - Typed event handlers and IntrinsicElements from @barefootjs/jsx
 * - JSX.Element from hono/jsx (for Suspense/streaming support)
 *
 * Usage in tsconfig.json:
 *   "jsxImportSource": "@barefootjs/hono/jsx"
 */

// Runtime functions from hono/jsx.
export { jsx, jsxs, Fragment, jsxAttr, jsxEscape, jsxTemplate } from 'hono/jsx/jsx-runtime'

// Re-export JSX namespace from @barefootjs/jsx, but override Element type for Hono.
import type { JSX as BaseJSX } from '@barefootjs/jsx/jsx-runtime'

export declare namespace JSX {
  // Use Hono's Element type for Suspense/streaming compatibility.
  type Element = import('hono/jsx/jsx-runtime').JSX.Element

  // Re-use types from @barefootjs/jsx.
  type IntrinsicElements = BaseJSX.IntrinsicElements
  type IntrinsicAttributes = BaseJSX.IntrinsicAttributes
  type ElementChildrenAttribute = BaseJSX.ElementChildrenAttribute
}

/**
 * BarefootJS compiler built-in: streaming async boundary.
 *
 * The compiler intercepts `<Async fallback={...}>` in JSX source and emits it
 * as a `<Suspense>` node in the Hono adapter output (IRAsync → renderAsync).
 * This declaration provides TypeScript types for source files; no runtime
 * implementation is needed because the compiler replaces it before execution.
 */
export declare function Async(props: {
  fallback: JSX.Element
  children: JSX.Element | JSX.Element[] | null | undefined
}): JSX.Element
