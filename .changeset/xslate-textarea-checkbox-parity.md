---
"@barefootjs/xslate": patch
---

Bring the Text::Xslate (Kolon) adapter to parity with the Mojolicious adapter on the Phase 2b `textarea` and `checkbox` conformance fixtures, which it previously skipped.

Ported (in Kolon form) from the Mojo adapter:

- **Conditional inline-object spread** — `{...(cond ? { 'aria-describedby': x } : {})}` (and the function-scope local-const form `const sizeAttrs = size ? { ... } : {}; {...sizeAttrs}`) now lowers to a Kolon inline ternary of hashrefs through `$bf.spread_attrs(...)` instead of raising `BF101`.
- **`Record<staticKeys, scalar>[propKey]` spread value** — CheckIcon's `sizeMap[size]` lowers via the shared `parseRecordIndexAccess` to an inline bracket-indexed Kolon hashref `{ 'sm' => 16, ... }[$size]`. Note: Kolon indexes a hashref literal with bracket syntax `{…}[$key]`, not Perl's arrow-deref `{…}->{$key}` (which Kolon's parser rejects).
- **Nullish optional-attribute omission** — an optional, no-default, nillable prop (e.g. textarea's `rows`) is now guarded with a Kolon `: if (defined $rows) { … : }` block so the attribute drops when unset rather than rendering `rows=""`.
- **Props-object inherited-attribute enumeration** — `function Checkbox(props: CheckboxProps)` now calls the shared `augmentInheritedPropAccesses(ir)` so inherited bare optional attributes (`id={props.id}`) get the `defined`-guard.
- **Hyphenated child rest-bag routing** — a hyphenated child prop name (`<CheckIcon data-slot="checkbox-indicator" />`) is now quoted in the `render_child` hashref (`'data-slot' => …`); an unquoted key parses as subtraction in Kolon.

The test renderer now defers the child-compile error gate and re-checks only the components a fixture transitively references, so a sibling source file that exports an unreferenced component which legitimately can't lower to Kolon (e.g. `../icon`'s generic `Icon`, which splats `{...props}` onto child components — no Kolon form) no longer blocks a fixture that never renders it.
