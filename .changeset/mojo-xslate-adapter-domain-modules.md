---
"@barefootjs/mojolicious": patch
"@barefootjs/xslate": patch
---

Refactor the Mojolicious and Text::Xslate adapters: decompose the monolithic single-file `MojoAdapter` (~2994 lines) and `XslateAdapter` (~2561 lines) into the same focused domain modules the Go adapter uses, behind a narrow `*EmitContext` seam (issue #2018 track D).

Internal-only, output byte-identical (verified by the adapter conformance suites — mojo 527 pass / 0 fail, xslate 353 pass / 0 fail). No behavioural or public-API change (`MojoAdapterOptions` / `XslateAdapterOptions` re-exported unchanged):

- `emit-context.ts` — `*EmitContext` / `*SpreadContext` / `*MemoContext`: the contracts the extracted modules depend on instead of the concrete adapter class.
- `lib/types.ts` / `lib/constants.ts` / `lib/{perl,kolon}-naming.ts` / `lib/ir-scope.ts` — render-context & options types, the template-primitive tables, Perl/Kolon hash-key quoting, and IR scope traversal.
- `analysis/component-tree.ts` — `hasClientInteractivity` and the BF103 imported-loop-child check.
- `value/parsed-literal.ts` — const-initializer string-literal lowering and string-type helpers.
- `expr/operand.ts` / `expr/array-method.ts` / `expr/emitters.ts` — operand-type classification, the array/string method lowering, and the filter- and top-level `ParsedExpr` emitters.
- `memo/seed.ts` — in-template derived-memo / context seeding.
- `spread/spread-codegen.ts` — conditional-spread / object-literal → Perl/Kolon hashref lowering.
- `props/prop-classes.ts` — per-compile prop classification sets.

`type/` is intentionally absent: unlike the Go adapter, these template targets are dynamically typed and emit no struct/type codegen.

Helpers that are byte-identical across the two Perl-family adapters are marked `SHARED CANDIDATE` as groundwork for a future shared Perl-evaluator codegen module.
