---
"@barefootjs/jsx": patch
"@barefootjs/hono": patch
"@barefootjs/go-template": patch
"@barefootjs/blade": patch
"@barefootjs/erb": patch
"@barefootjs/jinja": patch
"@barefootjs/mojolicious": patch
"@barefootjs/pebble": patch
"@barefootjs/php": patch
"@barefootjs/rust": patch
"@barefootjs/twig": patch
"@barefootjs/xslate": patch
---

Fix the value-elided form of an async reactive factory declaration (`const [, save] = createMutation(...)`, `const [, fetchItems] = createQuery(...)`, #3245) leaking its synthesized internal getter name (`__bfGet_<action>`, analyzer.ts's `collectFactorySignal`) into server-facing output. Since nothing in the source ever references that name (it exists only so getter-keyed consumers like substitution env and SSR seeding stay total), it should never appear anywhere a backend author or the hydration wire format would see it — but it was still baked into the Hono/Test SSR module's getter stub, every template-stash adapter's SSR-defaults manifest and seed plan, and the Go adapter's generated props struct/constructor.

Each of those four sites now skips a signal whose value binding is both a `factory` and `getterElided`, matching the `bf debug graph` precedent already established for this shape (#3227's `debug.ts` filter). The action's own SSR stub (`Object.assign(() => {}, { isPending: () => false, error: () => undefined })`) is unaffected and still emitted whenever the source references it.
