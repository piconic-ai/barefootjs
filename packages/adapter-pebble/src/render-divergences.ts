/**
 * Fixtures that compile clean on this adapter but render divergent from the
 * Hono reference on real Java/Pebble. The conformance `skipJsx` set and
 * `packages/compat`'s published fixture-divergences both derive from this
 * one object, so the skip list and the declaration can't drift. Keep the
 * file even when the set is empty — the next divergence lands here, not in
 * a re-created file.
 */

import type { RenderDivergences } from '@barefootjs/jsx'

// #2994/#3000/#3012 fixed the silent-render divergence on all 8 sibling
// non-JS adapters by teaching their `call()` fallback to refuse the shape
// loudly with BF101 (#3011, #3014+). Pebble was developed on a separate
// stacked branch and didn't exist on `main` when those PRs landed, so it
// never received the port and was still on the old silent-divergence
// behavior for all three fixtures formerly pinned here.
//
// #3022 graduated all three: `call()`'s generic fallback for a bare-name
// identifier callee now refuses loudly with BF101 (`conformance-pins.ts`)
// instead of silently resolving the name against Pebble's template scope
// (undefined → empty render / falsy-picks-the-wrong-branch). No
// `_boolContext`-style structural exemption was ported — `isValidElement`
// (the one caller that needed to keep compiling, `ui/components/ui/slot`'s
// `asChild` guard) is resolved as an identity-scoped `templatePrimitive`
// (`bf.is_element`, backed by a new Java port of the shared BarefootJS
// runtime's shape-check method, `java/.../Bf.java`) ahead of `call()`'s
// generic fallback, so it never reaches the refusal at all.
export const renderDivergences: RenderDivergences = {
  // A signal seeded from its own same-named prop keeps the prop's template
  // variable, so a raw `props.<name>` read beside it sees the derived value.
  'signal-from-same-named-prop-raw-read': { limitation: 'signal-from-same-named-prop-raw-read' },
  // A const reading a signal getter (`const b = count()`) read in a loop row
  // that binds the getter's name (`rows.map(count => …{b}…)`): the template
  // reads `b` as a variable that is never set.
  'const-getter-read-loop-shadowed': { limitation: 'loop-shadowed-const-alias-hop' },
  // A memo calling a local function named like a typed prop the body never
  // destructures: the server render reads the prop for the call.
  'memo-local-function-named-like-prop': { limitation: 'local-function-named-like-prop' },
  // The same shape from a signal seed and from markup: the server render
  // reads the prop for the call.
  'signal-seed-local-function-named-like-prop': { limitation: 'local-function-named-like-prop' },
  'markup-local-function-named-like-prop': { limitation: 'local-function-named-like-prop' },
  // A memo reading an ordinary const declared after it, named like a typed
  // prop: the server render does not read the const.
  'memo-const-declared-after-named-like-prop': { limitation: 'local-function-named-like-prop' },
  // `omitted-optional-number-arithmetic` used to sit here: an omitted
  // optional number prop read as `0` in arithmetic. A prop that can only be
  // absent now reads its nil as `undefined`, giving `NaN` (#3533).
  // `omitted-optional-nullable-number-arithmetic` used to sit here: an
  // omitted `n?: number | null` prop read as `0` in arithmetic. The type
  // cannot say which nil it stands for, so the arithmetic is now refused
  // with BF101 (`conformance-pins.ts`).
  // An explicit `null` carried by a `{...props}` spread onto a child: the
  // engine holds it and an omitted prop as the same nil, so the spread
  // carries the key only when it is not nil and an earlier explicit prop
  // keeps its value where JS overrides it with `null`.
  'component-spread-explicit-null': { limitation: 'props-spread-explicit-null-override' },
  // `object-length-property-filter` used to sit here: an object row's own
  // `length` property read 0 in an inline filter predicate. The runtime
  // length helper now reads the object's property (#3449).
  // `undefined-signal-arithmetic-memo` used to sit here: arithmetic over an
  // `undefined`-initialized signal read the nil operand as `0` or threw. The
  // operand now goes through the runtime's JS `Number()`, giving `NaN` (#3390).
  // `memo-loop-param-collision` used to sit here: an index param bound with
  // `{% set i = loop.index %}` overwrote the template-level memo `i` after
  // the loop. A loop now saves and restores each template-level name it
  // binds with `set`; it renders like Hono.
  // `nullish-signal-arithmetic-memo` used to sit here: `s() * 2` with
  // `s()` = `null` raised on the nil operand. A possibly-nullish arithmetic
  // operand now reads as `0` (`coerceNullishOperand`); it renders like Hono.
  // #3119 graduated `dialog`/`dropdown-menu`/`popover`/`portal`: an
  // `ssrPortalOwnerScope`-flagged element now stamps `bf-po` on its own
  // tag and routes through `bf.register_portal_element`/`bf.portals()`
  // instead of rendering inline — see `wrapSsrPortalElement`
  // (`adapter/pebble-adapter.ts`) and `register_portal_element`/`portals`
  // (`java/…/pebble/Bf.java`).
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
}

/**
 * Data points (`<fixture>:<point>`) that render divergent from the Hono
 * reference on this adapter while the fixture's primary render matches,
 * so the fixture itself is not in `renderDivergences`. The conformance
 * `skipDataPoints` set derives from the keys, and each entry cites the
 * limitation it is an instance of — same pattern as
 * `@barefootjs/go-template`'s `dataPointDivergences`.
 */
export const dataPointDivergences: Readonly<Record<string, { limitation: string }>> = {
  // `.at(-1)` on an empty string is `undefined`, which omits the attribute
  // in JS; the template renders `data-last=""`.
  'string-index-methods:gen:word:empty': { limitation: 'undefined-method-result-attr' },
}
