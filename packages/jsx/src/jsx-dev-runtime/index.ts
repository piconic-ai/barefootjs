/**
 * BarefootJS JSX Dev Runtime - Type Definitions Only
 *
 * Re-exports JSX namespace from jsx-runtime for development mode.
 */

// Import for local use (`JSX.Element` below) AND re-export. A bare
// `export { JSX } from …` creates no local binding (TS2503) and, now that
// this is a real `.ts` rather than a `.d.ts`, trips isolatedModules'
// `export type` rule (TS1205) — both surfaced by `deno publish`.
import type { JSX } from '../jsx-runtime/index.ts'

export type { JSX }

export declare const jsxDEV: (
  tag: string | Function,
  props: Record<string, unknown>,
  key?: string
) => JSX.Element
export declare const Fragment: (props: { children?: unknown }) => JSX.Element
