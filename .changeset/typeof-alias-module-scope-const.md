---
"@barefootjs/jsx": patch
"@barefootjs/hono": patch
---

Emitted templates now preserve the source module's shape: type
declarations, module-scope constants, and module-scope functions are
emitted at module scope, once per file, in source order — exported and
non-exported together. Previously type declarations were re-emitted per
component while values were localised into each component body, a
structural mismatch behind a family of consumer type-check breaks: a type
alias querying a localised const (`keyof typeof strokePaths`) failed
TS2304 and silently widened to `string | number | symbol`; the same query
in a props annotation did the same through the synthesized hydration
alias; types shared by several components were redeclared per component
(TS2300); an exported type no component referenced was pruned from the
template entirely (TS2305 on the consumer's `import type`); and exported
consts were emitted below non-exported readers (a module-load TDZ crash).
Declarations flagged module-level by the analyzer but actually closing
over component state are demoted back into the body by the same
reachability fixpoint the client bundle uses. Multi-component files merge
their module-scope blocks with top-level-statement dedup. Across the
compiled `ui/` corpus this removes 286 of 447 consumer-visible type
diagnostics with zero new ones, and a new corpus type-check gate
(`corpus-typecheck.test.ts`) holds that line. Rendered HTML is unchanged.
