---
"@barefootjs/jsx": patch
"@barefootjs/hono": patch
---

Fix two type-level emission defects surfaced by the `ui/` corpus type-check gate (#2573)

- **`<svg>`-rooted component props** (icons, spinner): a new `SVGSVGAttributes`
  export (`@barefootjs/jsx`) gives components whose root is an `<svg>` a
  properly-narrowed `ref?: (element: SVGSVGElement) => void`, instead of the
  generic `HTMLBaseAttributes` whose `ref` targets `HTMLElement`. Spreading
  `HTMLBaseAttributes`-typed rest-props onto an `<svg>` element failed to
  type-check under `strictFunctionTypes` (`ref`'s param types are unrelated
  DOM interfaces) — every `IconXxx`/`Icon`/`Spinner` component's emitted
  `.tsx` template hit this (35 `TS2322` instances across the corpus). `ui/`'s
  `icon` and `spinner` components now extend `SVGSVGAttributes`. Type-only —
  no change to rendered output or runtime behavior.
- **Uninitialized `let`/`const` locals lost their type annotation on emit**:
  `generateSignalInitializers` (`packages/jsx/src/adapters/jsx-adapter.ts`,
  shared by every JSX-runtime adapter incl. Hono) re-declared a local with no
  initializer (e.g. `let emblaApi: EmblaCarouselType | undefined`) as a bare
  `let emblaApi`, discarding the source's type annotation and forcing
  implicit `any` (`TS7034`/`TS7005`) wherever the local was later read. Now
  carries `ConstantInfo.type.raw` through when `preserveTypes` is set.
- `ui/slider`: added an inline non-null assertion at the one genuine
  possibly-`undefined` read (`currentValue()` in `percentage()`) — TS can't
  see across `currentValue`'s own `isControlled() ? controlledValue() :
  internalValue()` ternary that the controlled branch is only live when
  `props.value` (and so `controlledValue()`) is defined. Type-only.

Ratchets the `corpus-typecheck.test.ts` allowlist: `icon TS2322` (34),
`spinner TS2322` (1), `carousel TS7005` (2), `carousel TS7034` (1), and
`slider TS2532` (1) all drop to zero. `chart`/`xyflow` entries are
unchanged — untouched by this PR (tracked in #2573).
