# Onboarding DX + TSX fidelity exploration (2026-08-01)

A fresh-user walkthrough of the onboarding flow (scaffold → install → dev →
build an app), followed by a systematic hunt for cases where the TSX a user
writes is **not faithfully reproduced** by the compiled output. Everything was
run against workspace HEAD (packages installed into the scaffolded app as
`npm pack` tarballs so `bf build`, the adapter, and the client runtime all came
from this checkout), verified in a real browser (headless Chromium via
Playwright) against `wrangler dev`.

Apps built along the way: the starter Counter, a working task manager
("Trailhead Tasks": add / toggle / filter / remove / derived stats), and three
edge-case galleries (~60 distinct TSX patterns exercised end-to-end, SSR
snapshot vs. hydrated DOM vs. post-interaction DOM).

## TL;DR

The happy path is genuinely excellent — scaffold to working hydrated app in
minutes, and the vast majority of natural TSX (including patterns known to trip
naive compilers) reproduces faithfully in both SSR and CSR. Four real fidelity
gaps surfaced, all silent (zero compile diagnostics, zero console errors):

| # | Severity | Pattern | Result |
|---|----------|---------|--------|
| 1 | High | `if (sig()) return <A/>; return <B/>` (signal-conditioned early return) | UI can never leave its initial branch — no branch-switch effect is emitted, despite `spec/compiler.md` promising "Client JS handles all branches and switches at runtime" |
| 2 | High | `<select value={sig()}>` | SSR emits invalid `value` attribute on `<select>` instead of `selected` on the matching `<option>` → wrong selection pre-hydration / for no-JS users; snaps to correct value on hydrate |
| 3 | Medium | `<textarea value={sig()}>` | SSR emits `value` attribute (ignored by browsers) instead of element content → empty textarea pre-hydration |
| 4 | Medium | Controlled `<select>` whose `<option>`s come from a keyed loop | Reordering the options list corrupts the selection (observed `b` → `a`); the `select.value` effect keys on the value signal only and never re-asserts after loop reconciliation |
| 5 | Low | `{expr && <jsx/>}` with falsy non-nullish `expr` (`0`, `NaN`, `''`) | Renders nothing; React and Solid both render the falsy value (the famous React `0 &&` footgun). Divergence from JSX-ecosystem semantics, undocumented |
| 6 | Low | JSX whitespace normalization | Leading/trailing newline+indent becomes a space instead of being trimmed (React drops it): `' one two  three … '` vs React's `'one two three …'`. Invisible under normal CSS, visible under `white-space: pre*` |

One DX observation outside the compiler: `BfScripts` swallows
`useRequestContext()` failures (`catch { return null }`), so any environment
where two `hono` instances coexist (the file's own header comment describes the
jsxImportSource variant of this) renders server HTML that **silently never
hydrates** — no script tags, no console error, buttons just do nothing. A
`console.warn` in that catch (dev builds at least) would have saved the one
debugging detour of this session.

## Finding 1 — signal-conditioned early return compiles to dead UI

The most consequential one, because the pattern is the single most common way
React users write loading/empty states, it compiles **clean**, and the broken
half is invisible until you click.

```tsx
'use client'
import { createSignal } from '@barefootjs/client'

export function TryEarlyMin() {
  const [loading, setLoading] = createSignal(true)

  if (loading()) {
    return <p onClick={() => setLoading(false)}>loading</p>
  }
  return <p>ready</p>
}
```

Compiled client JS (`bf build`, hono adapter, HEAD):

```js
export function initTryEarlyMin(__scope, _p = {}) {
  if (!__scope) return
  const [loading, setLoading] = createSignal(true)
  const [_s0] = $(__scope, 's0')
  if (_s0) _s0.addEventListener('click', () => { setLoading(false) })
  // ← no insert()/effect that could ever swap branches
}

hydrate('TryEarlyMin', { init: initTryEarlyMin, template: (_p) =>
  `${loading() ? `<p …>loading</p>` : `<p …>ready</p>`}` })
  //  ^^^^^^^^^ out-of-scope identifier — ReferenceError if CSR-mounted
```

- Click handler fires, signal flips, nothing subscribes → the UI is permanently
  stuck on the SSR branch. Verified in-browser: DOM identical before/after
  click, zero console errors.
- The CSR template references `loading()` from a scope where it doesn't exist,
  so a client-side `createComponent` mount would throw. In a larger variant
  (loading branch + stats branch with a loop) the same template instead froze
  the condition to `(true)` — either way the second branch is unreachable.
- `spec/compiler.md` (IRIfStatement): "SSR renders only the matching branch.
  **Client JS handles all branches and switches at runtime.**" — so this is a
  spec violation, not a documented limitation. Prior early-return issues
  (#1401, #1404, #1405, #1409, #1414, #1422) covered raw-JSX leaks and local
  hoisting, all closed; none cover the missing runtime switch.

The semantically identical root ternary compiles **correctly** to an
`insert()` with per-branch `bindEvents`:

```tsx
return loading()
  ? <p onClick={() => setLoading(false)}>loading</p>
  : <p>ready</p>
```

That asymmetry (statement `if`/`return` dead, expression ternary live) is
exactly the kind of silent divergence a user can't predict. Until fixed,
either the early-return form should compile to the same `insert()` plan as the
ternary, or Phase 1 should refuse it loudly (a BF0xx with "rewrite as ternary"
help text). Silence is the only wrong option.

## Finding 2 — `<select value>` SSR: attribute instead of `selected`

```tsx
const [pick, setPick] = createSignal('b')
<select value={pick()} onChange={(e) => setPick(e.target.value)}>
  {list().map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
</select>
```

SSR HTML (hono adapter):

```html
<select data-case="controlled-select" value="b" bf="s5">
  <option value="a" data-key="a">Apple</option>
  <option value="b" data-key="b">Banana</option>   <!-- no `selected` -->
  <option value="c" data-key="c">Cherry</option>
</select>
```

`value` is not a valid attribute on `<select>`; browsers ignore it and select
the first option. React DOM's renderToString resolves `value` to a `selected`
marker on the matching option. Measured: pre-hydration `select.value === "a"`,
post-hydration `"b"` (the client effect `_s5.value = String(pick())` corrects
it). No-JS users, and anyone interacting before hydration completes, see the
wrong selection. The marked-template layer needs the same select/option
resolution React does — or at minimum the docs should call this out.

## Finding 3 — `<textarea value>` SSR: attribute instead of children

Same shape: `<textarea value={note()} …/>` SSR-renders as

```html
<textarea value="first line&#10;second line" rows="2" bf="s8"></textarea>
```

The `value` attribute is meaningless on `<textarea>` (content is its value), so
the field is empty until hydration sets `.value`. React renders the value as
element content. Also verified: typing round-trips fine after hydration; this
is purely an SSR-fidelity gap.

## Finding 4 — controlled select loses selection when options change

Continuing from Finding 2's setup, after hydration (select correctly showing
`b`), clicking a button that does `setList([...list()].reverse())` left the
select showing a **different option** (`a`) even though `pick()` still returns
`'b'`. The `<option>` loop reconciles by key, but the `select.value` effect
depends only on `pick` — nothing re-asserts the select's value after the
option nodes are moved/rewritten, and DOM selection state does not survive
option-list surgery. React re-applies `value` on every render, so this class
of bug can't happen there. Realistic trigger: options loaded/refreshed async
after the user (or SSR default) picked a value. Likely fix: the loop-patch path
(or `mapArrayLazy` caller) re-runs the enclosing select's value binding after
reconciliation.

## Finding 5 — `{0 && <jsx/>}` renders nothing

```tsx
<div>{count() && <em>truthy count</em>}</div>  // count() === 0
```

React renders `0` (the canonical footgun the React docs warn about); Solid's
insert renders `0` as text too. BarefootJS renders empty — SSR and CSR agree
with each other (so it's a *consistent* divergence) but both differ from the
ecosystem semantics of the same TSX, and `docs/core/rendering/jsx-compatibility.md`
doesn't mention it. Arguably the nicer behavior — but it should be a
documented, deliberate choice. (Literal `{0}`, `{NaN}` as direct children
render fine; the divergence is specific to `&&` short-circuit values.)

## Finding 6 — whitespace normalization differs from React

```tsx
<div>
  one
  two{' '}
  three <b>bold</b> tail
</div>
```

React: `one two three bold tail`. BarefootJS: `' one two  three bold tail '`
(leading/trailing space preserved, double space where the trimmed newline and
the explicit `{' '}` stack). Harmless under default CSS; observable under
`white-space: pre/pre-wrap` and in `textContent`-based tests.

## What worked faithfully (verified end-to-end)

Worth recording, because the breadth is impressive — each of these matched
between SSR HTML, hydrated DOM, and post-interaction DOM, with zero console
errors:

- **Reactivity**: signals, memos, memo-of-memo, template literals over
  signals, inline arithmetic, optional chaining + `??` over a nullable object
  signal, reactive props into child components (`<Button disabled={sig()}>`
  toggling live), parent-scope interpolation inside child-component children,
  batchless multi-signal updates.
- **Loops**: keyed map, nested map, `Object.entries().map()`, component-per-row
  (`<Row {...}/>` in map) including client-side row addition, keyed reorder of
  plain lists, `.filter().map()` via memo, dynamic add/remove/toggle
  (Trailhead Tasks app end-to-end).
- **Conditionals**: root-level ternary component swap (`insert()` +
  per-branch event binding), inline ternary/`&&` with truthy signals, nested
  ternaries, empty-state ↔ list swap.
- **Attributes**: escaping in text and attributes (`<`, `&`, quotes — both
  directions), HTML entities decoded, unicode/emoji, boolean attributes
  (`disabled`, `hidden`, `readOnly`, shorthand `disabled`), `aria-*` string
  serialization (`aria-hidden="false"`), `data-*`/`tabIndex` numerics, style
  objects incl. numeric px inference (`width: 40` → `40px`) and reactive style
  values, `class` (auto-normalized to `className`), `htmlFor` → `for`, spread
  onto intrinsic elements, template-literal classNames.
- **Forms**: controlled text input round-trip (type → signal → value),
  controlled number input, checkbox `checked`, form `onSubmit` +
  `preventDefault`, `onChange`/`onInput`/`onDblClick`.
- **Misc**: `dangerouslySetInnerHTML` (SSR + reactive client swap), fragments,
  JSX comments stripped, SVG with camelCase attrs, adjacent text/expression
  spacing, `{0}`/`{NaN}` literal children, falsy literals rendering nothing.
- **Diagnostics DX**: BF043 (props destructuring) fires with a precise span and
  actionable help; `bf build` error output generally excellent.

## Onboarding DX notes

- Scaffold (`create-barefootjs` → `bf init`) → `npm install` → `npm run dev` →
  working hydrated counter: smooth, fast, zero surprises. The generated
  project layout matches the quick-start doc exactly.
- `bf init` being gated behind `BAREFOOT_INIT_VIA_CREATE` with a helpful
  redirect message is good guardrail design.
- The `@/components/*` paths mapping (build output first, source fallback) is
  clever but worth a doc callout: importing the *source* Counter in a context
  where `public/components/` hasn't been built yet silently renders without
  hydration markers.
- `BfScripts`' silent `catch { return null }` (see TL;DR) turns environment
  mistakes into "nothing hydrates, no error anywhere". A dev-mode warn would
  make the failure loud.

## Suggested next steps

1. File issues for Findings 1–4 (1 and 4 are behavioral bugs with clear
   repros; 2 and 3 are SSR-fidelity gaps in the hono marked-template emitter).
2. Decide + document the `&&`-falsy semantics (Finding 5) in
   `jsx-compatibility.md` either way.
3. Consider a CSR-conformance fixture for "early return over a signal" so the
   fix for Finding 1 lands with the mechanical backstop the repo already uses
   for map-body soundness (`sound-or-loud`; today this shape is neither).
