# @barefootjs/client

## 0.10.1

### Patch Changes

- @barefootjs/shared@0.10.1

## 0.10.0

### Patch Changes

- @barefootjs/shared@0.10.0

## 0.9.6

### Patch Changes

- @barefootjs/shared@0.9.6

## 0.9.5

### Patch Changes

- @barefootjs/shared@0.9.5

## 0.9.4

### Patch Changes

- @barefootjs/shared@0.9.4

## 0.9.3

### Patch Changes

- @barefootjs/shared@0.9.3

## 0.9.2

### Patch Changes

- @barefootjs/shared@0.9.2

## 0.9.1

### Patch Changes

- @barefootjs/shared@0.9.1

## 0.9.0

### Patch Changes

- @barefootjs/shared@0.9.0

## 0.8.0

### Patch Changes

- @barefootjs/shared@0.8.0

## 0.7.0

### Patch Changes

- @barefootjs/shared@0.7.0

## 0.6.1

### Patch Changes

- @barefootjs/shared@0.6.1

## 0.6.0

### Patch Changes

- b24a1e6: Fix dropped component props in CSR render. A parent passing a non-statically-inlinable value (e.g. `Array.from(...)` or an init-scope local) as a prop to a child component emitted `renderChild('Child', {})` — silently dropping the prop — so the child's template read it eagerly and threw (`Cannot read properties of undefined`). Such children now defer to a placeholder + `upsertChild` (`createComponent` with the complete getter props), mirroring the existing clientOnly-conditional / loop-placeholder paths. SSR adapters are unaffected.
  - @barefootjs/shared@0.6.0

## 0.5.3

### Patch Changes

- 5842c03: `__bfSlot` now HTML-escapes its plain-string path, so text rendered inside a conditional `template()` branch is escaped to match the SSR output (closing the branch-text gap left by #1694, where only top-level text slots were escaped). The escape is applied on the string path only — live `Node` values still return raw `<!--bf-slot:N-->` markers for `insert()` to splice, so slotted content is preserved.
- 2c1f3ad: Client-render templates now HTML-escape interpolated attribute values (via a new `escapeAttr` runtime helper) to match the SSR adapters' attribute escaping (`& " ' < >`). Previously a dynamic attribute value containing `"`, `<`, `>`, or `&` — e.g. UnoCSS arbitrary variants like `[class*="size-"]` or `has-[>svg]` — was concatenated raw into the client template string, which corrupts attribute parsing when the template is inserted via `innerHTML` and diverges from the server-rendered bytes. Escaping at interpolation time is the only correct layer (a post-assembly pass can't tell a delimiter `"` from a value `"`).
- 5231cc8: Client-render templates now HTML-escape interpolated **text content** (the `<!--bf:sN-->${expr}<!--/-->` slots) via a new `escapeText` runtime helper — the parallel of the #1692 attribute-value fix. A string child containing `<` / `&` (e.g. `{user.name}`) was previously concatenated raw into the template string, which diverges from the SSR-escaped bytes and is a markup-injection vector when the template is inserted via `innerHTML`. Only the text-marker slots are escaped; bare `${children}` passthrough and `renderChild(...)` output are pre-rendered HTML and are left untouched. Hono escapes text with the same set as attribute values (`& " ' < >`), so `escapeText` delegates to the same operation for byte-parity with the conformance layer.
- d87144d: Handle `dangerouslySetInnerHTML` arriving through a spread/rest object in the runtime spread helpers (follow-up to the explicit-attribute support in #1704). `classifyDOMProp` now classifies it as a dedicated `innerHTML` kind; `spreadAttrs` skips it (so a spread carrying it no longer serialises a bogus `dangerouslySetInnerHTML="[object Object]"` attribute), and `applyRestAttrs` assigns the raw `el.innerHTML = value.__html` (the escape hatch) instead of `setAttribute`.
- Updated dependencies [d87144d]
  - @barefootjs/shared@0.5.3

## 0.5.2

### Patch Changes

- @barefootjs/shared@0.5.2

## 0.5.1

### Patch Changes

- 8742059: Fix two follow-up issues from the #1663 dynamic-dispatch work.

  `__bfText` could render both a stale element and fresh text in a conditional slot: that path re-resolves the anchor via `$t()` each run, which inserts a new text node before an element left by a previous Node-valued run. Writing a primitive now clears any remaining siblings up to the end marker, so switching JSX → text leaves only the text.

  The no-arg props default (`= {}`) is now asserted to the param's annotated type (`= {} as T`) in both the test and Hono adapters. `hasRequiredProps` treats a prop with a destructuring default as non-required, but the declared props type may still mark that field required, so a bare `= {}` failed `tsc` ("Property 'x' is missing in type '{}'..."). The destructuring defaults still supply the values at runtime.

- 9dcffdf: Compile JSX used as an object-literal arrow value and render dynamic dispatch (#1663).

  A `Record<K, () => JSX>` lookup map (`{ piconic: () => <BrandLogo/> }`) was never lowered: a module-level map had its const dropped from the emitted module (`ReferenceError` at SSR), and a function-local map leaked raw `<...>` into the client bundle (`SyntaxError: Unexpected token '<'`). The preprocessor now hoists arrow values in object-literal property assignments into synthesized components, the same lowering already applied to arrows in JSX-attribute position, so the lookup map survives as component references.

  Dynamic dispatch of such a map in child position (`<div>{themeLogo(props.id)}</div>`) now renders on the client: the dynamic-text effect routes through a new `__bfText` runtime helper that splices the live component element into the slot by identity instead of stringifying it to `"[object HTMLElement]"`. Adapters and `createComponent` default missing props to `{}` so a bare no-arg shim call (`LOGOS[id]()`) no longer crashes destructuring `undefined`.

- 113a17c: Reactive whole-item conditionals in loops (#1665).

  `arr.map(t => cond(t) && <li/>)` (and `cond ? <li/> : null`, `expr || <li/>`,
  `expr ?? <li/>`) makes the conditional the entire loop item, so an item renders
  0-or-1 element per pass. Previously this either threw at hydration (the loop's
  children stayed empty and the whole `.map(...)` was emitted verbatim as
  reactive text — uncompiled inline JSX, undeclared module-level helpers) or, once
  compiled, crashed at runtime (`firstElementChild.cloneNode` on a null element)
  or froze at its server-rendered value.

  This is now fully reactive, with identical behaviour whether the array is a
  `const` or a `signal()`:

  - **Runtime** — new `mapArrayAnchored` tracks each item by an always-present
    `<!--bf-loop-i:KEY-->` anchor comment (not a root element, which the item may
    not have); content lives between the anchor and the next anchor / loop end and
    is derived from the live DOM range each pass. `insert()` accepts the anchor as
    its scope so a whole-item conditional toggles range-scoped to its own item.
  - **Compiler** — detect the whole-item conditional, hoist the key from the
    rendering branch, emit per-item anchors plus a `mapArrayAnchored` renderItem;
    static-array bodies route through the same path. Logical (`&&`/`||`/`??`) and
    ternary JSX-helper map bodies are inlined, and BF023 now requires a key on
    those bodies.
  - **SSR adapters** — Hono, Go, and Mojo emit the per-item `bf-loop-i:KEY` anchor
    so server-rendered lists hydrate. Hono also emits `data-key` on the
    conditional branch's loop-item root, matching Go / CSR.

  Both-branch-element ternaries (`cond ? <A/> : <B/>`) render exactly one element
  and keep their existing `mapArray` path.

- Updated dependencies [113a17c]
  - @barefootjs/shared@0.5.1

## 0.5.0

### Patch Changes

- @barefootjs/shared@0.5.0

## 0.4.0

### Patch Changes

- @barefootjs/shared@0.4.0

## 0.3.0

### Patch Changes

- b136f8d: Remove internal @barefootjs/\* from published devDependencies to avoid npm registry dependency graph pollution
- 7e9570d: Fix CSR `render()` dropping all but the first root of a multi-root (fragment) component. `render()` now mounts every root element; for the multi-root case it recreates the SSR fragment layout (a `bf-scope:` comment marker before the sibling roots) so `$c()` resolves sibling child scopes via the comment range. The async hydration walk no longer re-initializes a `render()`'d fragment scope — the comment-scope path now honours `hydratedScopes`, matching the element-scope path — so multi-root components mount every root and initialize exactly once.
- 44c3466: Fix two mapArray bugs (#1627):

  - Hydration now removes orphaned SSR nodes when the client signal has fewer items than the server rendered.
  - Components created via `createComponent` (the CSR path mapArray takes for new loop items post-hydration) now thread their own scope id into `_parentScopeId`, so child components rendered by `renderChild` get parent-prefixed `bf-s`/`bf-h`/`bf-m` markers. This lets the component's init resolve them via `$c(scope, 'sN')` and wire up event handlers, matching the SSR convention.
  - @barefootjs/shared@0.3.0

## 0.2.0

### Patch Changes

- 2313724: Fix classifyDOMProp review issues: strict event detection, boolean attr DOM property handling, immutable BOOLEAN_ATTRS export
- bac95e6: Extract classifyDOMProp as single source of truth for DOM attribute vs JSX prop classification
- Updated dependencies [2313724]
- Updated dependencies [bac95e6]
- Updated dependencies [4e4d31a]
- Updated dependencies [bff7df6]
- Updated dependencies [31ce089]
- Updated dependencies [89a6ad5]
  - @barefootjs/shared@0.2.0
  - @barefootjs/jsx@0.2.0

## 0.1.3

### Patch Changes

- Updated dependencies [91523ba]
- Updated dependencies [a5a466c]
- Updated dependencies [a57e113]
  - @barefootjs/jsx@0.1.3
  - @barefootjs/shared@0.1.3

## 0.1.2

### Patch Changes

- @barefootjs/jsx@0.1.2
- @barefootjs/shared@0.1.2

## 0.1.1

### Patch Changes

- c896b8b: Fix published packages: resolve workspace:\* and point exports to dist/
- Updated dependencies [c896b8b]
  - @barefootjs/jsx@0.1.1
  - @barefootjs/shared@0.1.1
