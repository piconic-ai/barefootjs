---
"@barefootjs/jsx": patch
"@barefootjs/hono": patch
"@barefootjs/go-template": patch
"@barefootjs/jinja": patch
"@barefootjs/xslate": patch
"@barefootjs/mojolicious": patch
"@barefootjs/erb": patch
"@barefootjs/blade": patch
"@barefootjs/twig": patch
"@barefootjs/rust": patch
---

Fixes #2943: a BODY-destructured prop's default (`function Foo(props: Props) { const { label = 'none' } = props; ... }`, renamed or not) now renders correctly on SSR across every backend, matching the parameter-destructured form (`function Foo({ label = 'none' })`). Previously `extractPropsFromTypeMembers` built `propsParams` purely from the TYPE annotation, with no notion of a body destructure's own default — every template-based adapter's presence-guard classification (`collectNullableOptionalProps` and its per-language equivalents) treated the prop as defaultless and OMITTED the attribute entirely when the caller didn't pass it, instead of falling back to the default the way Hono's real JS destructuring naturally does. A RENAMED default (`const { label: text = 'none' } = props`) was worse: it had no `propsParams` entry at all, so Jinja/Xslate/ERB/Blade/Twig/Rust read an undefined template variable unconditionally, Mojolicious fataled under Perl strict mode, and Go's Input struct had no field mapping for it — a `go run` compile error, not a soft divergence.

Fixed at the source: the analyzer now overlays a body-destructure default directly onto `ir.metadata.propsParams` (an unrenamed default overlays the existing type-member entry; a renamed one ADDS a second entry carrying `sourceName`, so the original un-renamed prop stays correctly classified too) — the same shared `ParamInfo` every consumer (each adapter's SSR classification, `extractSsrDefaults`'s stash seed, the CSR-fresh-mount `template:` lambda) already reads for a parameter-destructured default. A previous, narrower workaround in `jsx-to-ir.ts` (`_destructuredPropInfoByName`'s overlay, added for #2934) is removed as redundant now that the default lives on `propsParams` itself.

Two adapter-specific fixes were needed for the renamed+default shape: Hono's hydration-payload serialization now reads `props[sourceName ?? name]` instead of `props[name]` (a renamed synthesized entry has no real property under its local name), and Go's generated Input struct de-duplicates fields that share a caller-facing name, with an `interface{}`-safe fallback extraction for the case where the SAME underlying prop is also read bare elsewhere in the same component (which independently flips that field to a nillable `interface{}` type).

Graduates the `body-destructured-props-live` fixture on all 8 non-Hono adapters (their `renderDivergences` pins are removed) and adds `body-destructured-prop-default-renamed`, a new fixture covering the renamed+default shape across all 9 adapters.
