---
"@barefootjs/jsx": patch
"@barefootjs/blade": patch
"@barefootjs/erb": patch
"@barefootjs/go-template": patch
"@barefootjs/jinja": patch
"@barefootjs/mojolicious": patch
"@barefootjs/pebble": patch
"@barefootjs/rust": patch
"@barefootjs/twig": patch
"@barefootjs/xslate": patch
---

The primitive plan now reads each target's `carriesUndefined` flag (`collapsesNil`). On a target that carries JS `undefined` apart from `null`, an operand Phase 1 does not prove takes the runtime helper (no native claim over an `unproven` operand), a numeric `n?: number | null` operand is no longer refused with BF101, a string `c?: string | null` operand is left to `to_string` / `plus`, and `x === null` / `x === undefined` / `x == null` plan as the new `is_null` / `is_undefined` / `is_nullish` tests, which every emitter refuses loudly until its runtime gains them. Every target still declares `false`, so compiled output is unchanged. The `ssrDefaults` manifest entry of a prop without a default no longer carries `"value": null`; every runtime's seed reads the missing `value` as its nil, so rendered output is unchanged.
