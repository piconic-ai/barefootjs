---
"@barefootjs/erb": patch
---

Fix `BarefootJS::Context.derive_vars_from_defaults` in the published Ruby runtime looking up caller props with a String `propName` (as JSON manifests parse it) against symbol-keyed runtime prop hashes (`JSON.parse(..., symbolize_names: true)`; compiled templates pass `{ children: ... }` literals) -- `props.key?("children")` was always false, so `register_components_from_manifest` silently fell back to the static `ssrDefaults` value for every manifest-registered child component, e.g. a Counter's three `<Button>` slots rendering with empty `children`. `propName` is now symbolized before the lookup (#2157).
