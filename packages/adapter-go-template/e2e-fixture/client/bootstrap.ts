/**
 * A hand-written, non-component script entry — stands in for
 * `integrations/gin/client/router-entry.ts` in tests: not a `.tsx`
 * component, so core's discovery/`scriptAssets` machinery never sees it,
 * but its bundled URL still needs to reach generated Go code (the
 * `assets`/`assetsOutputFile` option under test).
 */
export const bootstrapped = true
