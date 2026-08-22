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
//
// #2696 (F2 harness-leniency measurement): the test harness's
// `evaluateSignalInit` used to seed a signal by actually EXECUTING its
// initializer against the fixture's raw props — strictly more powerful
// than production's static `extractSsrDefaults`/`tryStaticEval`
// (`packages/jsx/src/ssr-defaults.ts`), which has no support for `.map()`
// on any receiver shape. Removing that harness-only leniency (so this
// package seeds root components the same way a real before_render-
// equivalent integration does, from `deriveStashFromDefaults` alone)
// surfaced three fixtures where production itself never gets a working
// seed. Graduate by fixing `tryStaticEval` (or adding an in-template
// recompute path for the affected signals) so the manifest's static seed
// is correct, regenerating `expectedHtml`, and deleting these entries.
export const renderDivergences: RenderDivergences = {
  'todo-app':
    'the `todos` signal seeds from `(props.initialTodos ?? []).map(t => ({ ...t, editing: false }))` — a different-prop-derived `.map()` chain `extractSsrDefaults` cannot statically resolve, and `computeSsrSeedPlan` classifies it opaque (no in-template recompute), so it seeds `undef`; the non-`/* @client */`-marked `{todos().length > 0 && ...}` toggle-all block SSRs as if there are zero todos regardless of `initialTodos` (https://github.com/piconic-ai/barefootjs/issues/2696)',
  'todo-app-ssr':
    "same root cause as `todo-app` (https://github.com/piconic-ai/barefootjs/issues/2696); this fixture's todo-list loop carries no `/* @client */` marker, but Kolon's `for` iterates an undef list as empty rather than raising, so it SSRs an empty `<ul class=\"todo-list\">` with the toggle-all controls also absent, regardless of `initialTodos`",
  'callback-param-shadows-prop':
    "the `first` signal seeds from `[{ a: 'p' }].map((title) => title.a).join(',')` — a constant expression `extractSsrDefaults` still cannot statically resolve (`.map()` is unsupported for any receiver) and, unlike the sibling `joined` memo's structurally similar chain, gets no in-template recompute (`computeSsrSeedPlan` classifies it opaque too); `<span>{first()}</span>` SSRs empty instead of `p` (https://github.com/piconic-ai/barefootjs/issues/2696)",
}
