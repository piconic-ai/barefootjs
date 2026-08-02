---
"@barefootjs/jsx": patch
---

SSR-project controlled `value` on `<textarea>` and `<select>` (#2464, #2465)

`value` is not an attribute on `<textarea>` (its initial value is its element
content) or on `<select>` (the selection is `selected` on the matching
option). Emitting it verbatim shipped invalid HTML that browsers ignore, so
no-JS and pre-hydration users saw an empty textarea / the wrong option until
the hydrate-time `.value` effect snapped it.

The lowering lives in the shared IR build, so every adapter inherits it:

- the `value` attr is marked `clientOnly` — SSR skips it, the existing
  hydrate-time `.value` property binding is unchanged;
- `<textarea>` with no authored children gains a NON-reactive expression
  child (initial content only — updates keep flowing through the `.value`
  effect);
- `<select>` distributes `selected={(value) === 'opt'}` onto each
  statically-valued `<option>` (including under `<optgroup>`), the exact
  per-option comparison shape the `select-option-selected` fixture already
  proves across every adapter. An authored `selected` wins; options rendered
  by a dynamic loop cannot be statically distributed and are left to the
  hydrate-time effect (the reorder interaction is #2466).

The `select-value-ssr` / `textarea-value-ssr` fixtures graduate everywhere:
hono `skipJsx` is now empty, the `renderDivergences` entries in all 8
template adapters are deleted, and the generator's `SKIP_AUTO_UPDATE` set is
empty again — both fixtures' `expectedHtml` now regenerates from the
reference like any other fixture.
