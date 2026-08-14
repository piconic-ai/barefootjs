---
'@barefootjs/jsx': patch
'@barefootjs/blade': patch
'@barefootjs/erb': patch
'@barefootjs/go-template': patch
'@barefootjs/jinja': patch
'@barefootjs/mojolicious': patch
'@barefootjs/rust': patch
'@barefootjs/twig': patch
'@barefootjs/xslate': patch
---

`ErrorSuggestion` gains an optional `escape?: ReadonlyArray<{ kind: EscapeKind }>` — the structured half of a refusal's suggestion (#2613, #2614). `EscapeKind` and `ESCAPE_SSR_COST` are exported from `@barefootjs/jsx` alongside it.

This is what lets a tool answer "how does the user get out of this refusal?" without parsing prose. `suggestion.message` stays authoritative for humans — several sites have site-specific wording no enum should flatten — while `escape` is authoritative for machines, and `ESCAPE_SSR_COST` is the one place the trade each kind makes is defined (`'client-directive'` renders nothing at SSR until hydration; `'prop-precompute'` and `'rewrite'` keep full server output). Consumers surfacing an escape should surface its cost from that map rather than restating it, so the trade cannot be quietly dropped on the way to a user.

The field is additive and one-way: it is populated at the BF101 refusal sites behind #2320/#2321 in every DSL adapter, and absent elsewhere. **Absent means "not declared yet", never "no escape exists"** — do not infer unescapability from its absence.

Adapter authors: what you claim here is checked. `escape-coverage.test.ts` verifies that every kind a diagnostic claims is demonstrated by a conformance twin that actually compiles clean on the refusing adapter, so a claim can no longer outrun its proof.

No emission or runtime behavior changes.
