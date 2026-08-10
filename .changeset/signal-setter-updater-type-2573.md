---
"@barefootjs/jsx": patch
---

Fix a type-level emission defect surfaced by the `ui/` corpus type-check gate (#2573): the SSR no-op signal setter stub was declared as `(..._args: any[]) => {}`. Calling it with an updater function (`setBars((prev) => [...prev, bar])`) put that arrow in a rest-`any[]` argument position rather than a function-typed one, so `tsc` had no contextual signature to infer the arrow's own parameter from and flagged it implicit-any (`TS7006`).

The stub now mirrors the real `createSignal<T>` setter's signature (`T | ((prev: T) => T)`, from `packages/client/src/reactive.ts`'s `Signal<T>`) whenever the signal's type is known — the same `SignalInfo.type` field the getter's own type assertion already reads — so updater-function call sites infer correctly. Falls back to the untyped rest-args stub when the type can't be resolved. Type-only — no change to rendered output or runtime behavior. Shared by every `JsxAdapter` subclass (Hono, the internal `TestAdapter`), so both benefit uniformly.

Ratchets the `corpus-typecheck.test.ts` allowlist: `chart TS7006` drops from 34 to 16 (the remaining 16 stem from a distinct, deeper mechanism — SSR context values typed `unknown` — tracked separately in #2573).
