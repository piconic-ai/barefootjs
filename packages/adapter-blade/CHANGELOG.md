# @barefootjs/blade

## 0.18.4

### Patch Changes

- a9383fd: Lower JS string-concatenation `+` to the target language's concat operator on backends whose `+` is numeric-only. `'Hello, ' + name + '!'` reached Perl `+` (renders `0` — both strings numeric-coerce) and PHP `+` (fatals with "Unsupported operand types: string + string"). The string-typed-operand classification lives in the shared layer (`isStringTypedOperand` / `isStringConcatBinary`, exported from `@barefootjs/jsx` — promoted from the Mojo/Xslate adapters' local copies and extended with template-literal and nested-`+` arms); each emitter only maps the shared decision to its own operator: Perl EP `.`, Kolon `~`, Twig `~`, Blade `.`. The `string-concat-plus` fixture graduates from those four adapters' `renderDivergences` declarations (Jinja, minijinja, and ERB already concatenate natively; the Go adapter has the same symptom but lowers expressions through its own pipeline, so its entry stays for a follow-up).
- 23cc4dc: Normalize intrinsic-element attribute names ONCE in Phase 1: `IRAttribute.name` now carries the HTML/SVG attribute name, so every adapter emits it verbatim. The shared `dom-prop` classifier grows an `HTML_CAMEL_ALIASES` table (React-style camelCase → HTML: `tabIndex` → `tabindex`, `maxLength` → `maxlength`, `autoComplete` → `autocomplete`, `readOnly` → the boolean `readonly`, `spellCheck` → the enumerated `spellcheck`, …) consulted by both `toHTMLAttrName` (now applied in `jsx-to-ir`'s `processAttributes`) and `toHTMLAttrNameRuntime` (spread paths). Previously each adapter mapped at most `className` → `class` itself and every other alias leaked into the emitted HTML as an unknown attribute the browser ignores — `htmlFor` never became `for` (broken label association on template backends), `readOnly` rendered as `readOnly="true"` vs bare presence depending on backend, and SVG `strokeWidth`/`strokeLinecap` passed through unmapped. Component props (`IRProp`) keep the user's API names; unknown names (`data-*`, custom-element attributes, `viewBox`-style case-sensitive SVG XML names) pass through unchanged. The `camelcase-attributes`, `svg-icon`, and `boolean-attr-literals` fixtures graduate from every adapter's `renderDivergences` declaration and the CSR skip list.
- 438f2fe: Preserve source grouping when re-emitting binary expressions as infix template text. `(count() + 2) * 3` parses into an unambiguous `ParsedExpr` tree, but the EP/Jinja-family emitters joined operands textually (`l op r`), re-exposing the text to the target language's precedence — the SSR output silently computed `count + 2 * 3` (10 instead of 18) on Mojolicious, Text::Xslate, Twig, Jinja, Blade, and minijinja (ERB and Go already parenthesized). The grouping decision now lives in the shared layer as `groupBinaryOperand` (exported from `@barefootjs/jsx`): a compound operand (binary/logical/conditional) is parenthesized, leaf operands stay unwrapped so existing simple emissions are byte-identical. The `arithmetic-text` fixture graduates from those six adapters' `renderDivergences` declarations.
- Updated dependencies [23cc4dc]
  - @barefootjs/shared@0.18.4

## 0.18.3

### Patch Changes

- a46d4a5: Fold the JSX render-nothing literals in Phase 1: `{null}`, `{undefined}`, `{true}`, and `{false}` in child position now produce NO IR node, matching JSX semantics (`{0}` still renders "0"). Previously the literal fell through to the scalar-expression fallback and each backend stringified it its own way — the Hono reference rendered the text "null" for `{null}` while template adapters rendered "false" for `{false}` (the `falsy-text-values` divergence from the Priority-12 sweep). With the fold living in the IR producer, every adapter — including CSR client JS — agrees by construction; the fixture graduates from every adapter's `renderDivergences` declaration and the CSR skip list.
  - @barefootjs/shared@0.18.3

## 0.18.2

### Patch Changes

- 31372ca: Declare two build-time refusal contracts in every template adapter's conformance-pins set, surfaced by the Priority-12 edge-case conformance sweep: `dangerouslySetInnerHTML` (raw-HTML output needs a deliberate per-template-language affordance; the compiler already refuses the shape with BF101) and `String.prototype.replaceAll` (only first-occurrence `.replace` is wired to the runtime helpers; already refused with BF101 rather than silently reusing the first-only lowering). Test-contract metadata only — no adapter runtime or codegen behavior changes; the pins make the pre-existing refusals part of each adapter's asserted conformance surface (and visible to `bf compat`).
- 4c722c8: Publish each template adapter's render-level conformance divergences as a machine-readable `renderDivergences` export (new `RenderDivergences` type in `@barefootjs/jsx`) — the render-level sibling of `conformancePins`. The Priority-12 edge-case sweep (#2168) skipped fixtures that render differently from the Hono reference via per-test-file `skipJsx` literals, which made the docs compatibility matrix look all-green while divergences were only visible in test-file comments. Each adapter now declares those fixtures (with a one-line rationale) in `src/render-divergences.ts`; its conformance suite derives `skipJsx` from the same object so the published declaration and the test skips cannot drift, and `packages/compat` publishes both pins and render divergences in a new `fixtureDivergences` section of `ui/compat.lock.json`, rendered honestly on the docs compatibility-matrix page. No adapter runtime or codegen behavior changes.
  - @barefootjs/shared@0.18.2

## 0.18.1

### Patch Changes

- @barefootjs/shared@0.18.1

## 0.18.0

### Minor Changes

- 17dfdf8: New PHP backend adapter targeting Laravel Blade. `BladeAdapter` ports the Twig adapter's IR lowering to Blade syntax (`{!! e(…) !!}` / `@if` / `@elseif` / `@foreach`), and the package bundles a PHP runtime backend (`packages/adapter-blade/php/`) built on `illuminate/view` standalone (Filesystem + Dispatcher + EngineResolver/BladeCompiler + FileViewFinder + Factory) — a `BladeBackend` implementing the engine backend contract (`encode_json`, `mark_raw`, `materialize`, `render_named`, `ident`) on top of the shared engine-agnostic runtime (`@barefootjs/php`). Templates call the same snake_case `bf.<helper>` surface as the other PHP/Perl/Python adapters, with `bf.truthy` / `bf.eq` / `bf.neq` covering JS-vs-PHP semantic divergences (PHP truthiness, and PHP's `==`/`===` not matching JS strict equality).

### Patch Changes

- @barefootjs/shared@0.18.0
