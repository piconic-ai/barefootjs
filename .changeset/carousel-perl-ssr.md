---
"@barefootjs/mojolicious": patch
"@barefootjs/xslate": patch
---

Render carousel demos byte-identical to the Hono SSR reference on the Perl adapters (#1971).

- **Both adapters:** an inline object-literal child prop (carousel's `opts={{ align: 'start' }}`) is now lowered to a Perl/Kolon hashref instead of being refused with BF101, so the child can serialize it for `data-opts`.
- **Mojolicious:** a `<Ctx.Provider value>` member that references a client-only function — a local handler const (`scrollPrev`) or a signal setter (`setCanScrollPrev`) — is now lowered to `undef` instead of an undeclared `$scrollPrev`, which previously tripped Perl strict mode at render time. Members that resolve to a prop / signal getter / memo are unaffected.

All three carousel demos now render byte-identical HTML on Mojolicious, Text::Xslate, Go, and Hono (covered by `carousel-cross-adapter.test.ts`).
