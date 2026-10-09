---
'@barefootjs/client': patch
---

`Context.Provider` is now typed to return `never` instead of `unknown` (#3372). Under the Hono runtime (`jsxImportSource: '@barefootjs/hono/jsx'`), `tsc` rejected `<Ctx.Provider>` in component source with TS2786 because `unknown` is not a valid `JSX.Element`. The stub only throws (the compiler lowers the provider to `provideContext()`), so `never` is the accurate return type and is assignable to every runtime's `JSX.Element`. The provider's `value` prop is still checked.
