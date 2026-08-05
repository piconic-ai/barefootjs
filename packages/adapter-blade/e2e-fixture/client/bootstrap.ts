/**
 * A hand-written, non-component script entry — stands in for
 * `integrations/laravel/client/router-entry.ts` in tests: not a `.tsx`
 * component, so core's discovery/`scriptAssets` machinery never sees it,
 * but its bundled URL still needs to reach the compiled PHP blog shell (the
 * `assets`/`assetsOutputFile` option under test).
 */
export const bootstrapped = true
