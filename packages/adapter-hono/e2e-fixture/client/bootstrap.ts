/**
 * A hand-written, non-component script entry — stands in for
 * `integrations/hono/client/router-entry.ts` in tests: not a `.tsx`
 * component, so core's discovery/`scriptAssets` machinery never sees it,
 * but its bundled URL still needs to reach a plain `.tsx` SSR file (the
 * `assets`/`assetsOutputFile` option under test).
 */
export const bootstrapped = true
