/**
 * SSR render-gap investigation, Part A hypothesis 5 (is solid's speed
 * architecturally explicable?) — NOT part of the product.
 *
 * Dumps the babel-preset-solid `generate: 'ssr'` compile of App.tsx (the
 * exact transform render-server.ts's ensureCompiled() runs) so the
 * compiled shape can be inspected directly rather than assumed.
 *
 * Usage: bun benchmarks/ssr/apps/solid/dump-compiled-ssr.ts
 *
 * Finding: App.tsx compiles to `_tmpl$`/`_tmpl$2` — plain arrays of
 * static string chunks, one per element — and the component body reduces
 * to `_$ssr(_tmpl$, ...interpolatedValues)`, i.e. array-of-strings +
 * value interpolation via straightforward concatenation
 * (solid-js/web/dist/server.js's `ssr()`: `result += t[i]; result +=
 * resolveSSRNode(node)`). No virtual DOM, no per-element object tree, no
 * diffing — this is architecturally why 1000-row SSR is ~0.2-0.5ms: it's
 * close to pure string-template interpolation, which is what the
 * "suspiciously fast" hypothesis predicted and this confirms.
 */
import { transformSync } from '@babel/core'
import { readFileSync } from 'node:fs'

const SRC = new URL('./src/App.tsx', import.meta.url).pathname
const source = readFileSync(SRC, 'utf8')
const result = transformSync(source, {
  filename: SRC,
  presets: [
    ['babel-preset-solid', { generate: 'ssr', hydratable: true }],
    ['@babel/preset-typescript', { isTSX: true, allExtensions: true }],
  ],
  babelrc: false,
  configFile: false,
})
console.log(result?.code)
