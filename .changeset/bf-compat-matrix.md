---
"@barefootjs/cli": minor
"@barefootjs/jsx": patch
"@barefootjs/hono": patch
"@barefootjs/go-template": patch
"@barefootjs/erb": patch
"@barefootjs/jinja": patch
"@barefootjs/mojolicious": patch
"@barefootjs/xslate": patch
"@barefootjs/twig": patch
"@barefootjs/rust": patch
---

Add `bf compat [component…|--all] [--json|--md]` — a component × adapter compile-compatibility matrix. Each ui/ component is compiled in-process against every workspace `TemplateAdapter` (`compileJSX` + `generate()`), and collected diagnostics render as `✓ / BF10x` cells with known-limitation issue URLs attached. The `--all --json` output is committed as `ui/compat.lock.json` and CI regenerates + diffs it, so compatibility gains/losses are reviewed as PR diffs. The report asserts compile compatibility only — rendered-output parity remains owned by the adapter conformance suite and the eval vector corpus.

Supporting changes: `@barefootjs/jsx` exports `ConformancePin` / `ConformancePins` types, and each adapter package now exports its conformance `expectedDiagnostics` pin set as a structured `conformancePins` module (with `issue:` URLs) consumed by both its own conformance test and `bf compat`.
