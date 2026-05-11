/**
 * BarefootJS Hono JSX Extension - Development Runtime
 *
 * Re-exports `jsxDEV` / `Fragment` from hono/jsx and surfaces the same
 * JSX namespace as the production runtime so dev builds see identical types.
 */

export { jsxDEV, Fragment } from 'hono/jsx/jsx-dev-runtime'
export type { JSX } from '../jsx-runtime'
