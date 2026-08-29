---
"@barefootjs/jsx": patch
"@barefootjs/client": patch
"@barefootjs/shared": patch
"@barefootjs/hono": patch
"@barefootjs/rust": patch
"@barefootjs/mojolicious": patch
"@barefootjs/xslate": patch
"@barefootjs/twig": patch
"@barefootjs/erb": patch
"@barefootjs/blade": patch
"@barefootjs/go-template": patch
"@barefootjs/jinja": patch
---

Collapse the row-key attribute (`data-key` / `data-key-N`) onto one IR-resolved field, `IRElement.keyAttr`, fixing #2753's two measured shapes: the client runtime stamping a positional-index `data-key` onto an unkeyed loop's rows that SSR never emits (Shape A), and the client stamping a second, plain `data-key` alongside SSR's depth-suffixed `data-key-N` on a nested loop's rows (Shape B).

`IRElement.keyAttr` replaces the `carriesDataKey` boolean (#2732/#2744) and is now the single decision every adapter and the client runtime reads, resolved once in `jsx-to-ir.ts`:

- Mechanism 1 (`applyLoopKeyAttr`): an element directly inside a `.map()` this component compiles inline gets `{ name: keyAttrName(loop.depth), value: <the key expression> }` — absent entirely for an unkeyed loop.
- Mechanism 2 (`resolveRootKeyAttr` + the existing `markDataKeyCarrier`): one of this component's own possible render roots (a plain element/if-statement-branch root, or a `needsScopeComment` fragment's first eligible element) gets `{ name: 'data-key' }` (no local value) to relay a key its OWN caller supplies at runtime.

All 9 SSR adapters now emit from `element.keyAttr` alone. Deleted per-adapter duplication this replaces: Hono's `loopKeyStack` (a mutated stack of loop keys) and its parallel `carriesDataKey`/`__dataKey` branch; every one of the other 8 adapters' `currentLoopKeyDepth` field (Go template: `loopKeyDepthStack`) and their `attr.name === 'key'` rewrite in `renderAttributes`; and the `rootScopeNodes`/`collectRootScopeNodes` duplication (byte-identical across 8 `lib/ir-scope.ts` copies) that fed each adapter's own `carriesDataKey` gate — that walk now lives once, in `jsx-to-ir.ts`'s `resolveRootKeyAttr`.

On the client runtime side (`map-array.ts`, `map-array-lazy.ts`, `component.ts`), every `data-key` stamp is now gated on the loop actually being keyed (`getKey` non-null) and reads/writes the SAME compiler-resolved attribute NAME (a new `keyAttrName` parameter, defaulting to `'data-key'` so every depth-0 call site is unchanged) instead of a hardcoded `BF_KEY`. An unkeyed loop's rows are never touched at all — `mapArray` keeps positional identity in its own `scopes` Map. The stale hydration-detection check this replaced (`!existingRanges[0]?.primaryEl.hasAttribute('data-key') || scopes.size === 0`) was already vacuous (`scopes` is always empty the one time that line runs); the new signal is simply `existingRanges.length > 0`.
