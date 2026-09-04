---
"@barefootjs/jsx": patch
"@barefootjs/erb": patch
"@barefootjs/jinja": patch
"@barefootjs/mojolicious": patch
"@barefootjs/twig": patch
"@barefootjs/blade": patch
"@barefootjs/xslate": patch
"@barefootjs/rust": patch
"@barefootjs/go-template": patch
---

Fix #2822: on every DSL (non-JSX-runtime) adapter, a client component referenced under an import alias (`import { Foo as Bar } from './Foo'`, `<Bar/>`) compiled with no diagnostics, but the SSR cross-template/partial call was built from the caller-LOCAL alias name (`Bar`) instead of the child's own DECLARED/exported name (`Foo`, what the child's own module registers its template under). This broke the call at runtime — confirmed on real Ruby ERB, Python Jinja2, Perl Mojolicious, PHP Twig, PHP Blade, Perl/Text::Xslate (which silently DROPPED the child, the worst variant), Rust minijinja, and Go `html/template`.

This is the SSR-side counterpart of #2777 (fixed for the client-JS registry key in a prior PR): `initChild`/`renderChild`/`@bf-child:` emission was already correct, but each DSL adapter's own cross-template-call-name builder (`toTemplateName`-equivalent) was not.

Exports `buildImportAliasMap` (local alias -> declared name, built from `ir.metadata.imports`) from `@barefootjs/jsx`'s public API — previously internal to the client-JS generator (`ir-to-client-js/component-scope.ts`) — so every DSL adapter package can build one alias map per compile and resolve `aliasMap.get(comp.name) ?? comp.name` at each cross-template-call-name site, rather than each adapter growing its own alias-resolution implementation (`CLAUDE.md`'s "one decision, two implementations" rule).

The Go template adapter needed the widest set of fixes since `IRComponent.name` (the caller-local alias) also drives the parent-side `New<Name>Props`/`<Name>Input` constructor call, several cross-file shape lookups (`childComponentShapes`, `childContextConsumers`, `childDerivedFieldDeps`, `childPropFieldNames`, `childRepropsReady`), and the static-child struct field's Go TYPE (as opposed to its field NAME, which stays keyed by the alias — that field is parent-private and self-consistent). The adapter's own real-Go-backend test harness (`test-render.ts`) also had a latent bug in `collectImportedComponentNames`, which computed the "reachable child" set from the caller-local alias instead of the declared name — an aliased import's compiled artifact was silently excluded from the combined build even once the adapter itself emitted the correct declared-name reference.

Graduates the `aliased-import-child-component` shared-corpus fixture (added alongside #2777) on all eight DSL adapters, each verified against its real backend (Ruby, Python, Perl, PHP x2, Rust/cargo, Go), closing #2822.
