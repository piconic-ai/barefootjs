/**
 * Fixtures that compile clean on this adapter but render divergent from the
 * Hono reference on real Text::Xslate. The conformance `skipJsx` set and
 * `packages/compat`'s published fixture-divergences both derive from this
 * one object, so the skip list and the declaration can't drift. Keep the
 * file even when the set is empty — the next divergence lands here, not in
 * a re-created file.
 */

import type { RenderDivergences } from '@barefootjs/jsx'

export const renderDivergences: RenderDivergences = {
  // #2679: Kolon's `: my $x = …` is a fresh lexical declaration already in
  // scope inside its own initializer, so a self-referencing derived signal/
  // memo (getter shares its name with the prop it derives from) can't be
  // lowered to an in-template recompute the way the other six template-
  // stash backends do — `generateDerivedMemoSeed` skips it. No caller
  // override ever applies (the derivation never re-runs at SSR), and with
  // no caller prop there is no in-template fallback either.
  'signal-prop-same-name':
    'self-derived signal has no in-template recompute — a caller-supplied prop is never re-derived and an absent prop renders empty instead of the static default (https://github.com/piconic-ai/barefootjs/issues/2679)',
  'signal-prop-same-name-derived':
    'self-derived signal has no in-template recompute — a caller-supplied prop passes through raw (unmultiplied) and an absent prop renders empty instead of the statically-derived default (https://github.com/piconic-ai/barefootjs/issues/2679)',
  // Same #2679 defect, surfaced by the same self-name collision
  // (`createSignal(props.x ?? 7)`) — the caller omits `x`, so with no
  // in-template recompute the stash seed (`propName: 'x', value: null`)
  // has nothing to fall back to; the dependent memo inherits the gap.
  'signal-default-from-jsx':
    'self-derived signal has no in-template recompute — an absent prop renders empty instead of the JSX-time default, and the dependent memo inherits the gap (https://github.com/piconic-ai/barefootjs/issues/2679)',
}
