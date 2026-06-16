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

// Compiler built-ins `<Async>` / `<Region>` are import-scoped to
// `@barefootjs/client` (`import { Async, Region } from '@barefootjs/client'`),
// recognised by that import and compiled away (#1915). They are intentionally
// not re-declared on this JSX runtime — a bare tag-name declaration here would
// reintroduce the phantom-import / collision problems #1915 set out to remove.
