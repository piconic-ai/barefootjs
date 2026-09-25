/**
 * Fixtures that compile clean on this adapter but render divergent from the
 * Hono reference on real Text::Xslate. The conformance `skipJsx` set and
 * `packages/compat`'s published fixture-divergences both derive from this
 * one object, so the skip list and the declaration can't drift. Keep the
 * file even when the set is empty — the next divergence lands here, not in
 * a re-created file.
 */

import type { RenderDivergences } from '@barefootjs/jsx'

// #2696 graduated: `todo-app` / `todo-app-ssr` seeded `todos` opaque
// because their `.map(t => ({ ...t, editing: false }))` callback body's
// object-literal SPREAD refused (`checkSupport`). Step 2 admits a spread
// at value position and the runtime evaluator's `object-literal` case
// now merges it, so the seed classifies `derived` and SSRs identically
// to Hono.
// #2679 graduated (capture-before-shadow in `generateDerivedMemoSeed`,
// packages/adapter-xslate/src/adapter/memo/seed.ts): a self-referencing
// derived signal/memo now seeds a throwaway `__bf_seed_<name>` local from
// the RAW-stash-var Kolon lowering BEFORE `$<name>` is declared, then binds
// the real name off that capture — the same in-template recompute the other
// six template-stash backends already had. Keep the file even when the set
// is empty — the next divergence lands here, not in a re-created file.
// #2943 graduated: a BODY-destructured prop's default now reaches
// `ParamInfo.defaultValue` directly (the analyzer overlays it onto
// `propsParams` at the binding's own declaration), so `extractSsrDefaults`
// seeds the evaluated default and the adapter's nullable-optional
// classification no longer treats the prop as defaultless — `data-label`
// now renders `'none'` here exactly like Hono, both for a plain default
// and a renamed one.
// #2994 graduated both entries formerly here (`module-const-arrow-helper`,
// `module-function-helper-chain`): a module-scope helper call in a
// template position (arrow-valued const OR `function` declaration) now
// refuses loudly with BF101 instead of silently rendering empty — see
// `conformance-pins.ts`.
export const renderDivergences: RenderDivergences = {
  // #3119 graduated `dialog`/`dropdown-menu`/`popover`/`portal`: an
  // `ssrPortalOwnerScope`-flagged element now stamps `bf-po` on its own
  // tag and routes through `$bf.register_portal_element`/`$bf.portals()`
  // instead of rendering inline — see `wrapSsrPortalElement`
  // (`adapter/xslate-adapter.ts`) and `register_portal_element`/`portals`
  // (`@barefootjs/perl`'s shared `BarefootJS.pm`).
  // `combobox` / `select` were re-pinned here on the SAME assumption
  // (their `Content` element uses the identical `ref`-callback
  // SSR-portal pattern), but never re-verified against a real render.
  // They in fact ALREADY render the portal correctly and match Hono
  // byte-for-byte — `isSsrPortalRefCallback` (`jsx-to-ir.ts`) already
  // covers `SelectContent`'s `queueMicrotask(() => createPortal(...))`
  // deferral (see that function's own docstring), and this adapter
  // renders `ssrPortalOwnerScope` through the same shared,
  // component-agnostic path #3119 built for the other four. The portal
  // divergence never applied here; the two stayed skipped only because
  // the compiled fixture failed elsewhere the whole time (first the
  // graduated `nested-child-static-prop-text-slot-elided` marker bug),
  // so nobody re-ran them to notice. No divergence remains on this
  // adapter (verified against a real render of both fixtures).

  // Static text directly adjacent to a conditional renders with a space
  // between the text and the chosen branch (`x: off` for Hono's `x:off`).
  'text-then-conditional': { limitation: 'text-adjacent-conditional-whitespace' },
  'text-then-conditional-static': { limitation: 'text-adjacent-conditional-whitespace' },
  // On this adapter `conditional-then-text` (`{…}:y`) does not get as far as
  // the space: its text also starts a line with `:`, so it throws the Kolon
  // parse error pinned by `conditional-then-colon-text` below. A fixture
  // belongs to one registry entry, so it stays cited here, for the space
  // the sibling DSL adapters render and this one would once it parses.
  'conditional-then-text': { limitation: 'text-adjacent-conditional-whitespace' },

  // A boolean-literal `const` (module or function scope) read as a ternary
  // test never reaches the template: it is read as an unset variable, so
  // the falsy branch renders (`data-x="b"` for Hono's `data-x="a"`).
  'const-boolean-conditional-test': { limitation: 'literal-const-conditional-test' },
  'module-const-boolean-conditional-test': { limitation: 'literal-const-conditional-test' },
  // Text after a ternary lands at the start of its own template line
  // (after `: }`). Starting with `:` (after optional spaces), Kolon reads
  // that line as line code, so ` :y</p>` fails to parse ("Expected a
  // semicolon or block end"); a bare `:` line parses as an empty statement
  // and the text silently vanishes.
  'conditional-then-colon-text': { limitation: 'line-statement-sigil-text-after-conditional' },
}
