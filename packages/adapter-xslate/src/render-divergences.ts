/**
 * Fixtures that compile clean on this adapter but render divergent from the
 * Hono reference on real Text::Xslate. The conformance `skipJsx` set and
 * `packages/compat`'s published fixture-divergences both derive from this
 * one object, so the skip list and the declaration can't drift. Keep the
 * file even when the set is empty — the next divergence lands here, not in
 * a re-created file.
 */

import type { RenderDivergences } from '@barefootjs/jsx'

// #2679 graduated (capture-before-shadow in `generateDerivedMemoSeed`,
// packages/adapter-xslate/src/adapter/memo/seed.ts): a self-referencing
// derived signal/memo now seeds a throwaway `__bf_seed_<name>` local from
// the RAW-stash-var Kolon lowering BEFORE `$<name>` is declared, then binds
// the real name off that capture — the same in-template recompute the other
// six template-stash backends already had. Keep the file even when the set
// is empty — the next divergence lands here, not in a re-created file.
export const renderDivergences: RenderDivergences = {}
