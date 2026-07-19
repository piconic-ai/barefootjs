---
'@barefootjs/jsx': minor
---

Union-typed runtime locale for the `toLocaleDateString` sugar (#2324's union stage): when the locale argument is a REQUIRED prop typed as a closed string-literal union (`locale: 'en-US' | 'ja-JP'`), every member's default date pattern resolves at build time and the pattern argument lowers to a ternary over the runtime value — runtime locale switching with zero runtime CLDR on any backend, on both the SSR and client-JS paths. Optional unions (undefined would read the host locale), open `string` locales, and unions with an unrepresentable member keep refusing with BF021.
