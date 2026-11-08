---
"@barefootjs/jsx": minor
"@barefootjs/blade": patch
"@barefootjs/erb": patch
"@barefootjs/go-template": patch
"@barefootjs/jinja": patch
"@barefootjs/mojolicious": patch
"@barefootjs/pebble": patch
"@barefootjs/perl": patch
"@barefootjs/php": patch
"@barefootjs/rust": patch
"@barefootjs/twig": patch
"@barefootjs/xslate": patch
---

Completes the JS `undefined` rollout (spec/js-undefined-value.md, step U9). Every template runtime carries `undefined` apart from `null`, so the `carriesUndefined` flag is removed from `NativeSafeTable`, which is now the native-operator claims alone (a claim over the `unproven` proof is excluded by the type), together with `collapsesNil` and the collapsed branches of the plan. The numeric / scalar `either` BF101 (#3700) is gone with it: `arithmeticCoercionOrRefuse`, `targetArithmeticCoercion`, `refuseAmbiguousNilArithmetic`, `refuseAmbiguousNilMemoArithmetic`, `AmbiguousNilArithmeticSink`, `arithmeticOperandNilIsAmbiguous` and `ambiguousNilArithmeticOperands` are no longer exported, and `arithmeticOperandCoercion` returns `null` for an operand whose nil may be either, which the runtime's helper reads exactly. `rewriteNilReadings` / `rewriteNilReadingsDeep` no longer take a target, `NilReadingSite` no longer has `target`, and `collectNullableOptionalProps` no longer takes one. Compiled output of these is unchanged.

Three fixes ride along. An attribute bound to a signal seeded from an object prop's optional or nullable field (`createSignal(initial.label)`) is omitted when the field is `undefined` or `null`, instead of rendering `title=""`, on every DSL adapter. A static seed carries JS `undefined` through the SSR manifest: `extractSsrDefaults` writes an `undefined` array element or object member as the vector sentinel `{"$undef": true}` instead of `null`, and every runtime's seed (`_derive_stash_from_defaults` and its ports; the new `decode_undefined` / `BarefootJS.decode_undefined` / `BarefootJS::Undefined::decode_undefined` / `Undefined::decode` / `manifest::decode_undefined` helpers, Java's existing `JsonDecode.materialize`) decodes it to the runtime's undefined value, so `createSignal([undefined, 'x'])` reads `undefined` at index 0 and `createSignal({ b: undefined })` keeps `b` as a present key holding `undefined`. Go bakes such an element or map member as `bf.Undefined`. `@barefootjs/jsx` exports `encodeUndefinedMembers`, `decodeUndefinedMembers` and `UNDEFINED_SENTINEL`, and `deriveStashFromDefaults` decodes the sentinel. A destructured object prop whose type has a `T | null` / `T | undefined` field (`{ initial }: { initial: { label?: string | null } }`) is typed like its `props`-object form instead of `unknown`, so Go no longer refuses a signal seeded from that field.
