---
"@barefootjs/jsx": patch
"@barefootjs/go-template": patch
"@barefootjs/erb": patch
"@barefootjs/jinja": patch
"@barefootjs/mojolicious": patch
"@barefootjs/pebble": patch
"@barefootjs/rust": patch
"@barefootjs/twig": patch
"@barefootjs/xslate": patch
"@barefootjs/blade": patch
---

An attribute bound directly to a signal whose value is `undefined` or `null` at SSR (`title={s()}`) is now omitted on every template adapter, as Hono omits it. Before, the template adapters rendered it empty (`title=""`). A signal counts as nullable when its type admits `undefined`/`null` (including a zero-arg `createSignal<T>()`) or when it is untyped and its initial value is a literal `undefined`/`null`. The new shared helpers `collectNullableSignalGetters` and `nullableSignalAttrGetter` in `@barefootjs/jsx` make that decision for every adapter.
