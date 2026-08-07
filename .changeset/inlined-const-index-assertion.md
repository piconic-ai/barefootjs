---
"@barefootjs/jsx": patch
"@barefootjs/hono": patch
---

Inlining a `Record` const into a JSX binding no longer re-exposes an
unnarrowed index. The IR's lookup key is type-stripped source text, so a
narrowing assertion written at the use site
(`strokePaths[name as keyof typeof strokePaths]`) was gone by the time the
record's cases were folded into the emitted `.tsx`, leaving the literal's
exact key set indexed by the binding's full union — TS7053 in any consumer
that type-checks its compiled templates. The inlined object literal is now
annotated `as Record<string, string>` for adapters that preserve types, on
both emit paths (element attributes and the component-prop values that get
collapsed to a JS expression at IR construction time). The three
byte-identical copies of the template-part renderer behind those paths are
now one module. Type-only — no emitted-JS or rendered-HTML change.
