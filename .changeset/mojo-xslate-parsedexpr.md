---
"@barefootjs/mojolicious": patch
"@barefootjs/xslate": patch
---

Lower conditional-spread and inline object-literal expressions from the IR-carried structured `ParsedExpr` tree instead of re-parsing source with `ts.createSourceFile` at emit time (#2018, mirroring go-template's U5/U6/Roadmap-A). Behaviour and output are unchanged — the condition and scalar values still route through `convertExpressionToPerl` / `convertExpressionToKolon`, which re-parse, so the emitted Perl/Kolon stays byte-identical. The now-orphaned `parsePureStringLiteral` (superseded by the shared `collectModuleStringConsts`) was removed from the Mojo adapter.
