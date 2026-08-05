---
"@barefootjs/xyflow": patch
---

Stop shipping a source map with the xyflow browser bundle

`build:browser` passed `--sourcemap`, so `xyflow.browser.min.js` ended with
a `//# sourceMappingURL=` comment and the published tarball carried a
520 KB `xyflow.browser.min.js.map` next to it — the only production
artifact in the repo that still shipped one. Dropped the flag.

The bundle is unchanged otherwise (116.5 KB, 131 modules). `dist/*.d.ts.map`
declaration maps are untouched: those serve editor go-to-definition for TS
consumers and are never fetched by a browser.

App builds were already clean — a `vite build` through `@barefootjs/vite`
emits no `sourceMappingURL` and no `.map` (verified against
`integrations/hono`'s `dist/static/components/assets/`). Vite's dev server
still inlines a base64 map into each served module, which is what makes
DevTools show the original `.tsx` rather than compiled client JS; that is
dev-only and never reaches a production bundle.
