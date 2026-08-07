/**
 * BarefootJS Hono JSX Extension - Development Runtime
 *
 * Re-exports `jsxDEV` / `Fragment` from hono/jsx and surfaces the same
 * JSX namespace as the production runtime so dev builds see identical types.
 */

import { jsxDEV as honoJsxDEV, Fragment } from 'hono/jsx/jsx-dev-runtime'
import { resolveDangerouslySetInnerHTML } from '../resolve-dangerously-set-inner-html.ts'

export { Fragment }
export type { JSX } from '../jsx-runtime/index.ts'

// See `../resolve-dangerously-set-inner-html.ts` for why this is needed —
// hono's own `jsxFn` throws for a childless `<svg>`/`<head>` element using
// `dangerouslySetInnerHTML` (https://github.com/piconic-ai/barefootjs/issues/2557).
export function jsxDEV(tag: string | Function, props: Record<string, unknown>, key?: string) {
  return honoJsxDEV(tag, resolveDangerouslySetInnerHTML(props), key)
}
