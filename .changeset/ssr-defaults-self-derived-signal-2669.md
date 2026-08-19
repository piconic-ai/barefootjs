---
"@barefootjs/jsx": patch
"@barefootjs/erb": patch
"@barefootjs/jinja": patch
"@barefootjs/mojolicious": patch
"@barefootjs/blade": patch
"@barefootjs/twig": patch
"@barefootjs/rust": patch
"@barefootjs/xslate": patch
---

A signal or memo whose name collides with the prop its own initializer derives from now seeds its SSR template variable from the RAW prop instead of the derived value (#2669)

`extractSsrDefaults` builds its manifest map in three passes — prop entries, then signals, then memos — and the last two unconditionally overwrote a same-named prop entry, discarding its `propName`. The collision only arises in the bare-props-arg form (`function C(props: P)`), since `function C({ label })` alongside `const [label] = …` is a redeclaration error.

Template-stash adapters lower such a signal to an in-template recompute that READS the stash variable as its input (the raw caller prop) and OVERWRITES it with the derived value under the same name — `{% set label = (label if (label is defined and label is not none) else 'Default') %}`. With `propName` discarded, the manifest consumer (`_derive_stash_from_defaults` and its per-language twins) seeded that variable with the DERIVED value, so the recompute saw a non-nullish value and kept it: a caller-supplied `label='Hello'` could never win, and the SSR body rendered `Default` while `bf-p` correctly carried `Hello`. A non-idempotent derivation was wrong even with no caller props at all — `createSignal((props.count ?? 1) * 2)` seeded with the evaluated `2` re-derived to `2 * 2 = 4`.

Such an entry is now a prop entry (`propName` set, `value: null`), letting the template's own `?? <default>` guard supply the fallback and a caller-supplied prop win. This establishes an invariant consumers can rely on: a signal/memo entry carries `propName` if and only if it is one of these self-derivation collisions. A collision whose initializer does NOT read the same-named prop is unchanged.

**Text::Xslate is the exception.** Kolon's `: my $x = …` is a fresh lexical already in scope inside its own initializer, so a self-referencing derived step cannot be lowered to an in-template recompute at all and the adapter skips it. Xslate therefore has nowhere to perform the derivation at SSR time: a caller-supplied prop passes through un-derived, and an absent prop now renders empty rather than the static default it previously reached by coincidence. That gap is declared in the adapter's published fixture divergences and tracked in #2679.
