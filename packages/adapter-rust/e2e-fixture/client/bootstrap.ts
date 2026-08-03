/**
 * A hand-written, non-component script entry — stands in for
 * `integrations/axum/client/router-entry.ts` in tests: not a `.tsx`
 * component, so core's discovery/`scriptAssets` machinery never sees it,
 * but its bundled URL still needs to reach the compiled Rust blog shell
 * (the `assets`/`assetsOutputFile` option under test).
 */
export const bootstrapped = true
