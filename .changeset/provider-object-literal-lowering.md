---
"@barefootjs/jsx": minor
"@barefootjs/mojolicious": minor
"@barefootjs/xslate": minor
---

Context-provider object-literal lowering for the Perl adapters (#1897):

- `@barefootjs/jsx` exports `parseProviderObjectLiteral`, a structural (TS AST) classifier for `<Ctx.Provider value={{ … }}>` members: zero-param expression-body arrows are getters (SSR snapshot of the body), other function shapes are client-only behavior, everything else is a plain expression.
- The Mojolicious and Xslate adapters lower object-literal provider values to Perl/Kolon hashrefs instead of refusing with BF101: getter members snapshot their body's SSR value, handler (`on[A-Z]`) and function-shaped members lower to `undef`/`nil`. Keys keep their JS names so consumer-side accesses map onto the same hashref keys.
- `ref={fn}` props on imported components are skipped at SSR like `on*` handlers (Hono renders neither; client JS wires them at hydration).

This un-pins the composed `site/ui` demo fixtures that were BF101-blocked on their context providers (`radio-group`, `accordion`, `dialog`, `popover`, `select`, `dropdown-menu`, `combobox`, `command`).
