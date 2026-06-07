---
"@barefootjs/go-template": patch
"@barefootjs/mojolicious": patch
"@barefootjs/xslate": patch
---

Lower the object-rest `.map()` destructure param read via member access on all three SSR adapters, graduating the `rest-destructure-object-in-map` conformance fixture (previously pinned to BF104).

`tasks().map(({ id, title, ...rest }) => <li>{title}:{rest.flag}</li>)` now resolves each binding against a per-item loop variable instead of refusing the destructure pattern:

- **Go**: `{{range $_, $bfItem := …}}` with `$bfItem.Title` / `$bfItem.Flag` (the `rest` binding maps to the bare range var so the member emitter renders `rest.flag` → `$bfItem.Flag`).
- **Mojo**: a per-binding Perl `my` local off the item (`my $rest = $bfItem;` so `$rest->{flag}` resolves).
- **Xslate**: the equivalent Kolon `: my` binding locals.

Only the object-rest-via-member shape is graduated. The other three rest-destructure fixtures stay refused (BF104), because they need machinery the SSR `range`/`for` can't express inline:
- `rest-destructure-object-spread-in-map` (`{...rest}`) needs a residual object excluding the consumed keys,
- `rest-destructure-array-in-map` (`[a, ...t]`) needs index/slice,
- `rest-destructure-nested-in-map` (`{ cells: [h, ...r] }`) needs nested index paths.

A shared supportability gate (`destructureBindingsSupportable`) checks the IR's `paramBindings` (simple `.field` paths + object-rest, no rest-spread) so unsupported shapes keep the existing diagnostic. Verified against real Go 1.25.6 / Mojolicious 9.35 / Text::Xslate v3.5.9; Hono reference snapshots unchanged.
