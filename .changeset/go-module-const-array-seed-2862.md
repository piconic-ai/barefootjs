---
"@barefootjs/go-template": patch
---

Fix #2862: a signal seeded from a bare identifier referencing a module-level const whose value is an array-of-objects or object literal (`const INITIAL: Row[] = [...]; createSignal(INITIAL)`) baked to `nil` (or the struct zero value for a scalar object const) in the generated `New<Component>Props` constructor instead of the const's actual literal value — real `go run` SSR rendered an empty list where Hono renders every row. Same family as #2794 (string/numeric module consts) and #2815 (boolean module consts), fixed by PR #2816, but neither of those per-type resolvers ever covered an array/object literal.

Replaced the three separate per-type text-matching resolvers (`resolveModuleStringConst`'s numeric/boolean siblings) with one structural resolver, `resolveModuleConstAsGo`, dispatched off the const's `ConstantInfo.parsed` tree through the same `parsedLiteralToGo` door an inline `createSignal([...])`/`createSignal({...})` seed already takes — so a composite literal bakes through the identical, already-tested path regardless of whether it arrives directly or via a module-const alias hop. `resolveModuleStringConst` itself is unchanged (its fixed-point text resolution still covers a composed template-literal const that has no single structural literal to bake).
