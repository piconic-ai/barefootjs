---
"@barefootjs/jsx": patch
"@barefootjs/go-template": patch
"@barefootjs/mojolicious": patch
"@barefootjs/xslate": patch
---

Lower the object-rest `.map()` destructure param read via member access on all three SSR adapters, graduating the `rest-destructure-object-in-map` conformance fixture (previously pinned to BF104).

`tasks().map(({ id, title, ...rest }) => <li>{title}:{rest.flag}</li>)` now resolves each binding against a per-item loop variable instead of refusing the destructure pattern:

- **Go**: `{{range $_, $__bf_item0 := …}}` with `$__bf_item0.Title` / `$__bf_item0.Flag` (the `rest` binding maps to the bare range var so the member emitter renders `rest.flag` → `$__bf_item0.Flag`).
- **Mojo**: a per-binding Perl `my` local off the item (`my $rest = $__bf_item;` so `$rest->{flag}` resolves).
- **Xslate**: the equivalent Kolon `: my` binding locals.

The synthetic per-item variable uses a reserved `__bf_item` name (depth-suffixed on Go) to avoid colliding with a user binding of the same name.

Only the object-rest-via-member shape is graduated. The other three rest-destructure fixtures stay refused (BF104), because they need machinery the SSR `range`/`for` can't express inline:
- `rest-destructure-object-spread-in-map` (`{...rest}`) needs a residual object excluding the consumed keys,
- `rest-destructure-array-in-map` (`[a, ...t]`) needs index/slice,
- `rest-destructure-nested-in-map` (`{ cells: [h, ...r] }`) needs nested index paths.

A shared IR-level gate (`isLowerableObjectRestDestructure`, exported from `@barefootjs/jsx`) keeps every other shape on the existing BF104 diagnostic. It walks the whole loop subtree (elements, components, conditionals, async, providers, template literals) and refuses when the rest binding is spread or used as a bare value (`String(rest)`, `{rest}`) — those need a residual object — as well as when the loop also has a `.filter()` predicate. The Go adapter suffixes its synthetic range var with the nesting depth (`$__bf_item0`, `$__bf_item1`) so nested destructure loops don't shadow each other. Verified against real Go 1.25.6 / Mojolicious 9.35 / Text::Xslate v3.5.9; Hono reference snapshots unchanged.
