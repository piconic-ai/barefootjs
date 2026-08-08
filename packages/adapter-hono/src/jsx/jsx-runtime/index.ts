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
import {
  jsx as honoJsx,
  jsxs as honoJsxs,
  Fragment,
  jsxAttr,
  jsxEscape,
  jsxTemplate,
} from 'hono/jsx/jsx-runtime'
import { resolveDangerouslySetInnerHTML } from '../resolve-dangerously-set-inner-html.ts'

export { Fragment, jsxAttr, jsxEscape, jsxTemplate }

// See `../resolve-dangerously-set-inner-html.ts` for why this is needed —
// hono's own `jsxFn` throws for a childless `<svg>`/`<head>` element using
// `dangerouslySetInnerHTML` (https://github.com/piconic-ai/barefootjs/issues/2557).
// Intrinsic string tags only: a function component must receive the caller's
// props untouched (it may forward `dangerouslySetInnerHTML` itself).
export function jsx(tag: string | Function, props: Record<string, unknown>, key?: string) {
  return honoJsx(tag, typeof tag === 'string' ? resolveDangerouslySetInnerHTML(props) : props, key)
}

export function jsxs(tag: string | Function, props: Record<string, unknown>, key?: string) {
  return honoJsxs(tag, typeof tag === 'string' ? resolveDangerouslySetInnerHTML(props) : props, key)
}

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
