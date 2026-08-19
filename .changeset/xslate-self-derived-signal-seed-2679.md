---
"@barefootjs/xslate": patch
---

A self-referencing derived signal/memo (getter shares its name with the prop it derives from, e.g. `const [size] = createSignal(props.size ?? 'icon')`) now seeds correctly in-template on Text::Xslate instead of rendering empty for an absent prop or passing a non-idempotent derivation through un-derived (#2679)

`generateDerivedMemoSeed` previously skipped this shape entirely: Kolon's `: my $x = …` is a fresh lexical already in scope inside its own initializer, so `: my $size = $size // 'icon'` would read the just-declared `undef` rather than the stash variable — a real hazard the skip was right to avoid. But #2669 changed what a same-named entry's static seed now carries (the RAW prop, not the pre-derived value), so with no in-template recompute the derivation silently never ran. `PaginationLink`'s `const size = createMemo(() => props.size ?? 'icon')` lost its `size-9` class on every rendered link.

The fix captures before shadowing: the self-referencing lowering is emitted as two statements instead of one, `: my $__bf_seed_<name> = <kolon>;` followed by `: my $<name> = $__bf_seed_<name>;`. In the first line `$<name>` still resolves to the stash variable — nothing has been declared under that name yet — so the lowered Kolon runs verbatim, unchanged; the second line then shadows `$<name>` with the already-evaluated result, exactly like every other derived step. The `__bf_seed_` prefix follows the adapter's existing internal-temporary convention (`__bf_item` / `__bf_pair`), and suffixing with the step's own name keeps multiple derived steps in one template collision-free.

This graduates all three fixtures `signal-prop-same-name`, `signal-prop-same-name-derived`, and `signal-default-from-jsx` off the adapter's `render-divergences.ts` ledger — Xslate now matches the other six template-stash adapters, and issue #2679 is fully resolved.
